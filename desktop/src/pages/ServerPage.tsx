import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, Room, Server } from "../lib/api";

export function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [server, setServer] = useState<Server | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadRooms() {
    if (!token || !serverId) return;
    try {
      const { rooms } = await api.listRooms(token, serverId);
      setRooms(rooms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao listar salas");
    }
  }

  useEffect(() => {
    if (!token || !serverId) return;
    setLoading(true);
    setServer(null);

    Promise.all([
      api.getServer(token, serverId),
      api.listRooms(token, serverId),
    ])
      .then(([{ server }, { rooms }]) => {
        setServer(server);
        setRooms(rooms);
        setInviteCode(server.inviteCode);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro"))
      .finally(() => setLoading(false));

    intervalRef.current = setInterval(loadRooms, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, serverId]);

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !serverId || !newRoomName.trim()) return;
    try {
      await api.createRoom(token, serverId, newRoomName.trim());
      setNewRoomName("");
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar sala");
    }
  }

  async function handleResetInvite() {
    if (!token || !serverId) return;
    try {
      const { inviteCode: newCode } = await api.resetInvite(token, serverId);
      setInviteCode(newCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao resetar convite");
    }
  }

  function enterRoom(room: Room) {
    navigate(`/servers/${serverId}/rooms/${room.id}`, {
      state: { roomName: room.name },
    });
  }

  const userInitials = user?.username
    ? user.username.slice(0, 2).toUpperCase()
    : "?";

  if (loading) return <div className="server-loading">Carregando...</div>;

  return (
    <main className="server-page">
      <header>
        <h1>{server?.name ?? "Servidor"}</h1>
        <div className="header-actions">
          <button className="btn-secondary" onClick={() => setShowInvite(!showInvite)}>
            Convidar
          </button>
          <div className="user-info">
            <div className="user-avatar">{userInitials}</div>
            <span className="user-name">{user?.username}</span>
            <button className="btn-secondary" onClick={logout} style={{ padding: "6px 12px", fontSize: "13px" }}>
              Sair
            </button>
          </div>
        </div>
      </header>

      {showInvite && (
        <div className="invite-box">
          <span>Código de convite:</span>
          <code>{inviteCode}</code>
          <button
            onClick={() => navigator.clipboard.writeText(inviteCode)}
            className="btn-secondary"
          >
            Copiar
          </button>
          {server?.ownerId === user?.id && (
            <button onClick={handleResetInvite} className="btn-danger-outline">
              Resetar
            </button>
          )}
        </div>
      )}

      <form className="create-room" onSubmit={onCreateRoom}>
        <input
          placeholder="Nome da nova sala de voz..."
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          maxLength={64}
        />
        <button type="submit" disabled={!newRoomName.trim()}>
          Criar sala
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {rooms.length === 0 ? (
        <p className="empty">Nenhuma sala ainda. Crie a primeira!</p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => (
            <li key={room.id} onClick={() => enterRoom(room)}>
              <div className="room-list-left">
                <span className="room-list-icon">🔊</span>
                <div className="room-list-info">
                  <strong>{room.name}</strong>
                  <span className={`members ${room.onlineCount > 0 ? "online" : ""}`}>
                    {room.onlineCount > 0 ? `${room.onlineCount} online` : "vazia"}
                  </span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); enterRoom(room); }}>
                Entrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
