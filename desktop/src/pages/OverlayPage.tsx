import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { VoiceParticipant } from "../contexts/VoiceContext";
import { avatarBg } from "../lib/avatar";

interface VoiceUpdate {
  participants: VoiceParticipant[];
  roomName: string | null;
}

export function OverlayPage() {
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [roomName, setRoomName] = useState<string | null>(null);
  const win = getCurrentWindow();

  // Make the window background transparent for the overlay
  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<VoiceUpdate>("voice:update", (event) => {
      setParticipants(event.payload.participants);
      setRoomName(event.payload.roomName);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  if (!roomName && participants.length === 0) return null;

  return (
    <div className="overlay-root" data-tauri-drag-region>
      <div className="overlay-header" data-tauri-drag-region>
        <span className="overlay-room" data-tauri-drag-region>{roomName ?? "Voz"}</span>
        <button
          className="overlay-close"
          onClick={() => win.hide()}
          title="Fechar overlay"
        >
          ×
        </button>
      </div>
      <div className="overlay-participants">
        {participants.map((p) => (
          <div
            key={p.identity}
            className={`overlay-participant${p.isSpeaking && !p.isMuted ? " speaking" : ""}${p.isMuted ? " muted" : ""}`}
          >
            <div
              className="overlay-avatar"
              style={{ background: avatarBg(p.identity) }}
            >
              {(p.name || p.identity).slice(0, 1).toUpperCase()}
              {p.isSpeaking && !p.isMuted && <span className="overlay-speak-ring" />}
            </div>
            <span className="overlay-name">
              {p.name || p.identity}
              {p.isLocal && <span className="overlay-you"> (você)</span>}
            </span>
            {p.isMuted && (
              <svg className="overlay-mute-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
