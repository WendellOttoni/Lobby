import { MouseEvent, useState } from "react";
import { VoiceParticipant } from "../contexts/VoiceContext";
import { avatarBg, avatarInitials } from "../lib/avatar";
import { ParticipantContextMenu } from "./ParticipantContextMenu";

interface Props {
  participant: VoiceParticipant;
  nickname: string;
  userVolume: number;
  onSetNickname: (name: string) => void;
  onSetVolume: (v: number) => void;
}

export function ParticipantCard({
  participant,
  nickname,
  userVolume,
  onSetNickname,
  onSetVolume,
}: Props) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const displayName = nickname || participant.name;
  const hasNickname = !!nickname;

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    if (participant.isLocal) return;
    setMenuPos({ x: e.clientX, y: e.clientY });
  }

  return (
    <>
      <div
        className={`participant-card ${participant.isSpeaking ? "speaking" : ""} ${
          participant.isMuted ? "is-muted" : ""
        } ${participant.isLocal ? "is-local" : ""}`}
        onContextMenu={openMenu}
        title={participant.isLocal ? "Você" : "Clique direito para opções"}
      >
        <div className="participant-avatar-wrap">
          <div
            className="participant-avatar"
            style={{ background: avatarBg(participant.identity) }}
          >
            {avatarInitials(displayName)}
          </div>
          {participant.isMuted && <span className="participant-mute-badge">🔇</span>}
        </div>
        <div className="participant-info">
          <span className="participant-name">
            {displayName}
            {participant.isLocal && <span className="participant-you"> (você)</span>}
          </span>
          <div className="participant-meta">
            {hasNickname && (
              <span className="participant-real-name" title={`Nome real: ${participant.name}`}>
                {participant.name}
              </span>
            )}
            {!participant.isLocal && userVolume !== 1 && (
              <span className="participant-vol-badge">{Math.round(userVolume * 100)}%</span>
            )}
          </div>
        </div>
      </div>

      {menuPos && (
        <ParticipantContextMenu
          position={menuPos}
          realName={participant.name}
          initialNickname={nickname}
          initialVolume={userVolume}
          onSetNickname={onSetNickname}
          onSetVolume={onSetVolume}
          onClose={() => setMenuPos(null)}
        />
      )}
    </>
  );
}
