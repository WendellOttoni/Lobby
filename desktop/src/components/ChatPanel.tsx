import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

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
  onToggleMembers?: () => void;
  membersVisible?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const CHANNEL_NAME = "geral";

function wsUrl(): string {
  return API_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function shouldGroup(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev || prev.authorId !== curr.authorId) return false;
  if (!sameCalendarDay(prev.createdAt, curr.createdAt)) return false;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
}

export function ChatPanel({
  serverId,
  token,
  currentUserId,
  onToggleMembers,
  membersVisible,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleMarkRead() {
    if (markReadTimer.current) return;
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null;
      api.markServerRead(token, serverId).catch(() => {});
    }, 1500);
  }

  useEffect(() => {
    setMessages([]);
    setHistoryLoaded(false);
    let cancelled = false;
    let retryDelay = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function mergeHistory(prev: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
      const seen = new Set(prev.map((m) => m.id));
      const merged = [...prev];
      for (const m of incoming) {
        if (!seen.has(m.id)) merged.push(m);
      }
      return merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    function open() {
      if (cancelled) return;
      const url = `${wsUrl()}/servers/${serverId}/ws?token=${token}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      let openedAt = 0;

      ws.onopen = () => {
        openedAt = Date.now();
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        if (cancelled) return;
        if (openedAt && Date.now() - openedAt > 5000) retryDelay = 2000;
        retryTimer = setTimeout(open, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "history") {
          setMessages((prev) => mergeHistory(prev, data.messages));
          setHistoryLoaded(true);
        } else if (data.type === "message") {
          setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
          if (data.authorId !== currentUserId) {
            scheduleMarkRead();
          }
        }
      };
    }

    open();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (markReadTimer.current) {
        clearTimeout(markReadTimer.current);
        markReadTimer.current = null;
      }
      wsRef.current?.close();
    };
  }, [serverId, token, currentUserId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  function send(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "message", content: trimmed }));
    setInput("");
    inputRef.current?.focus();
  }

  const hasContent = input.trim().length > 0;

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-tile">
          <Ico.hash />
        </div>
        <div className="chat-header-title">
          <div className="chat-header-name">#{CHANNEL_NAME}</div>
          <div className="chat-header-sub">Canal geral — conversa do servidor</div>
        </div>
        <div className="chat-header-spacer" />
        <button className="chat-header-btn" title="Fixados">
          <Ico.pin />
        </button>
        <button
          className={`chat-header-btn${membersVisible ? " active" : ""}`}
          title="Membros"
          onClick={onToggleMembers}
        >
          <Ico.users />
        </button>
        <div className="chat-header-divider" />
        <span className={`chat-header-pill ${connected ? "good" : "warn"}`}>
          <span className="chat-header-pill-dot" />
          {connected ? "Conectado" : "Reconectando"}
        </span>
      </div>

      <div className="chat-scroll">
        <div className="chat-intro">
          <div className="chat-intro-tile">
            <Ico.hash />
          </div>
          <h2>
            Bem-vindo ao <span className="brand-text">#{CHANNEL_NAME}</span>
          </h2>
          <p>
            Este é o começo do canal. Converse com quem tá por aqui, mande um convite de voz, ou abra uma sala.
          </p>
        </div>

        {!historyLoaded && (
          <div className="chat-skeleton">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="chat-skeleton-row">
                <div className="chat-skeleton-avatar skeleton-box" />
                <div className="chat-skeleton-body">
                  <span className="skeleton-line skeleton-line-short" />
                  <span className="skeleton-line" />
                </div>
              </div>
            ))}
          </div>
        )}

        {historyLoaded && messages.length === 0 && (
          <div className="chat-empty">
            <p>Nenhuma mensagem ainda.</p>
            <p>Seja o primeiro a falar!</p>
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const grouped = shouldGroup(prev, msg);
          const showDate = i === 0 || !prev || !sameCalendarDay(prev.createdAt, msg.createdAt);
          return (
            <Message
              key={msg.id}
              msg={msg}
              grouped={grouped}
              showDate={showDate}
            />
          );
        })}
        <div ref={bottomRef} style={{ height: 12 }} />
      </div>

      <div className="chat-input-wrap">
        <form className="chat-input-shell" onSubmit={send}>
          <button type="button" className="chat-input-btn" title="Anexar">
            <Ico.attach />
          </button>
          <input
            ref={inputRef}
            placeholder={connected ? `Escreva em #${CHANNEL_NAME}…` : "Conectando..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            disabled={!connected}
            autoComplete="off"
          />
          <button type="button" className="chat-input-btn" title="Emoji">
            <Ico.emoji />
          </button>
          <button
            type="submit"
            className={`chat-input-send${hasContent ? " has-content" : ""}`}
            disabled={!hasContent || !connected}
            title="Enviar"
          >
            <Ico.send />
          </button>
        </form>
        <div className="chat-input-hint">
          <strong>enter</strong> para enviar · <strong>shift+enter</strong> nova linha
        </div>
      </div>
    </div>
  );
}

function Message({
  msg,
  grouped,
  showDate,
}: {
  msg: ChatMessage;
  grouped: boolean;
  showDate: boolean;
}) {
  const isInvite = msg.content.startsWith("lobby://join/");
  const inviteCode = isInvite ? msg.content.replace("lobby://join/", "").trim() : null;

  return (
    <>
      {showDate && (
        <div className="chat-date">
          <div className="chat-date-line" />
          <span className="chat-date-label">{formatDateLabel(msg.createdAt)}</span>
          <div className="chat-date-line" />
        </div>
      )}
      <div className={`chat-msg${grouped ? " grouped" : ""}`}>
        {!grouped ? (
          <Avatar name={msg.authorName} id={msg.authorId} size={38} />
        ) : (
          <div className="chat-msg-grouped-spacer">
            <span className="chat-msg-grouped-time">{formatTime(msg.createdAt)}</span>
          </div>
        )}
        <div className="chat-msg-body">
          {!grouped && (
            <div className="chat-msg-head">
              <span className="chat-msg-author">{msg.authorName}</span>
              <span className="chat-msg-time">{formatTime(msg.createdAt)}</span>
            </div>
          )}
          {isInvite && inviteCode ? (
            <InviteEmbed code={inviteCode} />
          ) : (
            <p className="chat-msg-content">{msg.content}</p>
          )}
        </div>
      </div>
    </>
  );
}

function InviteEmbed({ code }: { code: string }) {
  return (
    <div className="invite-embed">
      <div className="invite-embed-stripe" />
      <div className="invite-embed-tile">
        <Ico.link />
      </div>
      <div className="invite-embed-text">
        <div className="invite-embed-label">Convite de sala</div>
        <div className="invite-embed-code">{code}</div>
      </div>
      <button
        className="invite-embed-btn"
        onClick={() => {
          navigator.clipboard.writeText(`lobby://join/${code}`);
        }}
        title="Copiar link"
      >
        Entrar →
      </button>
    </div>
  );
}
