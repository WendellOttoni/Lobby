import { useNavigate, useParams } from "react-router-dom";
import { Server } from "../lib/api";

interface Props {
  servers: Server[];
  onAdd: () => void;
  user: { username: string; id: string } | null;
  onLogout: () => void;
}

export function ServerSidebar({ servers, onAdd, user, onLogout }: Props) {
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();

  const initials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <nav className="server-sidebar">
      <div className="sidebar-icons">
        {servers.map((s) => (
          <button
            key={s.id}
            className={`server-icon ${s.id === serverId ? "active" : ""}`}
            onClick={() => navigate(`/servers/${s.id}`)}
            title={s.name}
          >
            {s.name.slice(0, 2).toUpperCase()}
          </button>
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
        <button className="sidebar-logout-btn" onClick={onLogout}>
          sair
        </button>
      </div>
    </nav>
  );
}
