import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { useAuth } from "../contexts/AuthContext";
import { useVoice, isNotifyJoinEnabled, setNotifyJoinEnabled } from "../contexts/VoiceContext";
import { isSoundEnabled, setSoundEnabled } from "../lib/sounds";
import { api, User } from "../lib/api";

interface Props {
  onClose: () => void;
}

type UpdateStatus = "idle" | "checking" | "latest" | "downloading" | "error";

const UPDATER_KEYWORDS = ["network", "connect", "dns", "timeout", "resolve", "offline"];

// Browser key names that work as Tauri global shortcut names
const ALLOWED_PTT_KEYS: Record<string, string> = {
  CapsLock: "CapsLock",
  ScrollLock: "ScrollLock",
  Pause: "Pause",
  F1: "F1", F2: "F2", F3: "F3", F4: "F4",
  F5: "F5", F6: "F6", F7: "F7", F8: "F8",
  F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
};

export function SettingsModal({ onClose }: Props) {
  const { user, token, setUser } = useAuth();
  const voice = useVoice();

  const [username, setUsername] = useState(user?.username ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const [recordingPTT, setRecordingPTT] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [notifyJoin, setNotifyJoin] = useState(() => isNotifyJoinEnabled());
  const [soundEnabled, setSoundEnabledState] = useState(() => isSoundEnabled());

  function toggleNotifyJoin() {
    const next = !notifyJoin;
    setNotifyJoin(next);
    setNotifyJoinEnabled(next);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabledState(next);
    setSoundEnabled(next);
  }

  useEffect(() => {
    autostartIsEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);

  async function toggleAutostart() {
    try {
      if (autostart) {
        await autostartDisable();
        setAutostart(false);
      } else {
        await autostartEnable();
        setAutostart(true);
      }
    } catch (e) {
      console.error("[autostart]", e);
    }
  }

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

  function handlePTTKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!recordingPTT) return;
    e.preventDefault();
    const tauriKey = ALLOWED_PTT_KEYS[e.key];
    if (tauriKey) {
      voice.setPttKey(tauriKey);
      setRecordingPTT(false);
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
            <h3>Sistema</h3>
            <div className="settings-system">
              <label className="settings-toggle-row">
                <span>Iniciar com o Windows</span>
                <button
                  className={`settings-toggle ${autostart ? "on" : "off"}`}
                  onClick={toggleAutostart}
                  disabled={autostart === null}
                >
                  {autostart ? "Ativado" : "Desativado"}
                </button>
              </label>
              <label className="settings-toggle-row">
                <span>Notificar quando alguém entrar na sala</span>
                <button
                  className={`settings-toggle ${notifyJoin ? "on" : "off"}`}
                  onClick={toggleNotifyJoin}
                >
                  {notifyJoin ? "Ativado" : "Desativado"}
                </button>
              </label>
              <label className="settings-toggle-row">
                <span>Som ao receber mensagem</span>
                <button
                  className={`settings-toggle ${soundEnabled ? "on" : "off"}`}
                  onClick={toggleSound}
                >
                  {soundEnabled ? "Ativado" : "Desativado"}
                </button>
              </label>
            </div>
          </section>

          <section className="settings-section">
            <h3>Push-to-talk</h3>
            <div className="settings-ptt">
              <p className="settings-ptt-desc">
                Segure a tecla configurada para falar enquanto estiver mutado.
              </p>
              <div className="settings-ptt-row">
                <span className="settings-ptt-key">
                  {voice.pttKey ?? "Não configurado"}
                </span>
                <button
                  className={recordingPTT ? "btn-danger-outline" : "btn-secondary"}
                  onKeyDown={handlePTTKeyDown}
                  onClick={() => setRecordingPTT((r) => !r)}
                  style={{ fontSize: 13, padding: "6px 12px" }}
                >
                  {recordingPTT ? "Aguardando tecla..." : "Alterar"}
                </button>
                {voice.pttKey && !recordingPTT && (
                  <button
                    className="btn-secondary"
                    onClick={() => voice.setPttKey(null)}
                    style={{ fontSize: 13, padding: "6px 12px" }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              {recordingPTT && (
                <p style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                  Teclas suportadas: F1–F12, CapsLock, ScrollLock, Pause, Insert, Home, End, PageUp, PageDown
                </p>
              )}
            </div>
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
