import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { api, DMMessage, FriendUser, FriendRequest, OutgoingRequest } from "../lib/api";

interface IncomingCall {
  from: FriendUser;
  roomName: string;
}

interface DMContextValue {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: OutgoingRequest[];
  incomingCall: IncomingCall | null;
  dmMessages: Record<string, DMMessage[]>;
  sendDM: (toUserId: string, content: string) => void;
  sendCallInvite: (toUserId: string) => void;
  sendCallDecline: (toUserId: string) => void;
  sendCallEnded: (toUserId: string) => void;
  dismissCall: () => void;
  loadDMMessages: (userId: string, before?: string) => Promise<void>;
  refreshFriends: () => Promise<void>;
}

const DMContext = createContext<DMContextValue | null>(null);

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function DMProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([]);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [dmMessages, setDMMessages] = useState<Record<string, DMMessage[]>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const refreshFriends = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.listFriends(token);
      setFriends(data.friends);
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    refreshFriends();

    const wsUrl = API_URL.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/user/ws?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "dm") {
          const msg: DMMessage = data;
          const otherId = msg.authorId === user?.id ? msg.recipientId : msg.authorId;
          if (!otherId) return;
          setDMMessages((prev) => {
            const existing = prev[otherId] ?? [];
            if (existing.some((m) => m.id === msg.id)) return prev;
            return { ...prev, [otherId]: [...existing, msg] };
          });
          return;
        }

        if (data.type === "friend_request") {
          setIncoming((prev) => {
            if (prev.some((r) => r.id === data.id)) return prev;
            return [...prev, { id: data.id, from: data.from }];
          });
          return;
        }

        if (data.type === "friend_accepted") {
          setFriends((prev) => {
            if (prev.some((f) => f.id === data.friend.id)) return prev;
            return [...prev, data.friend];
          });
          setOutgoing((prev) => prev.filter((r) => r.to.id !== data.friend.id));
          return;
        }

        if (data.type === "call_invite") {
          setIncomingCall({ from: data.from, roomName: data.roomName });
          return;
        }

        if (data.type === "call_declined" || data.type === "call_ended") {
          setIncomingCall(null);
          return;
        }
      } catch {}
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [token, user?.id, refreshFriends]);

  function sendDM(toUserId: string, content: string) {
    wsRef.current?.send(JSON.stringify({ type: "dm", to: toUserId, content }));
  }

  function sendCallInvite(toUserId: string) {
    wsRef.current?.send(JSON.stringify({ type: "call_invite", to: toUserId }));
  }

  function sendCallDecline(toUserId: string) {
    wsRef.current?.send(JSON.stringify({ type: "call_decline", to: toUserId }));
  }

  function sendCallEnded(toUserId: string) {
    wsRef.current?.send(JSON.stringify({ type: "call_ended", to: toUserId }));
  }

  function dismissCall() {
    setIncomingCall(null);
  }

  const loadDMMessages = useCallback(async (userId: string, before?: string) => {
    if (!token) return;
    try {
      const data = await api.getDMMessages(token, userId, before);
      setDMMessages((prev) => {
        if (before) {
          const existing = prev[userId] ?? [];
          return { ...prev, [userId]: [...data.messages, ...existing] };
        }
        return { ...prev, [userId]: data.messages };
      });
    } catch {}
  }, [token]);

  return (
    <DMContext.Provider value={{
      friends, incoming, outgoing, incomingCall, dmMessages,
      sendDM, sendCallInvite, sendCallDecline, sendCallEnded, dismissCall,
      loadDMMessages, refreshFriends,
    }}>
      {children}
    </DMContext.Provider>
  );
}

export function useDM() {
  const ctx = useContext(DMContext);
  if (!ctx) throw new Error("useDM fora do DMProvider");
  return ctx;
}
