import { useNavigate, useParams } from "react-router-dom";
import { Server } from "../lib/api";

interface Props {
  servers: Server[];
  onAdd: () => void;
}

export function ServerSidebar({ servers, onAdd }: Props) {
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();

  return (
    <nav className="server-sidebar">
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

      <button className="server-icon add-server" onClick={onAdd} title="Criar ou entrar em servidor">
        +
      </button>
    </nav>
  );
}
