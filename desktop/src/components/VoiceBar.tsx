import { ConnectionState } from "livekit-client";
import { useVoice } from "../contexts/VoiceContext";
import { MicMeter } from "./MicMeter";

export function VoiceBar() {
  const {
    activeRoomName,
    connectionState,
    isMuted,
    localMicTrack,
    participants,
    volume,
    audioDevices,
    selectedDevice,
    toggleMute,
    disconnect,
    changeDevice,
    setVolumeAll,
  } = useVoice();

  if (!activeRoomName) return null;

  const isConnected = connectionState === ConnectionState.Connected;
  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    connectionState === ConnectionState.Reconnecting ||
    connectionState === ConnectionState.SignalReconnecting;

  return (
    <div className="voice-bar">
      <div className="voice-bar-header">
        <span className={`voice-bar-dot ${isConnected ? "green" : isConnecting ? "yellow" : "red"}`} />
        <div className="voice-bar-info">
          <span className="voice-bar-room">{activeRoomName}</span>
          <span className="voice-bar-sub">
            {isConnected ? `${participants.length} na sala` : isConnecting ? "conectando..." : "desconectado"}
          </span>
        </div>
        <button
          className="voice-bar-leave"
          onClick={disconnect}
          title="Sair da sala de voz"
        >
          ✕
        </button>
      </div>

      <div className="voice-bar-meter">
        <MicMeter track={localMicTrack} muted={isMuted} />
      </div>

      <div className="voice-bar-controls">
        <button
          className={`voice-bar-mute ${isMuted ? "muted" : ""}`}
          onClick={toggleMute}
          title={isMuted ? "Ativar microfone" : "Silenciar"}
          disabled={!isConnected}
        >
          {isMuted ? "🎙️ Ativado" : "🔇 Silenciar"}
        </button>
      </div>

      {audioDevices.length > 0 && (
        <select
          className="voice-bar-select"
          value={selectedDevice}
          onChange={(e) => changeDevice(e.target.value)}
        >
          {audioDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Microfone"}
            </option>
          ))}
        </select>
      )}

      <label className="voice-bar-volume">
        <span>Vol</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolumeAll(parseFloat(e.target.value))}
        />
      </label>
    </div>
  );
}
