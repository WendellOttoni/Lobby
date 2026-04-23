import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useVoice } from "../contexts/VoiceContext";
import { Server } from "../lib/api";

interface Props {
  servers: Server[];
  onAdd: () => void;
  user: { username: string; id: string } | null;
  onLogout: () => void;
  onSettings: () => void;
}

export function ServerSidebar({ servers, onAdd, user, onLogout, onSettings }: Props) {
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const { activeServerId } = useVoice();
  const [copied, setCopied] = useState<string | null>(null);

  function copyInvite(server: Server, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(`lobby://join/${server.inviteCode}`);
    setCopied(server.id);
    setTimeout(() => setCopied(null), 1500);
  }

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <nav className="server-sidebar">
      <div className="sidebar-icons">
        {servers.map((s) => (
          <div key={s.id} className="server-icon-wrap">
            <button
              className={`server-icon ${s.id === serverId ? "active" : ""}`}
              onClick={() => navigate(`/servers/${s.id}`)}
              title={s.name}
            >
              {s.name.slice(0, 2).toUpperCase()}
              {activeServerId === s.id && <span className="server-icon-voice-dot" />}
            </button>
            <button
              className="server-icon-copy"
              onClick={(e) => copyInvite(s, e)}
              title="Copiar link de convite"
            >
              {copied === s.id ? "✓" : "⎘"}
            </button>
          </div>
        ))}

        <div className="sidebar-divider" />

        <button
          className="server-icon add-server"
          onClick={onAdd}
          title="Criar ou entrar em servidor"
        >
          +
        </button>
      </div>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar" title={user?.username ?? ""}>
          {initials}
        </div>
        <div className="sidebar-user-actions">
          <button className="sidebar-action-btn" onClick={onSettings} title="Configurações">
            ⚙
          </button>
          <button className="sidebar-action-btn sidebar-action-logout" onClick={onLogout} title="Sair">
            ⏻
          </button>
        </div>
      </div>
    </nav>
  );
}
