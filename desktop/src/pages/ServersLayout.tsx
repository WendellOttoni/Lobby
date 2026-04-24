import { useEffect, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { useAuth } from "../contexts/AuthContext";
import { useVoice } from "../contexts/VoiceContext";
import { api, Server } from "../lib/api";
import { ServerSidebar } from "../components/ServerSidebar";
import { ServerModal } from "../components/ServerModal";
import { SettingsModal } from "../components/SettingsModal";
import { useVisiblePolling } from "../lib/usePolling";

export function ServersLayout() {
  const { token, user, logout } = useAuth();
  const { isReconnecting, activeRoomName } = useVoice();
  const navigate = useNavigate();
  const { serverId } = useParams<{ serverId: string }>();
  const [servers, setServers] = useState<Server[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [modalInitialCode, setModalInitialCode] = useState<string | undefined>();
  const [showSettings, setShowSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadServers() {
    if (!token) return;
    try {
      const { servers } = await api.listServers(token);
      setServers(servers);
      if (!loaded) {
        setLoaded(true);
        if (!serverId && servers.length > 0) {
          navigate(`/servers/${servers[0].id}`, { replace: true });
        }
      }
      return servers;
    } catch {
      return [];
    }
  }

  // Poll para unread counts — pausa quando a janela fica oculta
  useVisiblePolling(loadServers, 30_000, !!token);

  // Mark active server as read
  useEffect(() => {
    if (!token || !serverId) return;
    api.markServerRead(token, serverId).catch(() => {});
    setServers((prev) =>
      prev.map((s) => (s.id === serverId ? { ...s, unreadCount: 0 } : s))
    );
  }, [token, serverId]);

  // Handle deep links: lobby://join/INVITE_CODE
  useEffect(() => {
    const unlisten = onOpenUrl((urls) => {
      for (const url of urls) {
        const match = url.match(/^lobby:\/\/join\/([a-z0-9]+)/i);
        if (match) {
          setModalInitialCode(match[1]);
          setShowModal(true);
          break;
        }
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function handleModalDone() {
    setShowModal(false);
    setModalInitialCode(undefined);
    const list = await loadServers();
    if (list && list.length > 0) {
      const newest = list[list.length - 1];
      navigate(`/servers/${newest.id}`);
    }
  }

  function handleModalClose() {
    setShowModal(false);
    setModalInitialCode(undefined);
  }

  return (
    <div className="app-layout">
      {isReconnecting && activeRoomName && (
        <div className="reconnect-banner">
          <span className="reconnect-dot" />
          Conexão de voz caiu — reconectando em <b>{activeRoomName}</b>...
        </div>
      )}
      <ServerSidebar
        servers={servers}
        onAdd={() => { setModalInitialCode(undefined); setShowModal(true); }}
        user={user}
        onLogout={logout}
        onSettings={() => setShowSettings(true)}
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
        <ServerModal
          initialCode={modalInitialCode}
          onClose={handleModalClose}
          onDone={handleModalDone}
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
