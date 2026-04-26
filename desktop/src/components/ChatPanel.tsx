import { FormEvent, Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { api, SearchResult, AttachmentMeta } from "../lib/api";
import { playMessageSound } from "../lib/sounds";
import { notify, isMentionNotifyEnabled } from "../lib/notify";
import { Ico } from "./icons";
import {
  ChatMessage,
  Message,
  TypingBar,
  sameCalendarDay,
  shouldGroup,
} from "./MessageItem";

const EmojiPicker = lazy(() => import("./LazyEmojiPicker"));

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
const START_INDEX = 100_000;

function wsUrl(): string {
  return API_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
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
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const [showNewMsgBadge, setShowNewMsgBadge] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showSearchHelp, setShowSearchHelp] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAtBottomRef = useRef(true);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const editingIdRef = useRef(editingId);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  const editDraftRef = useRef(editDraft);
  useEffect(() => { editDraftRef.current = editDraft; }, [editDraft]);

  const historyCacheRef = useRef<Map<string | null, {
    messages: ChatMessage[];
    firstItemIndex: number;
    hasMore: boolean;
  }>>(new Map());

  function autoResize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }
  useEffect(() => { autoResize(); }, [input]);

  function send(payload: object): boolean {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(payload));
    return true;
  }

  const startEdit = useCallback((msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditDraft(msg.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditDraft("");
  }, []);

  const commitEdit = useCallback(() => {
    const id = editingIdRef.current;
    if (!id) return;
    const trimmed = editDraftRef.current.trim();
    if (!trimmed) return;
    const original = messagesRef.current.find((m) => m.id === id);
    if (original && trimmed !== original.content) send({ type: "edit", id, content: trimmed });
    setEditingId(null);
    setEditDraft("");
  }, []);

  const deleteMessage = useCallback((id: string) => {
    if (!window.confirm("Apagar esta mensagem?")) return;
    send({ type: "delete", id });
  }, []);

  const togglePin = useCallback(async (msg: ChatMessage) => {
    try {
      await api.pinMessage(token, serverId, msg.id);
    } catch (err) {
      const apiErr = err as { status?: number };
      if (apiErr?.status === 409) await api.unpinMessage(token, serverId, msg.id).catch(() => {});
    }
  }, [token, serverId]);

  const reactToMessage = useCallback((id: string, emoji: string) => {
    send({ type: "react", id, emoji });
  }, []);

  const replyToMessage = useCallback((msg: ChatMessage) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  }, []);

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

  const scrollToMessage = useCallback((id: string) => {
    const list = messagesRef.current;
    const localIdx = list.findIndex((m) => m.id === id);
    if (localIdx === -1) return;
    virtuosoRef.current?.scrollToIndex({
      index: firstItemIndex + localIdx,
      behavior: "smooth",
      align: "center",
    });
    setTimeout(() => {
      const el = document.getElementById(`msg-${id}`);
      if (el) {
        el.classList.add("chat-msg-flash");
        setTimeout(() => el.classList.remove("chat-msg-flash"), 1500);
      }
    }, 350);
  }, [firstItemIndex]);

  // WebSocket connection (reconnects on serverId/token change)
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
            const fi = START_INDEX - incoming.length;
            const hm = incoming.length >= 80;
            setMessages(incoming);
            setFirstItemIndex(fi);
            setHasMore(hm);
            setHistoryLoaded(true);
            historyCacheRef.current.set(targetChannelId, { messages: incoming, firstItemIndex: fi, hasMore: hm });
          } else if (data.prepend) {
            setMessages((prev) => mergeHistory(incoming, prev));
            setFirstItemIndex((idx) => idx - incoming.length);
            setHasMore(incoming.length >= 40);
            setLoadingMore(false);
          } else {
            setMessages((prev) => mergeHistory(prev, incoming));
            setFirstItemIndex(START_INDEX - incoming.length);
            setHasMore(incoming.length >= 80);
            setHistoryLoaded(true);
          }
        } else if (data.type === "unread_bump") {
          if (data.authorId !== currentUserId) {
            onChannelMessageRef.current?.(data.channelId, data.authorId);
          }
        } else if (data.type === "message") {
          const msg = data as ChatMessage & { type: string };
          if (msg.channelId === activeChannelId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === msg.id)) return prev;
              const updated = [...prev, msg];
              const entry = historyCacheRef.current.get(activeChannelId);
              if (entry) historyCacheRef.current.set(activeChannelId, { ...entry, messages: updated });
              return updated;
            });
            if (msg.authorId !== currentUserId && !isAtBottomRef.current) {
              setShowNewMsgBadge(true);
            }
          }
          if (msg.authorId !== currentUserId) {
            onChannelMessageRef.current?.(msg.channelId, msg.authorId);
            if (msg.channelId === activeChannelId) {
              scheduleMarkRead();
              const mentioned = msg.content.includes(`@${currentUsernameRef.current}`);
              if (document.hidden || mentioned) playMessageSound();
              if (mentioned && isMentionNotifyEnabled() && (document.hidden || !isAtBottomRef.current)) {
                notify(
                  `Nova menção — #${channelIdRef.current ?? "geral"}`,
                  `${msg.authorName}: ${msg.content.slice(0, 80)}`
                ).catch(() => {});
              }
            }
          }
        } else if (data.type === "edit") {
          setMessages((prev) => {
            const updated = prev.map((m) => m.id === data.id ? { ...m, content: data.content, editedAt: data.editedAt } : m);
            const entry = historyCacheRef.current.get(activeChannelId);
            if (entry) historyCacheRef.current.set(activeChannelId, { ...entry, messages: updated });
            return updated;
          });
        } else if (data.type === "delete") {
          setMessages((prev) => {
            const updated = prev.filter((m) => m.id !== data.id);
            const entry = historyCacheRef.current.get(activeChannelId);
            if (entry) historyCacheRef.current.set(activeChannelId, { ...entry, messages: updated });
            return updated;
          });
          setEditingId((id) => (id === data.id ? null : id));
          setReplyTo((r) => (r?.id === data.id ? null : r));
        } else if (data.type === "reactions") {
          setMessages((prev) => {
            const updated = prev.map((m) => m.id === data.messageId ? { ...m, reactions: data.reactions } : m);
            const entry = historyCacheRef.current.get(activeChannelId);
            if (entry) historyCacheRef.current.set(activeChannelId, { ...entry, messages: updated });
            return updated;
          });
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

  // Channel switch: restore from cache for instant render, then refresh in background
  useEffect(() => {
    const cached = historyCacheRef.current.get(channelId);
    if (cached) {
      setMessages(cached.messages);
      setFirstItemIndex(cached.firstItemIndex);
      setHasMore(cached.hasMore);
      setHistoryLoaded(true);
    } else {
      setMessages([]);
      setHistoryLoaded(false);
    }
    setReplyTo(null);
    setTypers({});
    setLoadingMore(false);
    setShowNewMsgBadge(false);
    if (markReadTimer.current) {
      clearTimeout(markReadTimer.current);
      markReadTimer.current = null;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "selectChannel", channelId }));
    }
  }, [channelId]);

  // Load member list for @mention autocomplete
  useEffect(() => {
    let cancelled = false;
    api.listMembers(token, serverId)
      .then(({ members }) => { if (!cancelled) setMembers(members.map((m) => m.username)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId, token]);

  // Keyboard shortcuts
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
    if (send({ type: "loadMore", before: channelMessages[0].id, channelId })) {
      setLoadingMore(true);
    }
  }

  function notifyTyping() {
    if (!input.trim() || typingTimerRef.current) return;
    send({ type: "typing", channelId });
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null; }, 3000);
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploads = await Promise.all(Array.from(files).map((f) => api.uploadFile(token, f)));
      setPendingAttachments((prev) => [...prev, ...uploads]);
    } catch {
      // silent — user may retry
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function submitMessage() {
    const trimmed = input.trim();
    if (!trimmed && pendingAttachments.length === 0) return;
    const payload: Record<string, unknown> = { type: "message", content: trimmed, channelId };
    if (replyTo) payload.replyToId = replyTo.id;
    if (pendingAttachments.length > 0) payload.attachments = pendingAttachments;
    if (send(payload)) {
      setInput("");
      setReplyTo(null);
      setPendingAttachments([]);
      inputRef.current?.focus();
    }
  }

  function sendForm(e: FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  const hasContent = input.trim().length > 0 || pendingAttachments.length > 0;
  const visibleMessages = messages.filter((m) => m.channelId === channelId);

  return (
    <div className="chat-panel">
      {searchOpen && (
        <div className="chat-search-bar">
          <Ico.search />
          <input
            ref={searchInputRef}
            placeholder="Buscar... ex: from:wendell deploy / has:image / before:2026-01-01"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); runSearch(e.target.value); }}
            autoComplete="off"
          />
          {searching && <span className="chat-search-spinner">…</span>}
          <button
            type="button"
            className="chat-search-help-btn"
            title="Ajuda"
            onClick={() => setShowSearchHelp((v) => !v)}
          >
            ?
          </button>
          <button
            type="button"
            onClick={() => { setSearchOpen(false); setSearchQuery(""); setSearchResults(null); setShowSearchHelp(false); }}
          >
            <Ico.close />
          </button>
        </div>
      )}
      {searchOpen && showSearchHelp && (
        <div className="chat-search-help">
          <strong>Filtros:</strong>{" "}
          <code>from:usuario</code>{" · "}
          <code>in:nomedocanal</code>{" · "}
          <code>has:link</code>{" · "}
          <code>has:image</code>{" · "}
          <code>before:2026-01-01</code>{" · "}
          <code>after:2025-12-01</code>
        </div>
      )}
      {searchOpen && searchResults !== null && (
        <div className="chat-search-results">
          {searchResults.length === 0 && <p className="chat-search-empty">Nenhum resultado.</p>}
          {searchResults.map((r) => {
            const sameChannel = r.channelId === channelId;
            return (
              <div
                key={r.id}
                className={`chat-search-result${sameChannel ? " jumpable" : ""}`}
                onClick={sameChannel ? () => { scrollToMessage(r.id); setSearchOpen(false); } : undefined}
                title={sameChannel ? "Pular para esta mensagem" : "Em outro canal"}
              >
                <span className="chat-search-result-author">{r.authorName}</span>
                <span className="chat-search-result-time">{new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                {!sameChannel && <span className="chat-search-result-elsewhere">em outro canal</span>}
                <p className="chat-search-result-content">{r.content}</p>
              </div>
            );
          })}
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

      {!historyLoaded ? (
        <div className="chat-scroll">
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
        </div>
      ) : visibleMessages.length === 0 ? (
        <div className="chat-scroll">
          <div className="chat-intro">
            <div className="chat-intro-tile"><Ico.hash /></div>
            <h2>Bem-vindo ao <span className="brand-text">#{channelName}</span></h2>
            <p>Este é o começo do canal. Converse com quem tá por aqui, mande um convite de voz, ou abra uma sala.</p>
          </div>
          <div className="chat-empty">
            <p>Nenhuma mensagem ainda.</p>
            <p>Seja o primeiro a falar!</p>
          </div>
        </div>
      ) : (
        <div className="chat-scroll-wrap">
          <Virtuoso
            ref={virtuosoRef}
            className="chat-scroll"
            data={visibleMessages}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={visibleMessages.length - 1}
            startReached={loadMore}
            followOutput="smooth"
            atBottomThreshold={120}
            increaseViewportBy={{ top: 400, bottom: 200 }}
            atBottomStateChange={(atBottom) => {
              isAtBottomRef.current = atBottom;
              if (atBottom) setShowNewMsgBadge(false);
            }}
            components={{
              Header: () =>
                loadingMore ? (
                  <div className="chat-load-more-spinner">Carregando...</div>
                ) : hasMore ? (
                  <button className="chat-load-more-btn" onClick={loadMore}>
                    Carregar mensagens anteriores
                  </button>
                ) : (
                  <div className="chat-intro">
                    <div className="chat-intro-tile"><Ico.hash /></div>
                    <h2>Bem-vindo ao <span className="brand-text">#{channelName}</span></h2>
                    <p>Este é o começo do canal. Converse com quem tá por aqui, mande um convite de voz, ou abra uma sala.</p>
                  </div>
                ),
              Footer: () => <div style={{ height: 12 }} />,
            }}
            itemContent={(absoluteIndex, msg) => {
              const localIdx = absoluteIndex - firstItemIndex;
              const prev = visibleMessages[localIdx - 1];
              const grouped = shouldGroup(prev, msg);
              const showDate = localIdx === 0 || !prev || !sameCalendarDay(prev.createdAt, msg.createdAt);
              const isAuthor = msg.authorId === currentUserId;
              const isThisEditing = editingId === msg.id;
              return (
                <Message
                  msg={msg}
                  grouped={grouped}
                  showDate={showDate}
                  canEdit={isAuthor}
                  canDelete={isAuthor || isOwner}
                  canPin={isOwner}
                  isEditing={isThisEditing}
                  editDraft={isThisEditing ? editDraft : ""}
                  currentUserId={currentUserId}
                  currentUsername={currentUsername}
                  token={token}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onCommitEdit={commitEdit}
                  onChangeEdit={setEditDraft}
                  onDelete={deleteMessage}
                  onReact={reactToMessage}
                  onReply={replyToMessage}
                  onPin={togglePin}
                  onJumpTo={scrollToMessage}
                />
              );
            }}
          />
          {showNewMsgBadge && (
            <button
              className="chat-new-msg-badge"
              onClick={() => {
                virtuosoRef.current?.scrollToIndex({ index: visibleMessages.length - 1, behavior: "smooth" });
                setShowNewMsgBadge(false);
              }}
            >
              ↓ Nova mensagem
            </button>
          )}
        </div>
      )}

      <TypingBar typers={typers} />

      {replyTo && (
        <div className="chat-reply-bar">
          <Ico.reply />
          <span className="chat-reply-bar-text">
            Respondendo a <strong>{replyTo.authorName}</strong>:{" "}
            <em>{replyTo.content.slice(0, 80)}{replyTo.content.length > 80 ? "…" : ""}</em>
          </span>
          <button type="button" onClick={() => setReplyTo(null)} title="Cancelar resposta">
            <Ico.close />
          </button>
        </div>
      )}

      <div className="chat-input-wrap">
        {mentionQuery !== null && (() => {
          const suggestions = members
            .filter((m) => m !== currentUsername && m.toLowerCase().startsWith(mentionQuery.toLowerCase()))
            .slice(0, 6);
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
            <Suspense fallback={<div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>Carregando emojis…</div>}>
              <EmojiPicker
                onPick={(emoji) => {
                  setInput((v) => v + emoji);
                  setShowEmoji(false);
                  inputRef.current?.focus();
                }}
              />
            </Suspense>
          </div>
        )}
        {pendingAttachments.length > 0 && (
          <div className="chat-attachment-preview">
            {pendingAttachments.map((att, i) => (
              <div key={att.url} className="chat-attachment-preview-item">
                {att.mimeType.startsWith("image/") ? (
                  <img src={att.url} alt={att.filename} />
                ) : (
                  <span className="chat-attachment-preview-name">{att.filename}</span>
                )}
                <button
                  type="button"
                  className="chat-attachment-preview-remove"
                  onClick={() => setPendingAttachments((prev) => prev.filter((_, j) => j !== i))}
                  title="Remover"
                >
                  <Ico.close />
                </button>
              </div>
            ))}
          </div>
        )}
        <form className="chat-input-shell" onSubmit={sendForm}>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            multiple
            accept="image/*,video/mp4,application/pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <button
            type="button"
            className={`chat-input-btn${uploading ? " uploading" : ""}`}
            title="Anexar arquivo"
            disabled={uploading || !connected}
            onClick={() => fileInputRef.current?.click()}
          >
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
                setMentionQuery(val.slice(atIdx + 1).split(" ")[0]);
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
