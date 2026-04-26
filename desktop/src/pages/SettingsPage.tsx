import React, { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from "@tauri-apps/plugin-autostart";
import { useAuth } from "../contexts/AuthContext";
import { useVoice, isNotifyJoinEnabled, setNotifyJoinEnabled } from "../contexts/VoiceContext";
import { isSoundEnabled, setSoundEnabled } from "../lib/sounds";
import { isMentionNotifyEnabled, setMentionNotifyEnabled } from "../lib/notify";
import { api, User } from "../lib/api";
import { Avatar } from "../components/Avatar";
import { MicMeter } from "../components/MicMeter";
import { Ico } from "../components/icons";

type Section = "perfil" | "voz" | "notificacoes" | "atalhos" | "sistema" | "sobre" | "perigo";

const ALLOWED_PTT_KEYS: Record<string, string> = {
  CapsLock: "CapsLock", ScrollLock: "ScrollLock", Pause: "Pause",
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
  Insert: "Insert", Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
};

const NAV: { id: Section; label: string; icon: () => React.ReactElement; danger?: boolean }[] = [
  { id: "perfil",       label: "Perfil",        icon: Ico.user },
  { id: "voz",          label: "Voz",            icon: Ico.volume },
  { id: "notificacoes", label: "Notificações",   icon: Ico.bell },
  { id: "atalhos",      label: "Atalhos",        icon: Ico.keyboard },
  { id: "sistema",      label: "Sistema",        icon: Ico.monitor },
  { id: "sobre",        label: "Sobre",          icon: Ico.info },
  { id: "perigo",       label: "Zona de perigo", icon: Ico.danger, danger: true },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { user, token, setUser, logout } = useAuth();
  const voice = useVoice();
  const [section, setSection] = useState<Section>("perfil");

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") navigate(-1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <div className="settings-page">
      <aside className="settings-sidebar">
        <button className="settings-back-btn" onClick={() => navigate(-1)}>
          <Ico.back />
          Voltar
        </button>
        <div className="settings-sidebar-title">Configurações</div>
        <nav className="settings-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`settings-nav-item${section === item.id ? " active" : ""}${item.danger ? " danger" : ""}`}
              onClick={() => setSection(item.id)}
            >
              <item.icon />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-content">
        {section === "perfil"       && <PerfilSection user={user} token={token} setUser={setUser} />}
        {section === "voz"          && <VozSection voice={voice} />}
        {section === "notificacoes" && <NotificacoesSection />}
        {section === "atalhos"      && <AtalhosSection voice={voice} />}
        {section === "sistema"      && <SistemaSection />}
        {section === "sobre"        && <SobreSection />}
        {section === "perigo"       && <PerigoSection user={user} token={token} logout={logout} />}
      </div>
    </div>
  );
}

/* ── Perfil ── */
function PerfilSection({ user, token, setUser }: { user: User | null; token: string | null; setUser: (u: User) => void }) {
  const [username, setUsername] = useState(user?.username ?? "");
  const [statusText, setStatusText] = useState(user?.statusText ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setMsg(null);
    try {
      const data: Parameters<typeof api.updateMe>[1] = {};
      if (username !== user?.username) data.username = username;
      if ((user?.statusText ?? "") !== statusText) data.statusText = statusText.trim() || null;
      if (newPassword) { data.currentPassword = currentPassword; data.newPassword = newPassword; }
      const { user: updated } = await api.updateMe(token, data);
      setUser(updated as User);
      setCurrentPassword("");
      setNewPassword("");
      setMsg({ ok: true, text: "Salvo com sucesso!" });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  const usernameError =
    username.length > 0 && username.length < 3 ? "Mínimo 3 caracteres" :
    username.length > 32 ? "Máximo 32 caracteres" :
    !/^[a-zA-Z0-9_]+$/.test(username) ? "Use apenas letras, números e _" : null;
  const passwordError =
    newPassword.length > 0 && newPassword.length < 6 ? "Mínimo 6 caracteres" : null;
  const passwordCurrentError =
    newPassword.length > 0 && currentPassword.length === 0 ? "Necessário para trocar a senha" : null;
  const hasError = !!usernameError || !!passwordError || !!passwordCurrentError;

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Perfil</h2>

      <div className="settings-avatar-row">
        {user && <Avatar name={user.username} id={user.id} size={72} />}
        <div className="settings-avatar-info">
          <div className="settings-avatar-name">{user?.username}</div>
          <div className="settings-avatar-email">{user?.email}</div>
        </div>
      </div>

      <form onSubmit={handleSave} className="settings-form">
        <label className="settings-label">
          <span>Nome de usuário</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={32}
            required
            aria-invalid={!!usernameError}
          />
          {usernameError && <span className="settings-field-error">{usernameError}</span>}
        </label>
        <label className="settings-label">
          <span>Status customizado</span>
          <input value={statusText} onChange={(e) => setStatusText(e.target.value)} maxLength={128} placeholder="Ex: Em reunião, AFK, Codando..." />
          <span className="settings-field-hint">{statusText.length}/128</span>
        </label>
        <div className="settings-divider" />
        <h3 className="settings-subsection">Alterar senha</h3>
        <label className="settings-label">
          <span>Senha atual</span>
          <input
            type="password"
            placeholder="Deixe em branco para não alterar"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={!!passwordCurrentError}
          />
          {passwordCurrentError && <span className="settings-field-error">{passwordCurrentError}</span>}
        </label>
        <label className="settings-label">
          <span>Nova senha</span>
          <input
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={newPassword ? 6 : undefined}
            aria-invalid={!!passwordError}
          />
          {passwordError && <span className="settings-field-error">{passwordError}</span>}
        </label>
        {msg && <p className={msg.ok ? "settings-success" : "error"}>{msg.text}</p>}
        <button type="submit" disabled={saving || hasError}>{saving ? "Salvando..." : "Salvar alterações"}</button>
      </form>
    </div>
  );
}

/* ── Voz ── */
function VozSection({ voice }: { voice: ReturnType<typeof useVoice> }) {
  const [testTrack, setTestTrack] = useState<MediaStreamTrack | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (voice.audioDevices.length === 0 && !voice.localMicTrack) {
      voice.loadAudioDevices();
    }
    return () => {
      if (testTrack) testTrack.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startTest() {
    if (testing) return stopTest();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: voice.selectedDevice ? { exact: voice.selectedDevice } : undefined,
          noiseSuppression: voice.noiseSuppression,
          echoCancellation: voice.echoCancellation,
          autoGainControl: voice.autoGainControl,
        },
      });
      const track = stream.getAudioTracks()[0];
      setTestTrack(track);
      setTesting(true);
    } catch (e) {
      console.warn("[mic test]", e);
    }
  }

  function stopTest() {
    if (testTrack) {
      testTrack.stop();
      setTestTrack(null);
    }
    setTesting(false);
  }

  const activeMicTrack = voice.localMicTrack ?? testTrack;
  const meterMuted = voice.localMicTrack ? voice.isMuted : false;

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Voz</h2>

      <div className="settings-group">
        <h3 className="settings-subsection">Dispositivo de entrada</h3>
        {voice.audioDevices.length === 0 ? (
          <p className="settings-hint">
            Nenhum dispositivo carregado.{" "}
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => voice.loadAudioDevices()}
            >
              Carregar dispositivos
            </button>
          </p>
        ) : (
          <select
            className="settings-select"
            value={voice.selectedDevice}
            onChange={(e) => {
              if (voice.localMicTrack) voice.changeDevice(e.target.value);
              else {
                localStorage.setItem("lobby_mic_device", e.target.value);
                if (testing) { stopTest(); }
              }
            }}
          >
            {voice.audioDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${d.deviceId.slice(0, 8)}`}</option>
            ))}
          </select>
        )}
        {!voice.localMicTrack && voice.audioDevices.length > 0 && (
          <button
            type="button"
            className="btn-secondary"
            style={{ marginTop: 8, fontSize: 13 }}
            onClick={startTest}
          >
            <Ico.test /> {testing ? "Parar teste" : "Testar microfone"}
          </button>
        )}
        {activeMicTrack && (
          <div className="settings-mic-meter">
            <span className="settings-hint">Nível do microfone</span>
            <MicMeter track={activeMicTrack} muted={meterMuted} />
          </div>
        )}
      </div>

      <div className="settings-group">
        <h3 className="settings-subsection">Processamento de áudio</h3>
        <p className="settings-hint">Mudanças passam a valer ao reconectar na sala.</p>
        <div className="settings-toggles">
          <ToggleRow
            label="Supressão de ruído"
            hint="Remove ruídos de fundo (ventilador, teclado) usando o algoritmo do navegador"
            value={voice.noiseSuppression}
            onToggle={() => voice.setNoiseSuppression(!voice.noiseSuppression)}
          />
          <ToggleRow
            label="Cancelamento de eco"
            hint="Evita que sua voz volte como eco quando outros falam"
            value={voice.echoCancellation}
            onToggle={() => voice.setEchoCancellation(!voice.echoCancellation)}
          />
          <ToggleRow
            label="Ganho automático"
            hint="Normaliza o volume do seu mic — bom se sua voz oscila"
            value={voice.autoGainControl}
            onToggle={() => voice.setAutoGainControl(!voice.autoGainControl)}
          />
        </div>
      </div>

      <div className="settings-group">
        <h3 className="settings-subsection">Volume de saída</h3>
        <div className="settings-volume-row">
          <Ico.volume />
          <input
            type="range"
            min="0" max="1" step="0.01"
            value={voice.volume}
            onChange={(e) => voice.setVolumeAll(parseFloat(e.target.value))}
          />
          <span className="settings-volume-value">{Math.round(voice.volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
}

/* ── Notificações ── */
function NotificacoesSection() {
  const [notifyJoin, setNotifyJoinState]       = useState(() => isNotifyJoinEnabled());
  const [mentionNotify, setMentionNotifyState] = useState(() => isMentionNotifyEnabled());
  const [sound, setSoundState]                 = useState(() => isSoundEnabled());

  function toggle(
    current: boolean,
    setter: (v: boolean) => void,
    persist: (v: boolean) => void,
  ) {
    const next = !current;
    setter(next);
    persist(next);
  }

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Notificações</h2>
      <div className="settings-toggles">
        <ToggleRow
          label="Notificar entrada na sala de voz"
          hint="Notificação do sistema quando alguém entrar numa sala"
          value={notifyJoin}
          onToggle={() => toggle(notifyJoin, setNotifyJoinState, setNotifyJoinEnabled)}
        />
        <ToggleRow
          label="Notificar menções"
          hint="Notificação quando alguém usar @SeuNome no chat"
          value={mentionNotify}
          onToggle={() => toggle(mentionNotify, setMentionNotifyState, setMentionNotifyEnabled)}
        />
        <ToggleRow
          label="Som ao receber mensagem"
          hint="Toca um som quando chegar nova mensagem"
          value={sound}
          onToggle={() => toggle(sound, setSoundState, setSoundEnabled)}
        />
      </div>
    </div>
  );
}

/* ── Atalhos ── */
function AtalhosSection({ voice }: { voice: ReturnType<typeof useVoice> }) {
  const [recording, setRecording] = useState<"ptt" | "mute" | "deafen" | null>(null);

  function handleHotkeyDown(target: "ptt" | "mute" | "deafen") {
    return (e: KeyboardEvent<HTMLButtonElement>) => {
      if (recording !== target) return;
      e.preventDefault();
      const tauriKey = ALLOWED_PTT_KEYS[e.key];
      if (!tauriKey) return;
      if (target === "ptt") voice.setPttKey(tauriKey);
      else if (target === "mute") voice.setMuteKey(tauriKey);
      else voice.setDeafenKey(tauriKey);
      setRecording(null);
    };
  }

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Atalhos globais</h2>
      <p className="settings-hint">Os atalhos funcionam mesmo com o app minimizado no tray.</p>
      <div className="settings-hotkeys">
        <HotkeyRow label="Push-to-talk" hint="Segure para falar enquanto mutado" value={voice.pttKey}
          recording={recording === "ptt"} onKeyDown={handleHotkeyDown("ptt")}
          onToggle={() => setRecording((k) => k === "ptt" ? null : "ptt")}
          onClear={() => voice.setPttKey(null)} />
        <HotkeyRow label="Toggle mute" hint="Alterna microfone com um toque" value={voice.muteKey}
          recording={recording === "mute"} onKeyDown={handleHotkeyDown("mute")}
          onToggle={() => setRecording((k) => k === "mute" ? null : "mute")}
          onClear={() => voice.setMuteKey(null)} />
        <HotkeyRow label="Toggle deafen" hint="Silencia você e todos os outros" value={voice.deafenKey}
          recording={recording === "deafen"} onKeyDown={handleHotkeyDown("deafen")}
          onToggle={() => setRecording((k) => k === "deafen" ? null : "deafen")}
          onClear={() => voice.setDeafenKey(null)} />
      </div>
      {recording && (
        <p className="settings-hint" style={{ marginTop: 12 }}>
          Teclas suportadas: F1–F12, CapsLock, ScrollLock, Pause, Insert, Home, End, PageUp, PageDown
        </p>
      )}
    </div>
  );
}

/* ── Sistema ── */
type UpdateStatus = "idle" | "checking" | "latest" | "downloading" | "error";
const UPDATER_KEYWORDS = ["network", "connect", "dns", "timeout", "resolve", "offline"];

function SistemaSection() {
  const [autostart, setAutostart]       = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [updateError, setUpdateError]   = useState<string | null>(null);
  const [version, setVersion]           = useState<string | null>(null);

  useEffect(() => {
    autostartIsEnabled().then(setAutostart).catch(() => setAutostart(false));
    getVersion().then(setVersion).catch(() => setVersion("dev"));
  }, []);

  async function toggleAutostart() {
    try {
      if (autostart) { await autostartDisable(); setAutostart(false); }
      else           { await autostartEnable();  setAutostart(true);  }
    } catch (e) { console.error("[autostart]", e); }
  }

  async function handleCheckUpdate() {
    setUpdateStatus("checking");
    setUpdateError(null);
    try {
      const update = await check();
      if (!update) { setUpdateStatus("latest"); return; }
      setUpdateStatus("downloading");
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
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
    <div className="settings-section-content">
      <h2 className="settings-section-title">Sistema</h2>
      <div className="settings-toggles">
        <ToggleRow
          label="Iniciar com o Windows"
          hint="Lobby abre automaticamente ao ligar o computador"
          value={!!autostart}
          onToggle={toggleAutostart}
          disabled={autostart === null}
        />
      </div>
      <div className="settings-divider" />
      <div className="settings-group">
        <h3 className="settings-subsection">Atualizações</h3>
        {version && <p className="settings-version">Versão instalada: <code>{version}</code></p>}
        <button
          className={updateStatus === "latest" ? "btn-secondary" : ""}
          onClick={handleCheckUpdate}
          disabled={updateStatus === "checking" || updateStatus === "downloading"}
        >
          {updateLabel[updateStatus]}
        </button>
        {updateStatus === "error" && (
          <div style={{ marginTop: 8 }}>
            <p className="error" style={{ fontSize: 13 }}>
              {updateError && UPDATER_KEYWORDS.some((k) => updateError!.toLowerCase().includes(k))
                ? "Sem conexão com o servidor de atualizações."
                : "Falha ao verificar atualização."}
            </p>
            {updateError && <p style={{ fontSize: 11, opacity: 0.5, wordBreak: "break-word", marginTop: 4 }}>{updateError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sobre ── */
function SobreSection() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => setVersion("dev")); }, []);

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title">Sobre o Lobby</h2>
      <div className="settings-about">
        <div className="settings-about-logo">
          <span className="settings-about-wordmark">Lobby</span>
          {version && <span className="settings-about-version">v{version}</span>}
        </div>
        <p className="settings-hint">
          Comunicação por voz e texto para Windows. Alternativa leve ao Discord e TeamSpeak —
          foco em voz bem feita, binário pequeno e servidor próprio.
        </p>
        <div className="settings-about-stack">
          <span>Tauri v2</span>
          <span>React 18</span>
          <span>LiveKit</span>
          <span>PostgreSQL</span>
        </div>
      </div>
    </div>
  );
}

/* ── Zona de perigo ── */
function PerigoSection({
  user, token, logout,
}: {
  user: User | null;
  token: string | null;
  logout: () => void;
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!token) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteAccount(token);
      logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar conta");
      setDeleting(false);
    }
  }

  return (
    <div className="settings-section-content">
      <h2 className="settings-section-title danger">Zona de perigo</h2>
      <div className="settings-danger-card">
        <div>
          <strong>Deletar conta</strong>
          <p className="settings-hint">Remove permanentemente sua conta, todos os servidores que você criou e todas as suas mensagens. Essa ação não pode ser desfeita.</p>
        </div>
        {!showConfirm ? (
          <button className="btn-danger-outline" onClick={() => setShowConfirm(true)}>
            Deletar conta
          </button>
        ) : (
          <div className="settings-delete-confirm">
            <p>
              Digite <strong>{user?.username}</strong> para confirmar:
            </p>
            <input
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={user?.username}
              autoFocus
            />
            {error && <p className="error" style={{ fontSize: 12 }}>{error}</p>}
            <div className="settings-delete-actions">
              <button
                className="btn-danger-outline"
                onClick={handleDelete}
                disabled={confirmInput !== user?.username || deleting}
              >
                {deleting ? "Deletando..." : "Confirmar exclusão"}
              </button>
              <button className="btn-secondary" onClick={() => { setShowConfirm(false); setConfirmInput(""); setError(null); }}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Shared sub-components ── */
function ToggleRow({ label, hint, value, onToggle, disabled }: {
  label: string; hint: string; value: boolean; onToggle: () => void; disabled?: boolean;
}) {
  return (
    <div className="settings-toggle-row">
      <div className="settings-toggle-info">
        <strong>{label}</strong>
        <span>{hint}</span>
      </div>
      <button className={`settings-toggle ${value ? "on" : "off"}`} onClick={onToggle} disabled={disabled}>
        {value ? "Ativado" : "Desativado"}
      </button>
    </div>
  );
}

function HotkeyRow({ label, hint, value, recording, onKeyDown, onToggle, onClear }: {
  label: string; hint: string; value: string | null; recording: boolean;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onToggle: () => void; onClear: () => void;
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
        onKeyDown={onKeyDown} onClick={onToggle}
        style={{ fontSize: 13, padding: "6px 12px" }}
      >
        {recording ? "Aguardando..." : "Alterar"}
      </button>
      {value && !recording && (
        <button className="btn-secondary" onClick={onClear} style={{ fontSize: 13, padding: "6px 12px" }}>
          Limpar
        </button>
      )}
    </div>
  );
}
