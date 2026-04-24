import { useEffect, useState } from "react";
import { api, PinnedMessage } from "../lib/api";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

interface Props {
  token: string;
  serverId: string;
  isOwner: boolean;
  onClose: () => void;
  onJumpTo?: (messageId: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PinsModal({ token, serverId, isOwner, onClose, onJumpTo }: Props) {
  const [pins, setPins] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { pins } = await api.listPins(token, serverId);
      setPins(pins);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao listar fixados");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token, serverId]);

  async function unpin(messageId: string) {
    try {
      await api.unpinMessage(token, serverId, messageId);
      setPins((prev) => prev.filter((p) => p.messageId !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao desfixar");
    }
  }

  return (
    <div className="ctx-menu-overlay" onClick={onClose}>
      <div className="pins-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pins-modal-header">
          <Ico.pin />
          <h3>Mensagens fixadas</h3>
          <button type="button" onClick={onClose} title="Fechar">
            <Ico.close />
          </button>
        </div>
        {loading && <p className="pins-modal-empty">Carregando...</p>}
        {error && <p className="error" style={{ padding: 12 }}>{error}</p>}
        {!loading && pins.length === 0 && (
          <p className="pins-modal-empty">Nenhuma mensagem fixada.</p>
        )}
        <div className="pins-modal-list">
          {pins.map((p) => (
            <div key={p.id} className="pins-modal-item">
              {p.message ? (
                <>
                  <Avatar name={p.message.authorName} id={p.message.authorId} size={32} />
                  <div className="pins-modal-item-body">
                    <div className="pins-modal-item-head">
                      <strong>{p.message.authorName}</strong>
                      <span className="pins-modal-item-time">{formatDate(p.message.createdAt)}</span>
                    </div>
                    <p className="pins-modal-item-text">{p.message.content}</p>
                    <div className="pins-modal-item-foot">
                      <span>Fixado por {p.pinnerName} · {formatDate(p.pinnedAt)}</span>
                      {onJumpTo && (
                        <button type="button" onClick={() => { onJumpTo(p.messageId); onClose(); }}>
                          Ir
                        </button>
                      )}
                      {isOwner && (
                        <button type="button" className="danger" onClick={() => unpin(p.messageId)}>
                          Desfixar
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <p className="pins-modal-item-deleted">Mensagem apagada.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
