import { Dispatch, FormEvent, RefObject, SetStateAction, Suspense, lazy } from "react";
import { AttachmentMeta } from "../../lib/api";
import { Ico } from "../icons";
import type { ChatMessage } from "../MessageItem";

const EmojiPicker = lazy(() => import("../LazyEmojiPicker"));

interface Props {
  channelName: string;
  connected: boolean;
  hasContent: boolean;

  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;

  fileInputRef: RefObject<HTMLInputElement | null>;
  uploading: boolean;
  handleFileSelect: (files: FileList | null) => void;

  showEmoji: boolean;
  setShowEmoji: Dispatch<SetStateAction<boolean>>;

  pendingAttachments: AttachmentMeta[];
  setPendingAttachments: Dispatch<SetStateAction<AttachmentMeta[]>>;

  mentionQuery: string | null;
  setMentionQuery: (v: string | null) => void;
  members: string[];
  currentUsername: string;

  replyTo: ChatMessage | null;
  setReplyTo: (v: ChatMessage | null) => void;

  notifyTyping: () => void;
  submitMessage: () => void;
}

export function MessageInput({
  channelName,
  connected,
  hasContent,
  input,
  setInput,
  inputRef,
  fileInputRef,
  uploading,
  handleFileSelect,
  showEmoji,
  setShowEmoji,
  pendingAttachments,
  setPendingAttachments,
  mentionQuery,
  setMentionQuery,
  members,
  currentUsername,
  replyTo,
  setReplyTo,
  notifyTyping,
  submitMessage,
}: Props) {
  function sendForm(e: FormEvent) {
    e.preventDefault();
    submitMessage();
  }

  const mentionSuggestions =
    mentionQuery !== null
      ? members
          .filter((m) => m !== currentUsername && m.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 6)
      : [];

  return (
    <>
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
        {mentionSuggestions.length > 0 && (
          <div className="chat-mention-list">
            {mentionSuggestions.map((name) => (
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
        )}
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
    </>
  );
}
