import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVoice } from "../contexts/VoiceContext";
import { api, Room, Server } from "../lib/api";
import { ChatPanel } from "../components/ChatPanel";
import { MemberList } from "../components/MemberList";
import { VoiceBar } from "../components/VoiceBar";
import { LogoMark } from "../components/LogoMark";
import { Avatar } from "../components/Avatar";
import { WaveBars } from "../components/WaveBars";
import { Ico } from "../components/icons";

export function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const voice = useVoice();

  const [server, setServer] = useState<Server | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMembers, setShowMembers] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isOwner = server?.ownerId === user?.id;

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

    Promise.all([
      api.getServer(token, serverId),
      api.listRooms(token, serverId),
    ])
      .then(([{ server }, { rooms }]) => {
        setServer(server);
        setRooms(rooms);
        setInviteCode(server.inviteCode);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro"))
      .finally(() => setLoading(false));

    intervalRef.current = setInterval(loadRooms, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [token, serverId]);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsg(label);
    setTimeout(() => setCopiedMsg(null), 2000);
  }

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !serverId || !newRoomName.trim()) return;
    try {
      await api.createRoom(token, serverId, newRoomName.trim());
      setNewRoomName("");
      setShowNewRoom(false);
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar sala");
    }
  }

  async function handleDeleteRoom(room: Room, e: React.MouseEvent) {
    e.stopPropagation();
    if (!token || !serverId) return;
    if (!window.confirm(`Deletar a sala "${room.name}"? Isso é permanente.`)) return;
    if (voice.activeRoomId === room.id) voice.disconnect();
    try {
      await api.deleteRoom(token, serverId, room.id);
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar sala");
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

  async function handleLeaveServer() {
    if (!token || !serverId) return;
    if (!window.confirm(`Sair do servidor "${server?.name}"?`)) return;
    try {
      voice.disconnect();
      await api.leaveServer(token, serverId);
      navigate("/servers", { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao sair do servidor");
    }
  }

  async function handleDeleteServer() {
    if (!token || !serverId) return;
    if (!window.confirm(`Deletar o servidor "${server?.name}" permanentemente? Isso remove todas as salas e mensagens.`)) return;
    try {
      voice.disconnect();
      await api.deleteServer(token, serverId);
      navigate("/servers", { replace: true });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar servidor");
    }
  }

  async function handleEnterRoom(room: Room) {
    if (!token || !serverId) return;
    await voice.connect(token, serverId, room.id, room.name);
  }

  const filteredRooms = rooms.filter((r) =>
    search ? r.name.toLowerCase().includes(search.toLowerCase()) : true
  );
  const textChannelActive = !search || "geral".includes(search.toLowerCase());

  if (loading && !server) {
    return <div className="server-loading">Carregando...</div>;
  }

  return (
    <div className="server-content">
      {/* ── Rooms column ── */}
      <div className="rooms-column">
        <div className="rooms-brand-header">
          <LogoMark size={30} />
          <div className="rooms-brand-header-title">
            <h1>{server?.name ?? "Lobby"}</h1>
            <div className="rooms-brand-sub">{server?.inviteCode}</div>
          </div>
          <button
            className="rooms-brand-header-btn"
            onClick={() => setMenuOpen((v) => !v)}
            title="Opções do servidor"
          >
            ⋯
            {menuOpen && (
              <div
                className="rooms-menu-popover"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: 30,
                  right: 0,
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: 6,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 180,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                  zIndex: 20,
                  textAlign: "left",
                }}
              >
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowInvite((v) => !v);
                    setMenuOpen(false);
                  }}
                  style={{ background: "transparent", justifyContent: "flex-start" }}
                >
                  Convite
                </button>
                {isOwner ? (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDeleteServer();
                    }}
                    style={{
                      background: "transparent",
                      color: "var(--danger)",
                      justifyContent: "flex-start",
                    }}
                  >
                    Deletar servidor
                  </button>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setMenuOpen(false);
                      handleLeaveServer();
                    }}
                    style={{
                      background: "transparent",
                      color: "var(--danger)",
                      justifyContent: "flex-start",
                    }}
                  >
                    Sair do servidor
                  </button>
                )}
              </div>
            )}
          </button>
        </div>

        <div className="rooms-search">
          <div className="rooms-search-box">
            <Ico.search />
            <input
              placeholder="Buscar canais…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className="rooms-search-kbd">⌘K</kbd>
          </div>
        </div>

        <div className="rooms-scroll">
          {showInvite && (
            <div className="invite-box">
              <span style={{ color: "var(--text-dim)" }}>Código de convite:</span>
              <code>{inviteCode}</code>
              <div className="invite-box-actions">
                <button
                  onClick={() => copy(inviteCode, "Código copiado!")}
                  className="btn-secondary"
                >
                  Copiar código
                </button>
                <button
                  onClick={() => copy(`lobby://join/${inviteCode}`, "Link copiado!")}
                  className="btn-secondary"
                >
                  Copiar link
                </button>
                {isOwner && (
                  <button
                    onClick={handleResetInvite}
                    className="btn-danger-outline"
                  >
                    Resetar
                  </button>
                )}
                {copiedMsg && (
                  <span className="invite-box-confirm">{copiedMsg}</span>
                )}
              </div>
            </div>
          )}

          {/* Text section */}
          {textChannelActive && (
            <>
              <SectionLabel label="Texto" />
              <button className="channel-row active">
                <div className="channel-row-head">
                  <span className="channel-row-icon">
                    <Ico.hash />
                  </span>
                  <span className="channel-row-name">geral</span>
                </div>
              </button>
            </>
          )}

          {/* Voice section */}
          <SectionLabel
            label="Voz"
            onAdd={() => setShowNewRoom((v) => !v)}
          />

          {showNewRoom && (
            <form onSubmit={onCreateRoom} className="rooms-new-room">
              <input
                placeholder="Nome da sala..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                maxLength={64}
                autoFocus
              />
              <button type="submit" disabled={!newRoomName.trim()}>
                ✓
              </button>
            </form>
          )}

          {error && <p className="error" style={{ padding: "8px 10px", fontSize: 12 }}>{error}</p>}
          {voice.error && (
            <p className="error" style={{ padding: "8px 10px", fontSize: 12 }}>
              {voice.error}
            </p>
          )}

          {filteredRooms.length === 0 && !search && (
            <p style={{ padding: "14px 10px", fontSize: 12, color: "var(--text-muted)" }}>
              Nenhuma sala de voz ainda.
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filteredRooms.map((room) => {
              const isActive =
                voice.activeRoomId === room.id && voice.activeServerId === serverId;
              const isLive = room.onlineCount > 0 || isActive;

              return (
                <button
                  key={room.id}
                  className={`channel-row${isActive ? " active" : ""}`}
                  onClick={() => !isActive && handleEnterRoom(room)}
                >
                  <div className="channel-row-head">
                    <span className="channel-row-icon">
                      <Ico.wave />
                    </span>
                    <span className="channel-row-name">{room.name}</span>

                    {isLive && isActive ? (
                      <WaveBars live color="var(--good)" count={4} />
                    ) : isLive ? (
                      <span className="channel-row-voice-count online">
                        {room.onlineCount}
                      </span>
                    ) : (
                      <span className="channel-row-join">Entrar</span>
                    )}

                    {isOwner && (
                      <span
                        className="channel-row-delete"
                        onClick={(e) => handleDeleteRoom(room, e)}
                        title="Deletar sala"
                      >
                        ×
                      </span>
                    )}
                  </div>

                  {isActive && voice.participants.length > 0 && (
                    <div className="channel-row-voice-members">
                      {voice.participants.map((p) => (
                        <div
                          key={p.identity}
                          className={`channel-row-voice-member${p.isSpeaking ? " speaking" : ""}`}
                        >
                          <Avatar
                            name={p.name}
                            id={p.identity}
                            size={22}
                            speaking={p.isSpeaking && !p.isMuted}
                            muted={p.isMuted}
                          />
                          <span className="channel-row-voice-member-name">
                            {voice.nicknames[p.identity] || p.name}
                          </span>
                          <span className={`channel-row-voice-member-mic${p.isMuted ? " muted" : ""}`}>
                            {p.isMuted ? <Ico.micOff /> : <Ico.mic />}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {voice.activeRoomName && voice.activeServerId === serverId && <VoiceBar />}
      </div>

      {/* ── Chat ── */}
      {token && user && serverId && (
        <ChatPanel
          serverId={serverId}
          token={token}
          currentUserId={user.id}
          onToggleMembers={() => setShowMembers((v) => !v)}
          membersVisible={showMembers}
        />
      )}

      {/* ── Members ── */}
      {showMembers && token && serverId && (
        <MemberList serverId={serverId} token={token} />
      )}
    </div>
  );
}

function SectionLabel({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="rooms-section-label">
      <span className="rooms-section-label-text">
        <Ico.chev />
        {label}
      </span>
      {onAdd && (
        <button
          className="rooms-section-add"
          onClick={onAdd}
          title={`Adicionar ${label.toLowerCase()}`}
        >
          <Ico.plus />
        </button>
      )}
    </div>
  );
}
