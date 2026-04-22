import { FormEvent, useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

interface Props {
  serverId: string;
  token: string;
  currentUserId: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

function wsUrl(): string {
  return API_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function shouldGroup(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev || prev.authorId !== curr.authorId) return false;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
}

const AVATAR_COLORS = [
  "#5865f2", "#3ba55d", "#faa61a", "#ed4245",
  "#00b0f4", "#a660e8", "#f47b67", "#43b581",
];

function avatarBg(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ChatPanel({ serverId, token, currentUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const url = `${wsUrl()}/servers/${serverId}/ws?token=${token}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "history") {
        setMessages(data.messages);
      } else if (data.type === "message") {
        setMessages((prev) => [...prev, data]);
      }
    };

    return () => ws.close();
  }, [serverId, token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", content: trimmed }));
    setInput("");
    inputRef.current?.focus();
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span className="chat-header-icon">#</span>
        <span className="chat-header-name">geral</span>
        <span className={`chat-status ${connected ? "online" : "offline"}`}>
          {connected ? "conectado" : "reconectando..."}
        </span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Nenhuma mensagem ainda.</p>
            <p>Seja o primeiro a falar!</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const grouped = shouldGroup(messages[i - 1], msg);
          const isOwn = msg.authorId === currentUserId;
          return (
            <div key={msg.id} className={`chat-msg ${grouped ? "grouped" : ""}`}>
              {!grouped && (
                <div
                  className="chat-avatar"
                  style={{ background: avatarBg(msg.authorId) }}
                >
                  {avatarInitials(msg.authorName)}
                </div>
              )}
              {grouped && <div className="chat-avatar-placeholder" />}
              <div className="chat-msg-body">
                {!grouped && (
                  <div className="chat-msg-header">
                    <span className={`chat-author ${isOwn ? "own" : ""}`}>
                      {msg.authorName}
                    </span>
                    <span className="chat-time">{formatTime(msg.createdAt)}</span>
                  </div>
                )}
                <p className="chat-content">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-area" onSubmit={send}>
        <input
          ref={inputRef}
          placeholder={connected ? "Mensagem para #geral..." : "Conectando..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          disabled={!connected}
          autoComplete="off"
        />
        <button type="submit" disabled={!input.trim() || !connected}>
          Enviar
        </button>
      </form>
    </div>
  );
}
