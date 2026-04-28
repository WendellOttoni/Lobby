import { RefObject } from "react";
import { SearchResult } from "../../lib/api";
import { Ico } from "../icons";

interface Props {
  channelId: string | null;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searching: boolean;
  searchResults: SearchResult[] | null;
  showSearchHelp: boolean;
  setShowSearchHelp: (v: boolean | ((prev: boolean) => boolean)) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  runSearch: (q: string) => void;
  onClose: () => void;
  onJumpTo: (id: string) => void;
}

export function ChatSearchBar({
  channelId,
  searchQuery,
  setSearchQuery,
  searching,
  searchResults,
  showSearchHelp,
  setShowSearchHelp,
  searchInputRef,
  runSearch,
  onClose,
  onJumpTo,
}: Props) {
  return (
    <>
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
        <button type="button" onClick={onClose}>
          <Ico.close />
        </button>
      </div>
      {showSearchHelp && (
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
      {searchResults !== null && (
        <div className="chat-search-results">
          {searchResults.length === 0 && <p className="chat-search-empty">Nenhum resultado.</p>}
          {searchResults.map((r) => {
            const sameChannel = r.channelId === channelId;
            return (
              <div
                key={r.id}
                className={`chat-search-result${sameChannel ? " jumpable" : ""}`}
                onClick={sameChannel ? () => onJumpTo(r.id) : undefined}
                title={sameChannel ? "Pular para esta mensagem" : "Em outro canal"}
              >
                <span className="chat-search-result-author">{r.authorName}</span>
                <span className="chat-search-result-time">
                  {new Date(r.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
                {!sameChannel && <span className="chat-search-result-elsewhere">em outro canal</span>}
                <p className="chat-search-result-content">{r.content}</p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
