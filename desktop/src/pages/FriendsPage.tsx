import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useDM } from "../contexts/DMContext";
import { api } from "../lib/api";
import { Avatar } from "../components/Avatar";
import { Ico } from "../components/icons";

export function FriendsPage() {
  const { token } = useAuth();
  const { friends, incoming, outgoing, refreshFriends } = useDM();
  const navigate = useNavigate();
  const [addInput, setAddInput] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  async function handleSendRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !addInput.trim()) return;
    setAddError("");
    setAddLoading(true);
    try {
      await api.sendFriendRequest(token, addInput.trim());
      setAddInput("");
      await refreshFriends();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Erro ao enviar solicitação.");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleAccept(requestId: string) {
    if (!token) return;
    try {
      await api.acceptFriendRequest(token, requestId);
      await refreshFriends();
    } catch {}
  }

  async function handleRemove(requestId: string) {
    if (!token) return;
    try {
      await api.removeFriend(token, requestId);
      await refreshFriends();
    } catch {}
  }

  return (
    <div className="friends-page">
      <div className="friends-header">
        <h2>Amigos</h2>
      </div>

      <form className="friends-add-form" onSubmit={handleSendRequest}>
        <input
          className="friends-add-input"
          placeholder="Adicionar amigo por username…"
          value={addInput}
          onChange={(e) => setAddInput(e.target.value)}
        />
        <button className="friends-add-btn" disabled={addLoading || !addInput.trim()}>
          Adicionar
        </button>
        {addError && <span className="friends-add-error">{addError}</span>}
      </form>

      {incoming.length > 0 && (
        <section className="friends-section">
          <h3 className="friends-section-title">Solicitações pendentes — {incoming.length}</h3>
          {incoming.map((req) => (
            <div key={req.id} className="friends-row">
              <Avatar name={req.from.username} id={req.from.id} size={36} />
              <span className="friends-row-name">{req.from.username}</span>
              <div className="friends-row-actions">
                <button className="friends-btn accept" onClick={() => handleAccept(req.id)} title="Aceitar">
                  ✓
                </button>
                <button className="friends-btn decline" onClick={() => handleRemove(req.id)} title="Recusar">
                  ✕
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="friends-section">
          <h3 className="friends-section-title">Enviadas</h3>
          {outgoing.map((req) => (
            <div key={req.id} className="friends-row">
              <Avatar name={req.to.username} id={req.to.id} size={36} />
              <span className="friends-row-name">{req.to.username}</span>
              <span className="friends-row-pending">Pendente</span>
              <button className="friends-btn decline" onClick={() => handleRemove(req.id)} title="Cancelar">
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="friends-section">
        <h3 className="friends-section-title">Todos os amigos — {friends.length}</h3>
        {friends.length === 0 && (
          <p className="friends-empty">Nenhum amigo ainda. Adicione alguém pelo username acima.</p>
        )}
        {friends.map((f) => (
          <div
            key={f.id}
            className="friends-row clickable"
            onClick={() => navigate(`/dm/${f.id}`)}
          >
            <Avatar name={f.username} id={f.id} size={36} />
            <span className="friends-row-name">{f.username}</span>
            <button
              className="friends-btn chat"
              onClick={(e) => { e.stopPropagation(); navigate(`/dm/${f.id}`); }}
              title="Mensagem direta"
            >
              <Ico.hash />
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
