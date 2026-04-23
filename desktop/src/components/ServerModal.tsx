import { FormEvent, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

type Mode = "choose" | "create" | "join";

interface Props {
  onClose: () => void;
  onDone: () => void;
  initialCode?: string;
}

export function ServerModal({ onClose, onDone, initialCode }: Props) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>(initialCode ? "join" : "choose");
  const [name, setName] = useState("");
  const [code, setCode] = useState(initialCode ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token || !name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createServer(token, name.trim());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar servidor");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    if (!token || !code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.joinServer(token, code.trim().toLowerCase());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="server-modal">
          <h2>{mode === "create" ? "Criar servidor" : mode === "join" ? "Entrar com convite" : "Adicionar servidor"}</h2>
          {mode !== "choose" && !initialCode && (
            <div className="server-modal-tabs">
              <button
                className={`server-modal-tab${mode === "create" ? " active" : ""}`}
                onClick={() => setMode("create")}
              >
                Criar
              </button>
              <button
                className={`server-modal-tab${mode === "join" ? " active" : ""}`}
                onClick={() => setMode("join")}
              >
                Entrar
              </button>
            </div>
          )}

          {mode === "choose" && (
            <div className="server-modal-tabs" style={{ marginTop: 8 }}>
              <button className="server-modal-tab active" onClick={() => setMode("create")}>
                Criar servidor
              </button>
              <button className="server-modal-tab" onClick={() => setMode("join")}>
                Entrar com convite
              </button>
            </div>
          )}

          {mode === "create" && (
            <form onSubmit={handleCreate} className="server-modal-form">
              <label>
                Nome do servidor
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={64}
                  autoFocus
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="server-modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? "Criando..." : "Criar"}
                </button>
              </div>
            </form>
          )}

          {mode === "join" && (
            <form onSubmit={handleJoin} className="server-modal-form">
              <label>
                Código do convite
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="server-modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting || !code.trim()}>
                  {submitting ? "Entrando..." : "Entrar"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
