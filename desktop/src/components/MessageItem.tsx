import { ReactNode, Suspense, lazy, memo, useEffect, useState } from "react";
import { api, AttachmentMeta } from "../lib/api";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

const CodeBlock = lazy(() => import("./LazyCodeBlock"));

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReactionCount {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface ReplySnippet {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  channelId: string | null;
  replyTo: ReplySnippet | null;
  reactions: ReactionCount[];
  attachments?: AttachmentMeta[];
}

export interface MessageProps {
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
  onStartEdit: (msg: ChatMessage) => void;
  onCancelEdit: () => void;
  onCommitEdit: () => void;
  onChangeEdit: (v: string) => void;
  onDelete: (id: string) => void;
  onReact: (id: string, emoji: string) => void;
  onReply: (msg: ChatMessage) => void;
  onPin: (msg: ChatMessage) => void;
  onJumpTo: (id: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateLabel(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    .replace(".", "");
}

export function sameCalendarDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function shouldGroup(prev: ChatMessage | undefined, curr: ChatMessage): boolean {
  if (!prev || prev.authorId !== curr.authorId) return false;
  if (!sameCalendarDay(prev.createdAt, curr.createdAt)) return false;
  if (curr.replyTo) return false;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|avif)(\?[^\s]*)?$/i;
const MEDIA_HOSTS =
  /(tenor\.com|giphy\.com|media\.tenor\.com|media\.giphy\.com|media[0-9]?\.giphy\.com|imgur\.com|i\.imgur\.com)/i;

export function extractMedia(content: string): { url: string; isTenorEmbed: boolean } | null {
  const matches = content.match(URL_RE);
  if (!matches) return null;
  for (const raw of matches) {
    const url = raw.replace(/[),.;!?]+$/, "");
    if (IMG_EXT_RE.test(url)) return { url, isTenorEmbed: false };
    if (MEDIA_HOSTS.test(url)) return { url, isTenorEmbed: true };
  }
  return null;
}

export { URL_RE };

const FORMAT_RE =
  /```(?:(\w+)\n)?([\s\S]+?)```|`([^`\n]+?)`|\*\*([^*\n]+?)\*\*|_([^_\n]+?)_|(@\w+)/g;

function formatMessage(text: string, currentUsername: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  FORMAT_RE.lastIndex = 0;
  while ((m = FORMAT_RE.exec(text)) !== null) {
    if (m.index > lastIdx) nodes.push(text.slice(lastIdx, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <Suspense key={key++} fallback={<pre className="chat-msg-codeblock"><code>{m[2]}</code></pre>}>
          <CodeBlock lang={m[1]} code={m[2]} />
        </Suspense>
      );
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

// ── Sub-components ────────────────────────────────────────────────────────────

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

export const Message = memo(function Message({
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
          <Avatar name={msg.authorName} id={msg.authorId} src={msg.authorAvatarUrl} size={38} />
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
          {msg.attachments && msg.attachments.length > 0 && (
            <div className="chat-msg-attachments">
              {msg.attachments.map((att) => (
                <Attachment key={att.url} attachment={att} />
              ))}
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
                  onClick={() => onReact(msg.id, r.emoji)}
                >
                  {r.emoji} <span>{r.count}</span>
                </button>
              ))}
            </div>
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
                      onClick={() => { onReact(msg.id, e); setShowReactPicker(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="chat-msg-action-btn" title="Responder" onClick={() => onReply(msg)}>
              <Ico.reply />
            </button>
            {canPin && (
              <button type="button" className="chat-msg-action-btn" title="Fixar/desfixar" onClick={() => onPin(msg)}>
                <Ico.pin />
              </button>
            )}
            {canEdit && (
              <button type="button" className="chat-msg-action-btn" title="Editar" onClick={() => onStartEdit(msg)}>
                <Ico.edit />
              </button>
            )}
            {canDelete && (
              <button type="button" className="chat-msg-action-btn danger" title="Apagar" onClick={() => onDelete(msg.id)}>
                <Ico.trash />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
});

export function TypingBar({ typers }: { typers: Record<string, string> }) {
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

export function LinkPreview({ url, token }: { url: string; token: string }) {
  const [data, setData] = useState<{
    title?: string;
    description?: string;
    image?: string;
    siteName?: string;
  } | null>(null);

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

export function MediaEmbed({ url }: { url: string }) {
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function Attachment({ attachment }: { attachment: AttachmentMeta }) {
  const isImage = attachment.mimeType.startsWith("image/");
  const isVideo = attachment.mimeType === "video/mp4";

  if (isImage) {
    return (
      <a className="chat-attachment-image" href={attachment.url} target="_blank" rel="noreferrer">
        <img src={attachment.url} alt={attachment.filename} loading="lazy" />
      </a>
    );
  }

  if (isVideo) {
    return (
      <video
        className="chat-attachment-video"
        src={attachment.url}
        controls
        preload="metadata"
      />
    );
  }

  return (
    <a className="chat-attachment-file" href={attachment.url} target="_blank" rel="noreferrer" download>
      <Ico.attach />
      <div className="chat-attachment-file-info">
        <span className="chat-attachment-file-name">{attachment.filename}</span>
        <span className="chat-attachment-file-size">{formatBytes(attachment.size)}</span>
      </div>
    </a>
  );
}

export function InviteEmbed({ code }: { code: string }) {
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
        onClick={() => navigator.clipboard.writeText(`lobby://join/${code}`)}
        title="Copiar link"
      >
        Entrar →
      </button>
    </div>
  );
}
