import React, { Suspense, lazy, memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

// Pre-process @mentions to markdown links, skipping content inside code spans/blocks.
function preprocessMentions(text: string): string {
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+?`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(/(?<![:\w/@])@(everyone|here|\w+)/g, "[@$1](#mention-$1)");
    })
    .join("");
}

function MarkdownContent({ text, currentUsername }: { text: string; currentUsername: string }) {
  const processed = preprocessMentions(text);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const child = React.Children.toArray(children)[0] as React.ReactElement<{
            className?: string;
            children?: React.ReactNode;
          }>;
          const lang = /language-(\w+)/.exec(child?.props?.className ?? "")?.[1];
          const code = String(child?.props?.children ?? "").replace(/\n$/, "");
          return (
            <Suspense fallback={<pre className="chat-msg-codeblock"><code>{code}</code></pre>}>
              <CodeBlock lang={lang} code={code} />
            </Suspense>
          );
        },
        code({ children, className }) {
          if (className?.startsWith("language-")) return null;
          return <code className="chat-msg-code">{children}</code>;
        },
        a({ href, children }) {
          if (href?.startsWith("#mention-")) {
            const tag = href.slice("#mention-".length);
            if (tag === "everyone" || tag === "here") {
              return <span className="mention-tag">@{tag}</span>;
            }
            const isSelf = tag.toLowerCase() === currentUsername.toLowerCase();
            return <span className={`chat-mention${isSelf ? " self" : ""}`}>@{tag}</span>;
          }
          return <a href={href} target="_blank" rel="noreferrer" className="chat-msg-link">{children}</a>;
        },
        p({ children }) {
          return <>{children}</>;
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
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
                <div className="chat-msg-content">
                  <MarkdownContent text={msg.content} currentUsername={currentUsername} />
                  {msg.editedAt && <span className="chat-msg-edited"> (editado)</span>}
                </div>
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
