import { FormEvent, useEffect, useRef, useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  authorId: string;
  authorName: string;
}

interface Props {
  serverId: string;
  token: string;
  currentUserId: string;
  isOwner: boolean;
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

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;
const MEDIA_HOSTS = /(tenor\.com|giphy\.com|media\.tenor\.com|media\.giphy\.com|media[0-9]?\.giphy\.com|imgur\.com|i\.imgur\.com)/i;

function extractMedia(content: string): { url: string; isTenorEmbed: boolean } | null {
  const matches = content.match(URL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    const url = raw.replace(/[),.;!?]+$/, "");
    if (IMG_EXT_RE.test(url)) return { url, isTenorEmbed: false };
    if (MEDIA_HOSTS.test(url)) return { url, isTenorEmbed: true };
  }
  return null;
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
  isOwner,
  onToggleMembers,
  membersVisible,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function send(payload: object): boolean {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  function startEdit(msg: ChatMessage) {
    setEditingId(msg.id);
    setEditDraft(msg.content);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  function commitEdit() {
    if (!editingId) return;
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    const original = messages.find((m) => m.id === editingId);
    if (original && trimmed !== original.content) {
      send({ type: "edit", id: editingId, content: trimmed });
    }
    cancelEdit();
  }

  function deleteMessage(id: string) {
    if (!window.confirm("Apagar esta mensagem?")) return;
    send({ type: "delete", id });
  }

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
        } else if (data.type === "edit") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.id ? { ...m, content: data.content, editedAt: data.editedAt } : m
            )
          );
        } else if (data.type === "delete") {
          setMessages((prev) => prev.filter((m) => m.id !== data.id));
          setEditingId((id) => (id === data.id ? null : id));
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

  function sendForm(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (send({ type: "message", content: trimmed })) {
      setInput("");
      inputRef.current?.focus();
    }
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
          const isAuthor = msg.authorId === currentUserId;
          return (
            <Message
              key={msg.id}
              msg={msg}
              grouped={grouped}
              showDate={showDate}
              canEdit={isAuthor}
              canDelete={isAuthor || isOwner}
              isEditing={editingId === msg.id}
              editDraft={editDraft}
              onStartEdit={() => startEdit(msg)}
              onCancelEdit={cancelEdit}
              onCommitEdit={commitEdit}
              onChangeEdit={setEditDraft}
              onDelete={() => deleteMessage(msg.id)}
            />
          );
        })}
        <div ref={bottomRef} style={{ height: 12 }} />
      </div>

      <div className="chat-input-wrap">
        {showEmoji && (
          <div className="chat-emoji-popover">
            <EmojiPicker
              theme={Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              skinTonesDisabled
              searchPlaceholder="Buscar emoji..."
              width="100%"
              height={340}
              onEmojiClick={(data) => {
                setInput((v) => v + data.emoji);
                setShowEmoji(false);
                inputRef.current?.focus();
              }}
            />
          </div>
        )}
        <form className="chat-input-shell" onSubmit={sendForm}>
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
          <button
            type="button"
            className={`chat-input-btn${showEmoji ? " active" : ""}`}
            title="Emoji"
            onClick={() => setShowEmoji((v) => !v)}
          >
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

interface MessageProps {
  msg: ChatMessage;
  grouped: boolean;
  showDate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isEditing: boolean;
  editDraft: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onChangeEdit: (v: string) => void;
  onDelete: () => void;
}

function Message({
  msg,
  grouped,
  showDate,
  canEdit,
  canDelete,
  isEditing,
  editDraft,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onChangeEdit,
  onDelete,
}: MessageProps) {
  const isInvite = msg.content.startsWith("lobby://join/");
  const inviteCode = isInvite ? msg.content.replace("lobby://join/", "").trim() : null;
  const media = !isInvite && !isEditing ? extractMedia(msg.content) : null;
  const contentIsOnlyUrl = media && msg.content.trim() === media.url;

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
          {isEditing ? (
            <div className="chat-msg-edit">
              <textarea
                value={editDraft}
                onChange={(e) => onChangeEdit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit();
                  } else if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onCommitEdit();
                  }
                }}
                maxLength={2000}
                autoFocus
                rows={Math.min(6, Math.max(1, editDraft.split("\n").length))}
              />
              <div className="chat-msg-edit-hint">
                <button type="button" className="btn-secondary" onClick={onCancelEdit}>
                  Cancelar
                </button>
                <button type="button" onClick={onCommitEdit} disabled={!editDraft.trim()}>
                  Salvar
                </button>
                <span>
                  <strong>esc</strong> cancelar · <strong>enter</strong> salvar
                </span>
              </div>
            </div>
          ) : isInvite && inviteCode ? (
            <InviteEmbed code={inviteCode} />
          ) : (
            <>
              {!contentIsOnlyUrl && (
                <p className="chat-msg-content">
                  {msg.content}
                  {msg.editedAt && <span className="chat-msg-edited"> (editado)</span>}
                </p>
              )}
              {media && <MediaEmbed url={media.url} />}
              {contentIsOnlyUrl && msg.editedAt && (
                <span className="chat-msg-edited">(editado)</span>
              )}
            </>
          )}
        </div>
        {!isEditing && (canEdit || canDelete) && (
          <div className="chat-msg-actions">
            {canEdit && (
              <button
                type="button"
                className="chat-msg-action-btn"
                title="Editar"
                onClick={onStartEdit}
              >
                <Ico.edit />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="chat-msg-action-btn danger"
                title="Apagar"
                onClick={onDelete}
              >
                <Ico.trash />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function MediaEmbed({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="chat-msg-link" href={url} target="_blank" rel="noreferrer">
        {url}
      </a>
    );
  }
  return (
    <a className="chat-media" href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="" loading="lazy" onError={() => setFailed(true)} />
    </a>
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
