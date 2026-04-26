import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  subtitle?: string | null;
}

export function TitleBar({ subtitle }: Props) {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="titlebar-logo" data-tauri-drag-region>▲</span>
        <span className="titlebar-app" data-tauri-drag-region>Lobby</span>
        {subtitle && (
          <>
            <span className="titlebar-sep" data-tauri-drag-region>·</span>
            <span className="titlebar-sub" data-tauri-drag-region>{subtitle}</span>
          </>
        )}
      </div>
      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          onClick={() => win.minimize()}
          title="Minimizar"
        >
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor" /></svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => win.toggleMaximize()}
          title={maximized ? "Restaurar" : "Maximizar"}
        >
          {maximized ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="0" width="8" height="8" />
              <polyline points="0,2 0,10 8,10" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0" y="0" width="10" height="10" />
            </svg>
          )}
        </button>
        <button
          className="titlebar-btn close"
          onClick={() => win.hide()}
          title="Fechar (minimiza para tray)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </div>
  );
}
