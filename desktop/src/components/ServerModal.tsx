import { FormEvent, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";

type Mode = "choose" | "create" | "join";

interface Props {
  onClose: () => void;
  onDone: () => void;
}

export function ServerModal({ onClose, onDone }: Props) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
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
        {mode === "choose" && (
          <>
            <h2>Adicionar servidor</h2>
            <div className="modal-choices">
              <button className="choice-btn" onClick={() => setMode("create")}>
                <span className="choice-icon">+</span>
                <span>Criar servidor</span>
              </button>
              <button className="choice-btn" onClick={() => setMode("join")}>
                <span className="choice-icon">→</span>
                <span>Entrar com convite</span>
              </button>
            </div>
          </>
        )}

        {mode === "create" && (
          <>
            <h2>Criar servidor</h2>
            <form onSubmit={handleCreate}>
              <input
                placeholder="Nome do servidor"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                autoFocus
                required
              />
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setMode("choose")}>
                  Voltar
                </button>
                <button type="submit" disabled={submitting || !name.trim()}>
                  {submitting ? "Criando..." : "Criar"}
                </button>
              </div>
            </form>
          </>
        )}

        {mode === "join" && (
          <>
            <h2>Entrar com convite</h2>
            <form onSubmit={handleJoin}>
              <input
                placeholder="Código do convite"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setMode("choose")}>
                  Voltar
                </button>
                <button type="submit" disabled={submitting || !code.trim()}>
                  {submitting ? "Entrando..." : "Entrar"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
