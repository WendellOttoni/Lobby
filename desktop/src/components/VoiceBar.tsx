import { ConnectionState } from "livekit-client";
import { useVoice } from "../contexts/VoiceContext";
import { WaveBars } from "./WaveBars";
import { Ico } from "./icons";

export function VoiceBar() {
  const {
    activeRoomName,
    connectionState,
    isMuted,
    isReconnecting,
    participants,
    toggleMute,
    disconnect,
  } = useVoice();

  if (!activeRoomName) return null;

  const isConnected = connectionState === ConnectionState.Connected;
  const listenerCount = Math.max(participants.length, 1);

  const statusLabel = isConnected
    ? `Ao vivo · ${listenerCount} ${listenerCount === 1 ? "ouvindo" : "ouvindo"}`
    : isReconnecting
    ? "Reconectando..."
    : "Conectando...";

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
          className="now-playing-btn-leave"
          onClick={disconnect}
          title="Sair da sala"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
