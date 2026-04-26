import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDM } from "../contexts/DMContext";
import { useVoice } from "../contexts/VoiceContext";
import { api } from "../lib/api";
import { Avatar } from "../components/Avatar";
import { Ico } from "../components/icons";
import { formatTime } from "../components/MessageItem";

export function DMPage() {
  const { userId } = useParams<{ userId: string }>();
  const { token } = useAuth();
  const { friends, dmMessages, sendDM, sendCallInvite, loadDMMessages } = useDM();
  const { activeRoomName, connectDM, disconnect } = useVoice();
  const [input, setInput] = useState("");
  const [calling, setCalling] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const friend = friends.find((f) => f.id === userId);
  const messages = userId ? (dmMessages[userId] ?? []) : [];

  useEffect(() => {
    if (userId) loadDMMessages(userId);
  }, [userId, loadDMMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !userId) return;
    sendDM(userId, input.trim());
    setInput("");
  }

  async function handleCall() {
    if (!token || !userId || calling) return;
    setCalling(true);
    try {
      sendCallInvite(userId);
      const { token: lkToken, url, roomName } = await api.getCallToken(token, userId);
      await connectDM(lkToken, url, roomName);
    } catch {
      setCalling(false);
    }
  }

  function handleEndCall() {
    disconnect();
    setCalling(false);
  }

  const inCall = !!activeRoomName && activeRoomName.startsWith("dm-");

  return (
    <div className="dm-page">
      <div className="dm-header">
        {friend && <Avatar name={friend.username} id={friend.id} size={32} />}
        <span className="dm-header-name">{friend?.username ?? userId}</span>
        <div className="dm-header-actions">
          {inCall ? (
            <button className="dm-call-btn active" onClick={handleEndCall} title="Encerrar chamada">
              <Ico.headphonesOff />
              Encerrar
            </button>
          ) : (
            <button className="dm-call-btn" onClick={handleCall} disabled={calling} title="Iniciar chamada de voz">
              <Ico.headphones />
              Chamar
            </button>
          )}
        </div>
      </div>

      <div className="dm-messages">
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const grouped = prev && prev.authorId === msg.authorId &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
          return (
            <div key={msg.id} className={`dm-msg${grouped ? " grouped" : ""}`}>
              {!grouped && <Avatar name={msg.authorName} id={msg.authorId} size={32} />}
              <div className="dm-msg-body">
                {!grouped && (
                  <span className="dm-msg-author">{msg.authorName}</span>
                )}
                <span className="dm-msg-content">{msg.content}</span>
                <span className="dm-msg-time">{formatTime(msg.createdAt)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="dm-input-row" onSubmit={handleSend}>
        <input
          className="dm-input"
          placeholder={`Mensagem para ${friend?.username ?? "…"}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="dm-send-btn" disabled={!input.trim()}>
          <Ico.send />
        </button>
      </form>
    </div>
  );
}
