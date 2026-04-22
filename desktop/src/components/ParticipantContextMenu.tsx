import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  position: { x: number; y: number };
  realName: string;
  initialNickname: string;
  initialVolume: number;
  onSetNickname: (name: string) => void;
  onSetVolume: (v: number) => void;
  onClose: () => void;
}

export function ParticipantContextMenu({
  position,
  realName,
  initialNickname,
  initialVolume,
  onSetNickname,
  onSetVolume,
  onClose,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [nickname, setNickname] = useState(initialNickname);
  const [volume, setVolume] = useState(initialVolume);
  const [pos, setPos] = useState(position);

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.min(position.x, window.innerWidth - rect.width - 8);
    const y = Math.min(position.y, window.innerHeight - rect.height - 8);
    setPos({ x, y });
  }, [position]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") commitAndClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commitAndClose() {
    if (nickname.trim() !== initialNickname) onSetNickname(nickname);
    onClose();
  }

  function handleVolumeChange(v: number) {
    setVolume(v);
    onSetVolume(v);
  }

  function reset() {
    setNickname("");
    onSetNickname("");
    setVolume(1);
    onSetVolume(1);
    onClose();
  }

  return (
    <div
      className="ctx-menu-overlay"
      onClick={commitAndClose}
      onContextMenu={(e) => {
        e.preventDefault();
        commitAndClose();
      }}
    >
      <div
        ref={menuRef}
        className="ctx-menu"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.stopPropagation()}
      >
        <div className="ctx-menu-header">{realName}</div>

        <label className="ctx-menu-row">
          <span>Apelido</span>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitAndClose();
              }
            }}
            placeholder={realName}
            maxLength={32}
            autoFocus
          />
        </label>

        <div className="ctx-menu-row column">
          <div className="ctx-menu-row-header">
            <span>Volume</span>
            <span className="ctx-menu-vol-value">{Math.round(volume * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="ctx-menu-actions">
          <button type="button" className="btn-secondary" onClick={reset}>
            Resetar
          </button>
          <button type="button" onClick={commitAndClose}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
