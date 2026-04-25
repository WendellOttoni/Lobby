import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { Highlight, themes } from "prism-react-renderer";
import { api } from "../lib/api";
import { playMessageSound } from "../lib/sounds";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

interface ReactionCount {
  emoji: string;
  count: number;
  userIds: string[];
}

interface ReplySnippet {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
}

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  authorId: string;
  authorName: string;
  channelId: string | null;
  replyTo: ReplySnippet | null;
  reactions: ReactionCount[];
}

interface Props {
  serverId: string;
  token: string;
  currentUserId: string;
  currentUsername: string;
  isOwner: boolean;
  channelId: string | null;
  channelName: string;
  onToggleMembers?: () => void;
  onOpenPins?: () => void;
  onChannelMessage?: (channelId: string | null, authorId: string) => void;
  membersVisible?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

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
  if (curr.replyTo) return false;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
}

const FORMAT_RE = /```(?:(\w+)\n)?([\s\S]+?)```|`([^`\n]+?)`|\*\*([^*\n]+?)\*\*|_([^_\n]+?)_|(@\w+)/g;

function CodeBlock({ lang, code }: { lang: string | undefined; code: string }) {
  return (
    <Highlight theme={themes.vsDark} code={code.replace(/\n$/, "")} language={lang ?? "text"}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre className={`chat-msg-codeblock ${className}`} style={style}>
          {lang && <span className="chat-msg-codeblock-lang">{lang}</span>}
          <code>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, j) => (
                  <span key={j} {...getTokenProps({ token })} />
                ))}
              </div>
            ))}
          </code>
        </pre>
      )}
    </Highlight>
  );
}

function formatMessage(text: string, currentUsername: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  FORMAT_RE.lastIndex = 0;
  while ((m = FORMAT_RE.exec(text)) !== null) {
    if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
    if (m[2] !== undefined) {
      nodes.push(<CodeBlock key={key++} lang={m[1]} code={m[2]} />);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={key++} className="chat-msg-code">{m[3]}</code>);
    } else if (m[4] !== undefined) {
      nodes.push(<strong key={key++}>{m[4]}</strong>);
    } else if (m[5] !== undefined) {
      nodes.push(<em key={key++}>{m[5]}</em>);
    } else if (m[6] !== undefined) {
      const isSelf = m[6].slice(1).toLowerCase() === currentUsername.toLowerCase();
      nodes.push(
        <span key={key++} className={`chat-mention${isSelf ? " self" : ""}`}>
          {m[6]}
        </span>
      );
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return nodes;
}

export function ChatPanel({
  serverId,
  token,
  currentUserId,
  currentUsername,
  isOwner,
  channelId,
  channelName,
  onToggleMembers,
  onOpenPins,
  onChannelMessage,
  membersVisible,
}: Props) {
  const onChannelMessageRef = useRef(onChannelMessage);
  useEffect(() => { onChannelMessageRef.current = onChannelMessage; }, [onChannelMessage]);
  const channelIdRef = useRef(channelId);
  useEffect(() => { channelIdRef.current = channelId; }, [channelId]);
  const currentUsernameRef = useRef(currentUsername);
  useEffect(() => { currentUsernameRef.current = currentUsername; }, [currentUsername]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [typers, setTypers] = useState<Record<string, string>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: string; content: string; createdAt: string; authorId: string; authorName: string }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prependAnchorRef = useRef<{ height: number; top: number } | null>(null);

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  useEffect(() => { autoResize(); }, [input]);
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

  async function togglePin(msg: ChatMessage) {
    try {
      await api.pinMessage(token, serverId, msg.id);
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 409) {
        await api.unpinMessage(token, serverId, msg.id).catch(() => {});
      }
    }
  }

  function scheduleMarkRead() {
    if (markReadTimer.current) return;
    markReadTimer.current = setTimeout(() => {
      markReadTimer.current = null;
      if (channelId === null) {
        api.markServerRead(token, serverId).catch(() => {});
      } else {
        api.markChannelRead(token, serverId, channelId).catch(() => {});
      }
    }, 1500);
  }

  function scrollToMessage(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("chat-msg-flash");
      setTimeout(() => el.classList.remove("chat-msg-flash"), 1500);
    }
  }

  useEffect(() => {
    setMessages([]);
    setHistoryLoaded(false);
    setReplyTo(null);
    setTypers({});
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
        ws.send(JSON.stringify({ type: "selectChannel", channelId: channelIdRef.current }));
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
        const activeChannelId = channelIdRef.current;
        if (data.type === "history") {
          const incoming: ChatMessage[] = data.messages;
          const targetChannelId = "channelId" in data ? data.channelId : null;
          if (targetChannelId !== activeChannelId) return;
          if (data.replace) {
            setMessages(incoming);
            setHasMore(incoming.length >= 80);
            setHistoryLoaded(true);
          } else if (data.prepend) {
            const sc = scrollRef.current;
            if (sc) prependAnchorRef.current = { height: sc.scrollHeight, top: sc.scrollTop };
            setMessages((prev) => mergeHistory(incoming, prev));
            setHasMore(incoming.length >= 40);
            setLoadingMore(false);
          } else {
            setMessages((prev) => mergeHistory(prev, incoming));
            setHasMore(incoming.length >= 80);
            setHistoryLoaded(true);
          }
        } else if (data.type === "message") {
          const msg = data as ChatMessage & { type: string };
          if (msg.channelId === activeChannelId) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          }
          if (msg.authorId !== currentUserId) {
            onChannelMessageRef.current?.(msg.channelId, msg.authorId);
            if (msg.channelId === activeChannelId) {
              scheduleMarkRead();
              const mentioned = msg.content.includes(`@${currentUsernameRef.current}`);
              if (document.hidden || mentioned) playMessageSound();
            }
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
          setReplyTo((r) => (r?.id === data.id ? null : r));
        } else if (data.type === "reactions") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === data.messageId ? { ...m, reactions: data.reactions } : m
            )
          );
        } else if (data.type === "typing") {
          if (data.channelId !== activeChannelId) return;
          setTypers((prev) => {
            const next = { ...prev };
            if (data.typing) next[data.userId] = data.username;
            else delete next[data.userId];
            return next;
          });
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
    setMessages([]);
    setHistoryLoaded(false);
    setReplyTo(null);
    setTypers({});
    setHasMore(false);
    setLoadingMore(false);
    if (markReadTimer.current) {
      clearTimeout(markReadTimer.current);
      markReadTimer.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "selectChannel", channelId }));
    }
  }, [channelId]);

  useEffect(() => {
    let cancelled = false;
    api.listMembers(token, serverId)
      .then(({ members }) => { if (!cancelled) setMembers(members.map((m) => m.username)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId, token]);

  useEffect(() => {
    const anchor = prependAnchorRef.current;
    if (anchor) {
      const sc = scrollRef.current;
      if (sc) sc.scrollTop = anchor.top + (sc.scrollHeight - anchor.height);
      prependAnchorRef.current = null;
      return;
    }
    if (!loadingMore) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [messages]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setReplyTo(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  async function runSearch(q: string) {
    if (q.trim().length < 2) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const { results } = await api.searchMessages(token, serverId, q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function loadMore() {
    if (loadingMore || !hasMore) return;
    const channelMessages = messages.filter((m) => m.channelId === channelId);
    if (channelMessages.length === 0) return;
    const firstId = channelMessages[0].id;
    if (send({ type: "loadMore", before: firstId, channelId })) {
      setLoadingMore(true);
    }
  }

  function notifyTyping() {
    if (!input.trim()) return;
    if (typingTimerRef.current) return;
    send({ type: "typing", channelId });
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 3000);
  }

  function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed) return;
    const payload: Record<string, unknown> = { type: "message", content: trimmed, channelId };
    if (replyTo) payload.replyToId = replyTo.id;
    if (send(payload)) {
      setInput("");
      setReplyTo(null);
      inputRef.current?.focus();
    }
  }

  function sendForm(e: FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  const hasContent = input.trim().length > 0;
  const visibleMessages = messages.filter((m) => m.channelId === channelId);

  return (
    <div className="chat-panel">
      {searchOpen && (
        <div className="chat-search-bar">
          <Ico.search />
          <input
            ref={searchInputRef}
            placeholder="Buscar mensagens... (Esc para fechar)"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); }}
            autoComplete="off"
          />
          {searching && <span className="chat-search-spinner">…</span>}
          <button type="button" onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults(null); }}>
            <Ico.close />
          </button>
        </div>
      )}
      {searchOpen && searchResults !== null && (
        <div className="chat-search-results">
          {searchResults.length === 0 && <p className="chat-search-empty">Nenhum resultado.</p>}
          {searchResults.map((r) => (
            <div key={r.id} className="chat-search-result">
              <span className="chat-search-result-author">{r.authorName}</span>
              <span className="chat-search-result-time">{formatTime(r.createdAt)}</span>
              <p className="chat-search-result-content">{r.content}</p>
            </div>
          ))}
        </div>
      )}
      <div className="chat-header">
        <div className="chat-header-tile">
          <Ico.hash />
        </div>
        <div className="chat-header-title">
          <div className="chat-header-name">#{channelName}</div>
          <div className="chat-header-sub">Canal de texto</div>
        </div>
        <div className="chat-header-spacer" />
        <button className="chat-header-btn" title="Fixados" onClick={onOpenPins}>
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

      <div className="chat-scroll" ref={scrollRef} onScroll={(e) => {
        if ((e.currentTarget as HTMLDivElement).scrollTop < 80) loadMore();
      }}>
        {loadingMore && <div className="chat-load-more-spinner">Carregando...</div>}
        {!loadingMore && hasMore && (
          <button className="chat-load-more-btn" onClick={loadMore}>
            Carregar mensagens anteriores
          </button>
        )}
        <div className="chat-intro">
          <div className="chat-intro-tile">
            <Ico.hash />
          </div>
          <h2>
            Bem-vindo ao <span className="brand-text">#{channelName}</span>
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

        {historyLoaded && visibleMessages.length === 0 && (
          <div className="chat-empty">
            <p>Nenhuma mensagem ainda.</p>
            <p>Seja o primeiro a falar!</p>
          </div>
        )}

        {visibleMessages.map((msg, i) => {
          const prev = visibleMessages[i - 1];
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
              canPin={isOwner}
              isEditing={editingId === msg.id}
              editDraft={editDraft}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              token={token}
              onStartEdit={() => startEdit(msg)}
              onCancelEdit={cancelEdit}
              onCommitEdit={commitEdit}
              onChangeEdit={setEditDraft}
              onDelete={() => deleteMessage(msg.id)}
              onReact={(emoji) => send({ type: "react", id: msg.id, emoji })}
              onReply={() => { setReplyTo(msg); inputRef.current?.focus(); }}
              onPin={() => togglePin(msg)}
              onJumpTo={scrollToMessage}
            />
          );
        })}
        <div ref={bottomRef} style={{ height: 12 }} />
      </div>

      <TypingBar typers={typers} />
      {replyTo && (
        <div className="chat-reply-bar">
          <Ico.reply />
          <span className="chat-reply-bar-text">
            Respondendo a <strong>{replyTo.authorName}</strong>: <em>{replyTo.content.slice(0, 80)}{replyTo.content.length > 80 ? "…" : ""}</em>
          </span>
          <button type="button" onClick={() => setReplyTo(null)} title="Cancelar resposta">
            <Ico.close />
          </button>
        </div>
      )}
      <div className="chat-input-wrap">
        {mentionQuery !== null && (() => {
          const suggestions = members.filter(
            (m) => m !== currentUsername && m.toLowerCase().startsWith(mentionQuery.toLowerCase())
          ).slice(0, 6);
          if (suggestions.length === 0) return null;
          return (
            <div className="chat-mention-list">
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="chat-mention-item"
                  onClick={() => {
                    const atIdx = input.lastIndexOf("@");
                    setInput(input.slice(0, atIdx) + `@${name} `);
                    setMentionQuery(null);
                    inputRef.current?.focus();
                  }}
                >
                  @{name}
                </button>
              ))}
            </div>
          );
        })()}
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
          <textarea
            ref={inputRef}
            className="chat-input-textarea"
            placeholder={connected ? `Escreva em #${channelName}…` : "Conectando..."}
            value={input}
            rows={1}
            onChange={(e) => {
              const val = e.target.value;
              setInput(val);
              notifyTyping();
              const atIdx = val.lastIndexOf("@");
              if (atIdx !== -1 && (atIdx === 0 || val[atIdx - 1] === " ")) {
                const query = val.slice(atIdx + 1).split(" ")[0];
                setMentionQuery(query);
              } else {
                setMentionQuery(null);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitMessage();
              }
            }}
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
          <strong>enter</strong> enviar · <strong>shift+enter</strong> nova linha · <strong>**negrito**</strong> · <strong>_itálico_</strong> · <strong>`código`</strong>
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
  canPin: boolean;
  isEditing: boolean;
  editDraft: string;
  currentUserId: string;
  currentUsername: string;
  token: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onChangeEdit: (v: string) => void;
  onDelete: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onPin: () => void;
  onJumpTo: (id: string) => void;
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function Message({
  msg,
  grouped,
  showDate,
  canEdit,
  canDelete,
  canPin,
  isEditing,
  editDraft,
  currentUserId,
  currentUsername,
  token,
  onStartEdit,
  onCancelEdit,
  onCommitEdit,
  onChangeEdit,
  onDelete,
  onReact,
  onReply,
  onPin,
  onJumpTo,
}: MessageProps) {
  const [showReactPicker, setShowReactPicker] = useState(false);
  const isInvite = msg.content.startsWith("lobby://join/");
  const inviteCode = isInvite ? msg.content.replace("lobby://join/", "").trim() : null;
  const media = !isInvite && !isEditing ? extractMedia(msg.content) : null;
  const contentIsOnlyUrl = media && msg.content.trim() === media.url;
  const urlMatches = !isInvite && !isEditing && !media ? msg.content.match(URL_RE) : null;
  const plainUrl = urlMatches ? urlMatches[0].replace(/[),.;!?]+$/, "") : null;

  return (
    <>
      {showDate && (
        <div className="chat-date">
          <div className="chat-date-line" />
          <span className="chat-date-label">{formatDateLabel(msg.createdAt)}</span>
          <div className="chat-date-line" />
        </div>
      )}
      <div id={`msg-${msg.id}`} className={`chat-msg${grouped ? " grouped" : ""}`}>
        {msg.replyTo && (
          <div
            className="chat-msg-reply-to"
            onClick={() => onJumpTo(msg.replyTo!.id)}
            title="Ir para mensagem original"
          >
            <Ico.reply />
            <span className="chat-msg-reply-to-author">{msg.replyTo.authorName}</span>
            <span className="chat-msg-reply-to-text">{msg.replyTo.content}</span>
          </div>
        )}
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
                  {formatMessage(msg.content, currentUsername)}
                  {msg.editedAt && <span className="chat-msg-edited"> (editado)</span>}
                </p>
              )}
              {media && <MediaEmbed url={media.url} />}
              {plainUrl && <LinkPreview url={plainUrl} token={token} />}
              {contentIsOnlyUrl && msg.editedAt && (
                <span className="chat-msg-edited">(editado)</span>
              )}
            </>
          )}
        </div>
        {!isEditing && (
          <div className="chat-msg-actions">
            <div className="chat-msg-react-wrap">
              <button
                type="button"
                className="chat-msg-action-btn"
                title="Reagir"
                onClick={() => setShowReactPicker((v) => !v)}
              >
                😊
              </button>
              {showReactPicker && (
                <div className="chat-msg-react-picker">
                  {QUICK_REACTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { onReact(e); setShowReactPicker(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="chat-msg-action-btn" title="Responder" onClick={onReply}>
              <Ico.reply />
            </button>
            {canPin && (
              <button type="button" className="chat-msg-action-btn" title="Fixar/desfixar" onClick={onPin}>
                <Ico.pin />
              </button>
            )}
            {canEdit && (
              <button type="button" className="chat-msg-action-btn" title="Editar" onClick={onStartEdit}>
                <Ico.edit />
              </button>
            )}
            {canDelete && (
              <button type="button" className="chat-msg-action-btn danger" title="Apagar" onClick={onDelete}>
                <Ico.trash />
              </button>
            )}
          </div>
        )}
        {msg.reactions.length > 0 && (
          <div className="chat-msg-reactions">
            {msg.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                className={`chat-reaction${r.userIds.includes(currentUserId) ? " active" : ""}`}
                title={`${r.count} ${r.count === 1 ? "reação" : "reações"}`}
                onClick={() => onReact(r.emoji)}
              >
                {r.emoji} <span>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TypingBar({ typers }: { typers: Record<string, string> }) {
  const names = Object.values(typers);
  if (names.length === 0) return <div className="chat-typing-bar" />;
  const label =
    names.length === 1
      ? `${names[0]} está digitando...`
      : names.length === 2
      ? `${names[0]} e ${names[1]} estão digitando...`
      : "Várias pessoas estão digitando...";
  return (
    <div className="chat-typing-bar">
      <span className="chat-typing-dots">
        <span /><span /><span />
      </span>
      <span className="chat-typing-text">{label}</span>
    </div>
  );
}

function LinkPreview({ url, token }: { url: string; token: string }) {
  const [data, setData] = useState<{ title?: string; description?: string; image?: string; siteName?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    api.unfurl(token, url)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url, token]);

  if (!data || (!data.title && !data.image)) {
    return <a className="chat-msg-link" href={url} target="_blank" rel="noreferrer">{url}</a>;
  }

  return (
    <div className="link-preview">
      {data.image && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={data.image} alt="" className="link-preview-img" loading="lazy" />
        </a>
      )}
      <div className="link-preview-body">
        {data.siteName && <div className="link-preview-site">{data.siteName}</div>}
        <a className="link-preview-title" href={url} target="_blank" rel="noreferrer">{data.title}</a>
        {data.description && <p className="link-preview-desc">{data.description}</p>}
      </div>
    </div>
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
