import { ConnectionQuality, ConnectionState } from "livekit-client";
import { useVoice } from "../contexts/VoiceContext";
import { WaveBars } from "./WaveBars";
import { Ico } from "./icons";

function qualityLabel(q: ConnectionQuality): { color: string; text: string } {
  switch (q) {
    case ConnectionQuality.Excellent: return { color: "var(--good)", text: "Excelente" };
    case ConnectionQuality.Good: return { color: "var(--good)", text: "Boa" };
    case ConnectionQuality.Poor: return { color: "var(--warn, #e0a040)", text: "Ruim" };
    case ConnectionQuality.Lost: return { color: "var(--bad, #e04040)", text: "Perdida" };
    default: return { color: "var(--text-muted)", text: "—" };
  }
}

export function VoiceBar() {
  const {
    activeRoomName,
    connectionState,
    isMuted,
    isDeafened,
    isReconnecting,
    participants,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    disconnect,
    localQuality,
    rtt,
    isScreenSharing,
    activeServerId,
  } = useVoice();

  if (!activeRoomName) return null;

  const isConnected = connectionState === ConnectionState.Connected;
  const count = participants.length;
  const q = qualityLabel(localQuality);

  const statusLabel = isConnected
    ? `Ao vivo · ${count} ${count === 1 ? "pessoa" : "pessoas"}`
    : isReconnecting
    ? "Reconectando..."
    : "Conectando...";

  const qualityTitle = isConnected
    ? `Qualidade: ${q.text}${rtt !== null ? ` · ${rtt}ms` : ""}`
    : "Sem conexão";

  return (
    <div className="now-playing">
      <div className="now-playing-top">
        <div className="now-playing-tile">
          <Ico.wave />
        </div>
        <div className="now-playing-title">
          <div className="now-playing-name">{activeRoomName}</div>
          <div className={`now-playing-status${isConnected ? "" : " warn"}`}>
            <span className="now-playing-status-dot" />
            {statusLabel}
          </div>
        </div>
        <div className="now-playing-quality" title={qualityTitle}>
          <QualityBars quality={localQuality} />
          {rtt !== null && isConnected && (
            <span className="now-playing-rtt">{rtt}ms</span>
          )}
        </div>
        <WaveBars live={isConnected && !isMuted} color="var(--cyan)" count={5} />
      </div>
      <div className="now-playing-actions">
        <button
          className={`now-playing-btn${isMuted ? " muted" : ""}`}
          onClick={toggleMute}
          disabled={!isConnected}
          title={isMuted ? "Ativar microfone" : "Silenciar"}
        >
          {isMuted ? <Ico.micOff /> : <Ico.mic />}
          {isMuted ? "Mutado" : "Falar"}
        </button>
        <button
          className={`now-playing-btn${isDeafened ? " muted" : ""}`}
          onClick={toggleDeafen}
          disabled={!isConnected}
          title={isDeafened ? "Voltar a ouvir" : "Ensurdecer (silencia tudo)"}
        >
          {isDeafened ? <Ico.headphonesOff /> : <Ico.headphones />}
          {isDeafened ? "Surdo" : "Ouvindo"}
        </button>
        {activeServerId && (
          <button
            className={`now-playing-btn${isScreenSharing ? " muted" : ""}`}
            onClick={toggleScreenShare}
            disabled={!isConnected}
            title={isScreenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
          >
            <Ico.monitor />
            {isScreenSharing ? "Parar" : "Tela"}
          </button>
        )}
      </div>
      <button
        className="now-playing-btn-leave"
        onClick={disconnect}
        title="Sair da sala"
      >
        Sair da sala
      </button>
    </div>
  );
}

function QualityBars({ quality }: { quality: ConnectionQuality }) {
  const filled =
    quality === ConnectionQuality.Excellent ? 3 :
    quality === ConnectionQuality.Good ? 2 :
    quality === ConnectionQuality.Poor ? 1 :
    quality === ConnectionQuality.Lost ? 0 : 0;
  const color = qualityLabel(quality).color;
  return (
    <div className="quality-bars" aria-label={`Qualidade: ${qualityLabel(quality).text}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="quality-bar"
          style={{ background: i <= filled ? color : "var(--surface-3, rgba(255,255,255,0.08))" }}
          data-h={i}
        />
      ))}
    </div>
  );
}
