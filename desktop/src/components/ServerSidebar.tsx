import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useVoice } from "../contexts/VoiceContext";
import { useDM } from "../contexts/DMContext";
import { Server } from "../lib/api";
import { Avatar } from "./Avatar";
import { LogoMark } from "./LogoMark";
import { Ico } from "./icons";
import { avatarBg } from "../lib/avatar";

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
  const { activeServerId, participants } = useVoice();
  const { incoming } = useDM();
  const [copied, setCopied] = useState<string | null>(null);
  const dmActive = !serverId && window.location.pathname.startsWith("/dm");

  const someoneSpeaking = participants.some((p) => p.isSpeaking && !p.isMuted);

  function copyInvite(server: Server, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(`lobby://join/${server.inviteCode}`);
    setCopied(server.id);
    setTimeout(() => setCopied(null), 1500);
  }

  function formatUnread(n: number): string {
    return n > 99 ? "99+" : String(n);
  }

  return (
    <nav className="server-rail">
      <div className={`server-rail-icon-wrap${dmActive ? " active" : ""}`}>
        <span className="server-rail-pill" />
        <button
          className="server-rail-btn dm-btn"
          onClick={() => navigate("/dm")}
          title="Mensagens diretas"
        >
          <Ico.users />
          {incoming.length > 0 && (
            <span className="server-rail-unread">{incoming.length > 9 ? "9+" : incoming.length}</span>
          )}
        </button>
      </div>

      <div className="server-rail-divider" />

      {servers.map((s, idx) => {
        const active = s.id === serverId;
        const voiceHere = activeServerId === s.id;
        const unread = s.unreadCount ?? 0;
        const showUnread = unread > 0 && s.id !== serverId;

        return (
          <div
            key={s.id}
            className={`server-rail-icon-wrap${active ? " active" : ""}`}
          >
            <span className="server-rail-pill" />
            <button
              className={`server-rail-btn${idx === 0 ? " brand" : ""}`}
              style={
                idx === 0
                  ? undefined
                  : { background: avatarBg(s.id) }
              }
              onClick={() => navigate(`/servers/${s.id}`)}
              title={s.name}
            >
              {idx === 0 ? (
                <LogoMark size={24} withShadow={false} />
              ) : (
                s.name.slice(0, 2).toUpperCase()
              )}
              {voiceHere && (
                <span className={`server-rail-voice-dot${someoneSpeaking ? " speaking" : ""}`} />
              )}
              {showUnread && (
                <span className="server-rail-unread">{formatUnread(unread)}</span>
              )}
            </button>
            <button
              className="server-rail-copy"
              onClick={(e) => copyInvite(s, e)}
              title="Copiar link de convite"
            >
              {copied === s.id ? "✓" : "⎘"}
            </button>
          </div>
        );
      })}

      <div className="server-rail-divider" />

      <button
        className="server-rail-add"
        onClick={onAdd}
        title="Criar ou entrar em servidor"
      >
        +
      </button>

      <div className="server-rail-footer">
        <div className="server-rail-user" title={user?.username ?? ""}>
          {user && <Avatar name={user.username} id={user.id} size={38} />}
          <span className="server-rail-user-dot" />
        </div>
        <div className="server-rail-actions">
          <button
            className="server-rail-action"
            onClick={onSettings}
            title="Configurações"
          >
            <Ico.settings />
          </button>
          <button
            className="server-rail-action logout"
            onClick={onLogout}
            title="Sair"
          >
            <Ico.logout />
          </button>
        </div>
      </div>
    </nav>
  );
}
