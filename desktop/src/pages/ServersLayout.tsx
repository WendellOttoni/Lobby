import { useEffect, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, Server } from "../lib/api";
import { ServerSidebar } from "../components/ServerSidebar";
import { ServerModal } from "../components/ServerModal";

export function ServersLayout() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const [servers, setServers] = useState<Server[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadServers() {
    if (!token) return;
    try {
      const { servers } = await api.listServers(token);
      setServers(servers);
      return servers;
    } catch {
      return [];
    }
  }

  useEffect(() => {
    loadServers().then((list) => {
      setLoaded(true);
      if (!serverId && list && list.length > 0) {
        navigate(`/servers/${list[0].id}`, { replace: true });
      }
    });
  }, [token]);

  async function handleModalDone() {
    setShowModal(false);
    const list = await loadServers();
    if (list && list.length > 0) {
      const newest = list[list.length - 1];
      navigate(`/servers/${newest.id}`);
    }
  }

  return (
    <div className="app-layout">
      <ServerSidebar
        servers={servers}
        onAdd={() => setShowModal(true)}
        user={user}
        onLogout={logout}
      />

      <div className="app-main">
        {loaded && servers.length === 0 ? (
          <div className="no-servers">
            <p>Você não está em nenhum servidor.</p>
            <button onClick={() => setShowModal(true)}>Criar ou entrar em um</button>
          </div>
        ) : (
          <main className="server-page">
            <Outlet context={{ servers, reloadServers: loadServers }} />
          </main>
        )}
      </div>

      {showModal && (
        <ServerModal onClose={() => setShowModal(false)} onDone={handleModalDone} />
      )}
    </div>
  );
}
