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
  const { user, token, setUser, logout } = useAuth();
  const voice = useVoice();

  const [username, setUsername] = useState(user?.username ?? "");
  const [statusText, setStatusText] = useState(user?.statusText ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const [recordingKey, setRecordingKey] = useState<"ptt" | "mute" | "deafen" | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      const data: { username?: string; currentPassword?: string; newPassword?: string; statusText?: string | null } = {};
      if (username !== user?.username) data.username = username;
      if ((user?.statusText ?? "") !== statusText) {
        data.statusText = statusText.trim() || null;
      }
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

  function handleHotkeyDown(target: "ptt" | "mute" | "deafen") {
    return (e: KeyboardEvent<HTMLButtonElement>) => {
      if (recordingKey !== target) return;
      e.preventDefault();
      const tauriKey = ALLOWED_PTT_KEYS[e.key];
      if (!tauriKey) return;
      if (target === "ptt") voice.setPttKey(tauriKey);
      else if (target === "mute") voice.setMuteKey(tauriKey);
      else voice.setDeafenKey(tauriKey);
      setRecordingKey(null);
    };
  }

  async function handleDeleteAccount() {
    if (!token) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteAccount(token);
      logout();
      onClose();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erro ao deletar conta");
      setDeleting(false);
    }
  }

  const updateLabel: Record<UpdateStatus, string> = {
    idle: "Verificar atualização",
    checking: "Verificando...",
    latest: "Você já está na versão mais recente",
    downloading: "Baixando e instalando...",
    error: "Erro ao verificar — tente novamente",
  };

  function HotkeyRow({
    label,
    hint,
    value,
    recording,
    onKeyDown,
    onToggle,
    onClear,
  }: {
    label: string;
    hint: string;
    value: string | null;
    recording: boolean;
    onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
    onToggle: () => void;
    onClear: () => void;
  }) {
    return (
      <div className="settings-hotkey-row">
        <div className="settings-hotkey-label">
          <strong>{label}</strong>
          <span>{hint}</span>
        </div>
        <span className="settings-ptt-key">{value ?? "Não configurado"}</span>
        <button
          className={recording ? "btn-danger-outline" : "btn-secondary"}
          onKeyDown={onKeyDown}
          onClick={onToggle}
          style={{ fontSize: 13, padding: "6px 12px" }}
        >
          {recording ? "Aguardando..." : "Alterar"}
        </button>
        {value && !recording && (
          <button
            className="btn-secondary"
            onClick={onClear}
            style={{ fontSize: 13, padding: "6px 12px" }}
          >
            Limpar
          </button>
        )}
      </div>
    );
  }

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
                <span>Status customizado</span>
                <input
                  value={statusText}
                  onChange={(e) => setStatusText(e.target.value)}
                  maxLength={128}
                  placeholder="Ex: Em reunião, AFK, Codando..."
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
            <h3>Atalhos globais</h3>
            <div className="settings-ptt">
              <HotkeyRow
                label="Push-to-talk"
                hint="Segure a tecla para falar enquanto mutado"
                value={voice.pttKey}
                recording={recordingKey === "ptt"}
                onKeyDown={handleHotkeyDown("ptt")}
                onToggle={() => setRecordingKey((k) => (k === "ptt" ? null : "ptt"))}
                onClear={() => voice.setPttKey(null)}
              />
              <HotkeyRow
                label="Toggle mute"
                hint="Alterna microfone com um toque"
                value={voice.muteKey}
                recording={recordingKey === "mute"}
                onKeyDown={handleHotkeyDown("mute")}
                onToggle={() => setRecordingKey((k) => (k === "mute" ? null : "mute"))}
                onClear={() => voice.setMuteKey(null)}
              />
              <HotkeyRow
                label="Toggle deafen"
                hint="Silencia você e os outros"
                value={voice.deafenKey}
                recording={recordingKey === "deafen"}
                onKeyDown={handleHotkeyDown("deafen")}
                onToggle={() => setRecordingKey((k) => (k === "deafen" ? null : "deafen"))}
                onClear={() => voice.setDeafenKey(null)}
              />
              {recordingKey && (
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
          <section className="settings-section settings-danger-zone">
            <h3>Zona de perigo</h3>
            {!showDeleteConfirm ? (
              <button
                className="btn-danger-outline"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Deletar conta
              </button>
            ) : (
              <div className="settings-delete-confirm">
                <p>
                  Isso é permanente. Todos os seus dados serão apagados.
                  Digite <strong>{user?.username}</strong> para confirmar.
                </p>
                <input
                  value={deleteConfirmInput}
                  onChange={(e) => setDeleteConfirmInput(e.target.value)}
                  placeholder={user?.username}
                  autoFocus
                />
                {deleteError && <p className="error" style={{ fontSize: 12 }}>{deleteError}</p>}
                <div className="settings-delete-actions">
                  <button
                    className="btn-danger-outline"
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmInput !== user?.username || deleting}
                  >
                    {deleting ? "Deletando..." : "Confirmar exclusão"}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmInput(""); setDeleteError(null); }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
