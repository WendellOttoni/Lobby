import { FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVoice } from "../contexts/VoiceContext";
import { api, Category, Room, Server, TextChannel, VoiceParticipantPreview } from "../lib/api";
import { ChatPanel } from "../components/ChatPanel";
import { MemberList } from "../components/MemberList";
import { VoiceBar } from "../components/VoiceBar";
import { LogoMark } from "../components/LogoMark";
import { Ico } from "../components/icons";
import { ParticipantContextMenu } from "../components/ParticipantContextMenu";
import { PinsModal } from "../components/PinsModal";
import { ItemContextMenu, ItemMenuState, ServerAdminModal, TransferModal } from "../components/ServerModals";
import { ScreenShareView } from "../components/ScreenShareView";
import { InvitePanel } from "../components/server/InvitePanel";
import { ChannelTree } from "../components/server/ChannelTree";
import { useVisiblePolling } from "../lib/usePolling";
import { isChannelMuted, isServerMuted, setChannelMuted, setServerMuted } from "../lib/mute";

const COLLAPSED_KEY_PREFIX = "lobby_cat_collapsed_";

interface ServerDataSnapshot {
  server: Server;
  role: string;
  rooms: Room[];
  channels: TextChannel[];
  categories: Category[];
  generalUnread: number;
  inviteCode: string;
}
const serverDataCache = new Map<string, ServerDataSnapshot>();

function loadCollapsed(serverId: string): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY_PREFIX + serverId);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsed(serverId: string, set: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY_PREFIX + serverId, JSON.stringify([...set]));
}

export function ServerPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const voice = useVoice();
  const screenShareCount = Object.keys(voice.screenShareStreams).length;

  useEffect(() => {
    if (screenShareCount > 0) setActiveView("screenshare");
    else setActiveView("chat");
  }, [screenShareCount > 0]);

  const [server, setServer] = useState<Server | null>(null);
  const [currentRole, setCurrentRole] = useState("member");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [channels, setChannels] = useState<TextChannel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [generalUnread, setGeneralUnread] = useState(0);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelCategory, setNewChannelCategory] = useState<string | null>(null);
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomCategory, setNewRoomCategory] = useState<string | null>(null);
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [roomPreviews, setRoomPreviews] = useState<Record<string, VoiceParticipantPreview[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showMembers, setShowMembers] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    identity: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [itemMenu, setItemMenu] = useState<ItemMenuState | null>(null);
  const [activeView, setActiveView] = useState<"chat" | "screenshare">("chat");
  const [serverMuted, setServerMutedState] = useState(false);
  const [mutedChannelKeys, setMutedChannelKeys] = useState(0);

  const isOwner = server?.ownerId === user?.id;
  const canManageServer = isOwner || currentRole === "admin";
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!serverId) return;
    setCollapsedCategories(loadCollapsed(serverId));
    setServerMutedState(isServerMuted(serverId));
    setMutedChannelKeys((n) => n + 1);
  }, [serverId]);

  useEffect(() => {
    if (!token || !serverId) return;
    let cancelled = false;
    api.listNotificationPreferences(token, serverId)
      .then(({ preferences }) => {
        if (cancelled) return;
        for (const pref of preferences) {
          if (pref.channelId === null) setServerMuted(serverId, pref.muted);
          else setChannelMuted(serverId, pref.channelId, pref.muted);
        }
        setServerMutedState(isServerMuted(serverId));
        setMutedChannelKeys((n) => n + 1);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, serverId]);

  useEffect(() => {
    if (!menuOpen) return;
    function close() { setMenuOpen(false); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!itemMenu) return;
    function close() { setItemMenu(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [itemMenu]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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

    const cached = serverDataCache.get(serverId);
    if (cached) {
      setServer(cached.server);
      setCurrentRole(cached.role);
      setRooms(cached.rooms);
      setChannels(cached.channels);
      setCategories(cached.categories);
      setGeneralUnread(cached.generalUnread);
      setInviteCode(cached.inviteCode);
      setLoading(false);
    } else {
      setLoading(true);
      setCurrentChannelId(null);
    }

    Promise.all([
      api.getServer(token, serverId),
      api.listRooms(token, serverId),
      api.listChannels(token, serverId),
      api.listCategories(token, serverId).catch(() => ({ categories: [] as Category[] })),
    ])
      .then(([{ server, role }, { rooms }, { channels, generalUnread }, { categories }]) => {
        setServer(server);
        setCurrentRole(role);
        setRooms(rooms);
        setChannels(channels);
        setCategories(categories);
        setGeneralUnread(generalUnread);
        setInviteCode(server.inviteCode);
        setError(null);
        serverDataCache.set(serverId, {
          server, role, rooms, channels, categories, generalUnread, inviteCode: server.inviteCode,
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro"))
      .finally(() => setLoading(false));
  }, [token, serverId]);

  useVisiblePolling(loadRooms, 20_000, !!token && !!serverId, { skipFirst: true });

  // Fetch participant previews for rooms with people in them (skip the active room — voice context already has those)
  useEffect(() => {
    if (!token || !serverId || rooms.length === 0) return;
    let cancelled = false;
    const inhabited = rooms.filter(
      (r) => r.onlineCount > 0 && !(voice.activeRoomId === r.id && voice.activeServerId === serverId)
    );
    if (inhabited.length === 0) {
      setRoomPreviews({});
      return;
    }
    Promise.all(
      inhabited.map((r) =>
        api.listRoomParticipants(token, serverId, r.id)
          .then(({ participants }) => [r.id, participants] as const)
          .catch(() => [r.id, []] as const)
      )
    ).then((entries) => {
      if (cancelled) return;
      setRoomPreviews(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [token, serverId, rooms, voice.activeRoomId, voice.activeServerId]);

  function switchChannel(id: string | null) {
    if (id === currentChannelId) return;
    setCurrentChannelId(id);
    if (!token || !serverId) return;
    if (id === null) {
      setGeneralUnread(0);
      api.markServerRead(token, serverId).catch(() => {});
    } else {
      setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      api.markChannelRead(token, serverId, id).catch(() => {});
    }
  }

  function onChannelMessage(channelId: string | null, authorId: string) {
    if (authorId === user?.id) return;
    if (channelId === currentChannelId) return;
    if (serverId && (serverMuted || isChannelMuted(serverId, channelId))) return;
    if (channelId === null) {
      setGeneralUnread((n) => n + 1);
    } else {
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c))
      );
    }
  }

  function toggleServerMuted() {
    if (!serverId) return;
    const next = !serverMuted;
    setServerMuted(serverId, next);
    setServerMutedState(next);
    if (token) api.setNotificationPreference(token, serverId, null, next).catch(() => {});
  }

  function toggleCurrentChannelMuted() {
    if (!serverId) return;
    const next = !isChannelMuted(serverId, currentChannelId);
    setChannelMuted(serverId, currentChannelId, next);
    setMutedChannelKeys((n) => n + 1);
    if (token) api.setNotificationPreference(token, serverId, currentChannelId, next).catch(() => {});
  }

  function patchCache(serverId: string, patch: Partial<ServerDataSnapshot>) {
    const entry = serverDataCache.get(serverId);
    if (entry) serverDataCache.set(serverId, { ...entry, ...patch });
  }

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault();
    if (!token || !serverId || !newChannelName.trim()) return;
    try {
      const { channel } = await api.createChannel(token, serverId, newChannelName.trim());
      let final = channel;
      if (newChannelCategory) {
        await api.setChannelCategory(token, serverId, channel.id, newChannelCategory);
        final = { ...channel, categoryId: newChannelCategory };
      }
      setChannels((prev) => { const next = [...prev, final]; patchCache(serverId, { channels: next }); return next; });
      setNewChannelName("");
      setNewChannelCategory(null);
      setShowNewChannel(false);
      setCurrentChannelId(channel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar canal");
    }
  }

  async function handleDeleteChannel(channel: TextChannel) {
    if (!token || !serverId) return;
    if (!window.confirm(`Deletar o canal "#${channel.name}"?`)) return;
    try {
      await api.deleteChannel(token, serverId, channel.id);
      setChannels((prev) => { const next = prev.filter((c) => c.id !== channel.id); patchCache(serverId, { channels: next }); return next; });
      if (currentChannelId === channel.id) setCurrentChannelId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar canal");
    }
  }

  async function commitRenameChannel(channelId: string) {
    if (!token || !serverId) return;
    const name = editDraft.trim();
    setEditingChannelId(null);
    setEditDraft("");
    if (!name) return;
    try {
      const { channel } = await api.renameChannel(token, serverId, channelId, name);
      setChannels((prev) => { const next = prev.map((c) => (c.id === channelId ? { ...c, name: channel.name } : c)); patchCache(serverId, { channels: next }); return next; });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao renomear canal");
    }
  }

  async function commitRenameRoom(roomId: string) {
    if (!token || !serverId) return;
    const name = editDraft.trim();
    setEditingRoomId(null);
    setEditDraft("");
    if (!name) return;
    try {
      const { room } = await api.renameRoom(token, serverId, roomId, name);
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, name: room.name } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao renomear sala");
    }
  }

  async function commitRenameCategory(categoryId: string) {
    if (!token || !serverId) return;
    const name = editDraft.trim();
    setEditingCategoryId(null);
    setEditDraft("");
    if (!name) return;
    try {
      const { category } = await api.renameCategory(token, serverId, categoryId, name);
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, name: category.name } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao renomear categoria");
    }
  }

  async function handleDeleteCategory(cat: Category) {
    if (!token || !serverId) return;
    if (!window.confirm(`Deletar a categoria "${cat.name}"? Os canais/salas dela ficam sem categoria.`)) return;
    try {
      await api.deleteCategory(token, serverId, cat.id);
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      setChannels((prev) => prev.map((c) => (c.categoryId === cat.id ? { ...c, categoryId: null } : c)));
      setRooms((prev) => prev.map((r) => (r.categoryId === cat.id ? { ...r, categoryId: null } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar categoria");
    }
  }

  async function moveChannelToCategory(channelId: string, categoryId: string | null) {
    if (!token || !serverId) return;
    try {
      await api.setChannelCategory(token, serverId, channelId, categoryId);
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, categoryId } : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao mover canal");
    }
  }

  async function moveRoomToCategory(roomId: string, categoryId: string | null) {
    if (!token || !serverId) return;
    try {
      await api.setRoomCategory(token, serverId, roomId, categoryId);
      setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, categoryId } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao mover sala");
    }
  }

  async function onCreateCategory(e: FormEvent) {
    e.preventDefault();
    if (!token || !serverId || !newCategoryName.trim()) return;
    try {
      const { category } = await api.createCategory(token, serverId, newCategoryName.trim());
      setCategories((prev) => [...prev, category]);
      setNewCategoryName("");
      setShowNewCategory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar categoria");
    }
  }

  function toggleCategoryCollapsed(catId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      if (serverId) saveCollapsed(serverId, next);
      return next;
    });
  }

  async function onCreateRoom(e: FormEvent) {
    e.preventDefault();
    if (!token || !serverId || !newRoomName.trim()) return;
    try {
      const { room } = await api.createRoom(token, serverId, newRoomName.trim());
      if (newRoomCategory) {
        await api.setRoomCategory(token, serverId, room.id, newRoomCategory);
      }
      setNewRoomName("");
      setNewRoomCategory(null);
      setShowNewRoom(false);
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar sala");
    }
  }

  async function handleDeleteRoom(room: Room) {
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

  async function handleResetInvite(opts: { maxUses: number | null; expiresInHours: number | null }) {
    if (!token || !serverId) return;
    try {
      const invite = await api.resetInvite(token, serverId, opts);
      const newCode = invite.inviteCode;
      setInviteCode(newCode);
      setServer((prev) => prev ? {
        ...prev,
        inviteCode: newCode,
        inviteUses: invite.inviteUses,
        inviteMaxUses: invite.inviteMaxUses,
        inviteExpiresAt: invite.inviteExpiresAt,
      } : prev);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao sair do servidor");
    }
  }

  async function handleTransferOwnership(newOwnerId: string, newOwnerName: string) {
    if (!token || !serverId) return;
    if (!window.confirm(`Transferir o servidor para ${newOwnerName}? Você vai virar membro comum.`)) return;
    try {
      await api.transferOwnership(token, serverId, newOwnerId);
      setShowTransfer(false);
      const [{ server: s, role }] = await Promise.all([api.getServer(token, serverId)]);
      setServer(s);
      setCurrentRole(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao transferir");
    }
  }

  async function handleDeleteServer() {
    if (!token || !serverId) return;
    if (!window.confirm(`Deletar o servidor "${server?.name}" permanentemente? Isso remove todas as salas e mensagens.`)) return;
    try {
      voice.disconnect();
      await api.deleteServer(token, serverId);
      navigate("/servers", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar servidor");
    }
  }

  async function handleEnterRoom(room: Room) {
    if (!token || !serverId) return;
    await voice.connect(token, serverId, room.id, room.name);
  }

  const currentChannel = channels.find((c) => c.id === currentChannelId) ?? null;
  const activeChannelName = currentChannel?.name ?? "geral";
  const currentChannelMuted = serverId ? isChannelMuted(serverId, currentChannelId) : false;
  const effectiveMuted = serverMuted || currentChannelMuted;
  void mutedChannelKeys;

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
              <div className="rooms-menu-popover" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn-secondary"
                  onClick={() => { setShowInvite((v) => !v); setMenuOpen(false); }}
                >
                  Convite
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => { toggleServerMuted(); setMenuOpen(false); }}
                >
                  {serverMuted ? "Ativar notificações" : "Silenciar servidor"}
                </button>
                {canManageServer && (
                  <>
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowNewCategory(true); setMenuOpen(false); }}
                    >
                      Nova categoria
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowNewChannel(true); setMenuOpen(false); }}
                    >
                      Novo canal
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowNewRoom(true); setMenuOpen(false); }}
                    >
                      Nova sala de voz
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => { setShowAdmin(true); setMenuOpen(false); }}
                    >
                      Administração
                    </button>
                    {isOwner && (
                      <button
                        className="btn-secondary"
                        onClick={() => { setShowTransfer(true); setMenuOpen(false); }}
                      >
                        Transferir servidor
                      </button>
                    )}
                  </>
                )}
                {isOwner ? (
                  <button
                    className="btn-secondary btn-danger"
                    onClick={() => { setMenuOpen(false); handleDeleteServer(); }}
                  >
                    Deletar servidor
                  </button>
                ) : (
                  <button
                    className="btn-secondary btn-danger"
                    onClick={() => { setMenuOpen(false); handleLeaveServer(); }}
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
              ref={searchRef}
              placeholder="Buscar canais…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className="rooms-search-kbd">⌘K</kbd>
          </div>
        </div>

        <div className="rooms-scroll">
          {showInvite && (
            <InvitePanel
              server={server}
              inviteCode={inviteCode}
              isOwner={isOwner}
              currentChannelMuted={currentChannelMuted}
              onResetInvite={handleResetInvite}
              onToggleCurrentChannelMuted={toggleCurrentChannelMuted}
            />
          )}

          {showNewCategory && (
            <form onSubmit={onCreateCategory} className="rooms-new-room">
              <input
                placeholder="Nome da categoria..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                maxLength={64}
                autoFocus
              />
              <button type="submit" disabled={!newCategoryName.trim()}>✓</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowNewCategory(false); setNewCategoryName(""); }} style={{ marginLeft: 4 }}>×</button>
            </form>
          )}

          {showNewChannel && (
            <form onSubmit={onCreateChannel} className="rooms-new-room">
              <input
                placeholder="Nome do canal..."
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                maxLength={64}
                autoFocus
              />
              {categories.length > 0 && (
                <select
                  value={newChannelCategory ?? ""}
                  onChange={(e) => setNewChannelCategory(e.target.value || null)}
                  className="rooms-new-select"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <button type="submit" disabled={!newChannelName.trim()}>✓</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowNewChannel(false); setNewChannelName(""); }} style={{ marginLeft: 4 }}>×</button>
            </form>
          )}

          {showNewRoom && (
            <form onSubmit={onCreateRoom} className="rooms-new-room">
              <input
                placeholder="Nome da sala..."
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                maxLength={64}
                autoFocus
              />
              {categories.length > 0 && (
                <select
                  value={newRoomCategory ?? ""}
                  onChange={(e) => setNewRoomCategory(e.target.value || null)}
                  className="rooms-new-select"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <button type="submit" disabled={!newRoomName.trim()}>✓</button>
              <button type="button" className="btn-secondary" onClick={() => { setShowNewRoom(false); setNewRoomName(""); }} style={{ marginLeft: 4 }}>×</button>
            </form>
          )}

          {error && <p className="error" style={{ padding: "8px 10px", fontSize: 12 }}>{error}</p>}
          {voice.error && (
            <p className="error" style={{ padding: "8px 10px", fontSize: 12 }}>
              {voice.error}
            </p>
          )}

          <ChannelTree
            serverId={serverId ?? ""}
            rooms={rooms}
            channels={channels}
            categories={categories}
            generalUnread={generalUnread}
            currentChannelId={currentChannelId}
            search={search}
            canManageServer={canManageServer}
            collapsedCategories={collapsedCategories}
            toggleCategoryCollapsed={toggleCategoryCollapsed}
            onSwitchChannel={switchChannel}
            onEnterRoom={handleEnterRoom}
            roomPreviews={roomPreviews}
            editingChannelId={editingChannelId}
            editingRoomId={editingRoomId}
            editingCategoryId={editingCategoryId}
            setEditingChannelId={setEditingChannelId}
            setEditingRoomId={setEditingRoomId}
            setEditingCategoryId={setEditingCategoryId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            commitRenameChannel={commitRenameChannel}
            commitRenameRoom={commitRenameRoom}
            commitRenameCategory={commitRenameCategory}
            onParticipantContext={(info) => setCtxMenu(info)}
            onItemContextMenu={(info) => setItemMenu(info)}
          />
        </div>

        {voice.activeRoomName && <VoiceBar />}
      </div>

      {/* ── Main content column (tabs + chat/screenshare) ── */}
      <div className="server-main-col">
        {/* Tab bar — só aparece quando há transmissões */}
        {screenShareCount > 0 && (
          <div className="server-view-tabs">
            <button
              className={`server-view-tab${activeView === "chat" ? " active" : ""}`}
              onClick={() => setActiveView("chat")}
            >
              Chat
            </button>
            <button
              className={`server-view-tab${activeView === "screenshare" ? " active" : ""}`}
              onClick={() => setActiveView("screenshare")}
            >
              Transmissões
              <span className="server-view-tab-badge">{screenShareCount}</span>
            </button>
          </div>
        )}

        {/* Screen share panel */}
        {activeView === "screenshare" && screenShareCount > 0 && <ScreenShareView />}

        {/* Chat */}
        {activeView === "chat" && token && user && serverId && (
          <ChatPanel
            serverId={serverId}
            token={token}
            currentUserId={user.id}
            currentUsername={user.username}
            isOwner={canManageServer}
            channelId={currentChannelId}
            channelName={activeChannelName}
            onToggleMembers={() => setShowMembers((v) => !v)}
            onOpenPins={() => setShowPins(true)}
            onChannelMessage={onChannelMessage}
            membersVisible={showMembers}
            muted={effectiveMuted}
          />
        )}
      </div>

      {showPins && token && serverId && (
        <PinsModal
          token={token}
          serverId={serverId}
          isOwner={canManageServer}
          onClose={() => setShowPins(false)}
        />
      )}

      {/* ── Members ── */}
      {showMembers && token && serverId && (
        <MemberList
          serverId={serverId}
          token={token}
          currentUserId={user?.id ?? ""}
          currentUserRole={isOwner ? "owner" : currentRole}
        />
      )}

      {showTransfer && token && serverId && user && (
        <TransferModal
          token={token}
          serverId={serverId}
          currentUserId={user.id}
          onTransfer={handleTransferOwnership}
          onClose={() => setShowTransfer(false)}
        />
      )}

      {showAdmin && token && serverId && (
        <ServerAdminModal
          token={token}
          serverId={serverId}
          onClose={() => setShowAdmin(false)}
        />
      )}

      {ctxMenu && (
        <ParticipantContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          realName={ctxMenu.name}
          initialNickname={voice.nicknames[ctxMenu.identity] ?? ""}
          initialVolume={voice.userVolumes[ctxMenu.identity] ?? 1}
          onSetNickname={(name) => voice.setNickname(ctxMenu.identity, name)}
          onSetVolume={(v) => voice.setUserVolume(ctxMenu.identity, v)}
          onClose={() => setCtxMenu(null)}
          canModerate={canManageServer && !!token && !!serverId && !!voice.activeRoomId}
          onForceMute={
            canManageServer && token && serverId && voice.activeRoomId
              ? async () => {
                  try {
                    await api.voiceForceMuteParticipant(token, serverId, voice.activeRoomId!, ctxMenu.identity);
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : "Falha ao silenciar");
                  }
                }
              : undefined
          }
          onDisconnect={
            canManageServer && token && serverId && voice.activeRoomId
              ? async () => {
                  try {
                    await api.voiceDisconnectParticipant(token, serverId, voice.activeRoomId!, ctxMenu.identity);
                  } catch (err) {
                    window.alert(err instanceof Error ? err.message : "Falha ao desconectar");
                  }
                }
              : undefined
          }
        />
      )}

      {itemMenu && (
        <ItemContextMenu
          menu={itemMenu}
          categories={categories}
          channels={channels}
          rooms={rooms}
          onClose={() => setItemMenu(null)}
          onRename={(type, id, currentName) => {
            setEditDraft(currentName);
            setItemMenu(null);
            if (type === "channel") setEditingChannelId(id);
            else if (type === "room") setEditingRoomId(id);
            else setEditingCategoryId(id);
          }}
          onDelete={(type, id) => {
            setItemMenu(null);
            if (type === "channel") {
              const c = channels.find((x) => x.id === id);
              if (c) handleDeleteChannel(c);
            } else if (type === "room") {
              const r = rooms.find((x) => x.id === id);
              if (r) handleDeleteRoom(r);
            } else {
              const cat = categories.find((x) => x.id === id);
              if (cat) handleDeleteCategory(cat);
            }
          }}
          onMove={(type, id, categoryId) => {
            setItemMenu(null);
            if (type === "channel") moveChannelToCategory(id, categoryId);
            else if (type === "room") moveRoomToCategory(id, categoryId);
          }}
        />
      )}
    </div>
  );
}

