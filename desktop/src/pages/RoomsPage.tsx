import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, Room } from "../lib/api";

export function RoomsPage() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadRooms() {
    if (!token) return;
    try {
      const { rooms } = await api.listRooms(token);
      setRooms(rooms);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao listar salas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRooms();
    intervalRef.current = setInterval(loadRooms, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token]);

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !newRoomName.trim()) return;
    try {
      await api.createRoom(token, newRoomName.trim());
      setNewRoomName("");
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar sala");
    }
  }

  return (
    <main className="rooms">
      <header>
        <h1>Salas</h1>
        <div className="user">
          <span>{user?.username}</span>
          <button onClick={logout}>Sair</button>
        </div>
      </header>

      <form className="create-room" onSubmit={onCreateRoom}>
        <input
          placeholder="Nome da nova sala"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          maxLength={64}
        />
        <button type="submit" disabled={!newRoomName.trim()}>
          Criar sala
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>Carregando...</p>
      ) : rooms.length === 0 ? (
        <p className="empty">Nenhuma sala ainda. Crie a primeira!</p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => (
            <li key={room.id}>
              <div>
                <strong>{room.name}</strong>
                <span className={`members ${room.onlineCount > 0 ? "online" : ""}`}>
                  {room.onlineCount > 0 ? `${room.onlineCount} online` : "vazia"}
                </span>
              </div>
              <button onClick={() => navigate(`/rooms/${room.id}`)}>
                Entrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
