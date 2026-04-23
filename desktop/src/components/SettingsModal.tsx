import { FormEvent, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useAuth } from "../contexts/AuthContext";
import { api, User } from "../lib/api";

interface Props {
  onClose: () => void;
}

type UpdateStatus = "idle" | "checking" | "latest" | "downloading" | "error";

const UPDATER_KEYWORDS = ["network", "connect", "dns", "timeout", "resolve", "offline"];

export function SettingsModal({ onClose }: Props) {
  const { user, token, setUser } = useAuth();

  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  async function loadVersion() {
    if (version) return;
    try {
      setVersion(await getVersion());
    } catch {
      setVersion("dev");
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data: { username?: string; currentPassword?: string; newPassword?: string } = {};
      if (username !== user?.username) data.username = username;
      if (newPassword) {
        data.currentPassword = currentPassword;
        data.newPassword = newPassword;
      }
      const { user: updated } = await api.updateMe(token, data);
      setUser(updated as User);
      setCurrentPassword("");
      setNewPassword("");
      setSaveMsg({ ok: true, text: "Salvo com sucesso!" });
    } catch (err) {
      setSaveMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCheckUpdate() {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (!update) {
        setUpdateStatus("latest");
        return;
      }
      setUpdateStatus("downloading");
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[updater] check failed:", msg);
      setUpdateError(msg);
      setUpdateStatus("error");
    }
  }

  const updateLabel: Record<UpdateStatus, string> = {
    idle: "Verificar atualização",
    checking: "Verificando...",
    latest: "Você já está na versão mais recente",
    downloading: "Baixando e instalando...",
    error: "Erro ao verificar — tente novamente",
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()} onMouseEnter={loadVersion}>
        <div className="settings-header">
          <h2>Configurações</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Conta</h3>
            <form onSubmit={handleSave} className="settings-form">
              <label className="settings-label">
                <span>Nome de usuário</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={3}
                  maxLength={32}
                  required
                />
              </label>

              <label className="settings-label">
                <span>Senha atual</span>
                <input
                  type="password"
                  placeholder="Deixe em branco para não alterar"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </label>

              <label className="settings-label">
                <span>Nova senha</span>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={newPassword ? 6 : undefined}
                />
              </label>

              {saveMsg && (
                <p className={saveMsg.ok ? "settings-success" : "error"}>
                  {saveMsg.text}
                </p>
              )}

              <button type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </form>
          </section>

          <section className="settings-section">
            <h3>Atualizações</h3>
            <div className="settings-update">
              {version && (
                <p className="settings-version">
                  Versão instalada: <code>{version}</code>
                </p>
              )}
              <button
                className={updateStatus === "latest" ? "btn-secondary" : ""}
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking" || updateStatus === "downloading"}
              >
                {updateLabel[updateStatus]}
              </button>
              {updateStatus === "error" && (
                <div style={{ marginTop: 8 }}>
                  <p className="error" style={{ fontSize: 13, marginBottom: 4 }}>
                    {updateError && UPDATER_KEYWORDS.some((k) => updateError.toLowerCase().includes(k))
                      ? "Sem conexão com o servidor de atualizações. Verifique sua internet."
                      : "Falha ao verificar atualização."}
                  </p>
                  {updateError && (
                    <p style={{ fontSize: 11, opacity: 0.6, wordBreak: "break-word" }}>
                      {updateError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
