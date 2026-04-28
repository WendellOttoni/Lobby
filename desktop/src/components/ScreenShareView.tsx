import { useEffect, useRef } from "react";
import { useVoice } from "../contexts/VoiceContext";

type Quality = "high" | "medium" | "low";

const QUALITY_LABELS: Record<Quality, string> = {
  high: "Alta · 1080p 30fps",
  medium: "Média · 1080p 15fps",
  low: "Baixa · 720p 5fps",
};

function VideoEl({ stream, muted = false }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} />;
}

export function ScreenShareView() {
  const {
    screenShareStreams,
    pausedStreams,
    mainStreamIdentity,
    screenShareQuality,
    toggleStreamPaused,
    setScreenShareQuality,
    setMainStream,
    participants,
    isScreenSharing,
    toggleScreenShare,
  } = useVoice();

  const entries = Object.entries(screenShareStreams);
  if (entries.length === 0) return null;

  const localIdentity = participants.find((p) => p.isLocal)?.identity ?? null;
  const mainId = mainStreamIdentity ?? entries[0][0];
  const mainStream = screenShareStreams[mainId];
  const sideEntries = entries.filter(([id]) => id !== mainId);
  const isLocalMain = mainId === localIdentity;

  function displayName(id: string) {
    return id === localIdentity ? "Você" : participants.find((p) => p.identity === id)?.name ?? id;
  }

  return (
    <div className="sstv-panel">
      {/* ── Main stream ──────────────────────────────── */}
      <div className="sstv-main">
        <div className="sstv-video-wrap">
          {pausedStreams.has(mainId) || !mainStream ? (
            <div className="sstv-paused-placeholder">
              <span>⏸</span>
              <p>Transmissão pausada</p>
            </div>
          ) : (
            <VideoEl stream={mainStream} muted={isLocalMain} />
          )}
        </div>

        <div className="sstv-main-bar">
          <span className="sstv-identity">{displayName(mainId)}</span>
          <div className="sstv-main-controls">
            {isLocalMain ? (
              isScreenSharing ? (
                <>
                  <span className="sstv-quality-label">Sua qualidade:</span>
                  <select
                    className="sstv-quality-select"
                    value={screenShareQuality}
                    onChange={(e) => setScreenShareQuality(e.target.value as Quality)}
                    title="Define a qualidade que você transmite"
                  >
                    {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
                      <option key={q} value={q}>{QUALITY_LABELS[q]}</option>
                    ))}
                  </select>
                  <button className="sstv-stop-btn" onClick={toggleScreenShare}>
                    ⏹ Parar transmissão
                  </button>
                </>
              ) : null
            ) : (
              <button
                className="sstv-pause-btn"
                onClick={() => toggleStreamPaused(mainId)}
                title="Pausar/retomar a exibição local"
              >
                {pausedStreams.has(mainId) ? "▶ Retomar" : "⏸ Pausar"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Sidebar (multiple streams) ────────────────── */}
      {sideEntries.length > 0 && (
        <div className="sstv-sidebar">
          {sideEntries.map(([id, stream]) => {
            const paused = pausedStreams.has(id);
            const isLocal = id === localIdentity;
            return (
              <div key={id} className="sstv-thumb" onClick={() => setMainStream(id)}>
                <div className="sstv-thumb-video">
                  {paused ? (
                    <div className="sstv-thumb-paused">⏸</div>
                  ) : (
                    <VideoEl stream={stream} muted={isLocal} />
                  )}
                  <div className="sstv-thumb-badge">{displayName(id)}</div>
                  <div className="sstv-thumb-hint">Clique para ampliar</div>
                </div>
                <div className="sstv-thumb-controls" onClick={(e) => e.stopPropagation()}>
                  {isLocal ? (
                    <span className="sstv-local-label">Sua tela</span>
                  ) : (
                    <button
                      className="sstv-pause-btn"
                      onClick={() => toggleStreamPaused(id)}
                      title={paused ? "Retomar" : "Pausar"}
                    >
                      {paused ? "▶" : "⏸"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
