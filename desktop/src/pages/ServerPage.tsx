import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVoice } from "../contexts/VoiceContext";
import { api, Room, Server } from "../lib/api";
import { ChatPanel } from "../components/ChatPanel";
import { ParticipantCard } from "../components/ParticipantCard";
import { VoiceBar } from "../components/VoiceBar";

export function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const { user, token } = useAuth();
  const voice = useVoice();

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

  async function handleEnterRoom(room: Room) {
    if (!token || !serverId) return;
    await voice.connect(token, serverId, room.id, room.name);
  }

  if (loading) return <div className="server-loading">Carregando...</div>;

  return (
    <div className="server-content">
      {/* Coluna esquerda — salas de voz */}
      <div className="rooms-column">
        <div className="rooms-scroll">
          <div className="rooms-column-header">
            <h1>{server?.name ?? "Servidor"}</h1>
            <button
              className="btn-secondary"
              onClick={() => setShowInvite(!showInvite)}
              style={{ padding: "6px 12px", fontSize: "12px" }}
            >
              Convidar
            </button>
          </div>

          {showInvite && (
            <div className="invite-box">
              <span>Código:</span>
              <code>{inviteCode}</code>
              <button
                onClick={() => navigator.clipboard.writeText(inviteCode)}
                className="btn-secondary"
                style={{ padding: "4px 10px", fontSize: "12px" }}
              >
                Copiar
              </button>
              {server?.ownerId === user?.id && (
                <button
                  onClick={handleResetInvite}
                  className="btn-danger-outline"
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  Resetar
                </button>
              )}
            </div>
          )}

          <form onSubmit={onCreateRoom} style={{ display: "flex", gap: "6px" }}>
            <input
              placeholder="Nova sala..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              maxLength={64}
              style={{ fontSize: "13px", padding: "8px 10px" }}
            />
            <button
              type="submit"
              disabled={!newRoomName.trim()}
              style={{ padding: "8px 12px", fontSize: "13px", flexShrink: 0 }}
            >
              +
            </button>
          </form>

          {error && <p className="error" style={{ fontSize: "13px" }}>{error}</p>}
          {voice.error && <p className="error" style={{ fontSize: "13px" }}>{voice.error}</p>}

          <ul className="voice-room-list">
            {rooms.length === 0 ? (
              <p className="empty" style={{ padding: "24px 0", fontSize: "13px" }}>
                Nenhuma sala ainda.
              </p>
            ) : (
              rooms.map((room) => {
                const isActive = voice.activeRoomId === room.id && voice.activeServerId === serverId;
                return (
                  <li key={room.id} className={`voice-room-item ${isActive ? "active" : ""}`}>
                    <div className="voice-room-header">
                      <span className="voice-room-icon">🔊</span>
                      <span className="voice-room-name">{room.name}</span>
                      {isActive ? (
                        <button
                          className="btn-danger-outline voice-room-action"
                          onClick={voice.disconnect}
                        >
                          Sair
                        </button>
                      ) : (
                        <button
                          className="voice-room-action"
                          onClick={() => handleEnterRoom(room)}
                        >
                          Entrar
                        </button>
                      )}
                    </div>

                    {isActive ? (
                      <div className="participant-grid">
                        {voice.participants.map((p) => (
                          <ParticipantCard
                            key={p.identity}
                            participant={p}
                            nickname={voice.nicknames[p.identity] ?? ""}
                            userVolume={voice.userVolumes[p.identity] ?? 1}
                            onSetNickname={(n) => voice.setNickname(p.identity, n)}
                            onSetVolume={(v) => voice.setUserVolume(p.identity, v)}
                          />
                        ))}
                      </div>
                    ) : (
                      <span className={`voice-room-count ${room.onlineCount > 0 ? "online" : ""}`}>
                        {room.onlineCount > 0 ? `${room.onlineCount} online` : "vazia"}
                      </span>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <VoiceBar />
      </div>

      {/* Coluna direita — chat */}
      {token && user && serverId && (
        <ChatPanel
          serverId={serverId}
          token={token}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}
