import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useVoice } from "../contexts/VoiceContext";
import { api, Category, Room, Server, TextChannel, VoiceParticipantPreview } from "../lib/api";
import { ChatPanel } from "../components/ChatPanel";
import { MemberList } from "../components/MemberList";
import { VoiceBar } from "../components/VoiceBar";
import { LogoMark } from "../components/LogoMark";
import { Avatar } from "../components/Avatar";
import { WaveBars } from "../components/WaveBars";
import { Ico } from "../components/icons";
import { ParticipantContextMenu } from "../components/ParticipantContextMenu";
import { PinsModal } from "../components/PinsModal";
import { useVisiblePolling } from "../lib/usePolling";

const COLLAPSED_KEY_PREFIX = "lobby_cat_collapsed_";

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

  const [server, setServer] = useState<Server | null>(null);
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
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    identity: string;
    name: string;
    x: number;
    y: number;
  } | null>(null);
  const [itemMenu, setItemMenu] = useState<{
    type: "channel" | "room" | "category";
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const isOwner = server?.ownerId === user?.id;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!serverId) return;
    setCollapsedCategories(loadCollapsed(serverId));
  }, [serverId]);

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
    setLoading(true);
    setCurrentChannelId(null);

    Promise.all([
      api.getServer(token, serverId),
      api.listRooms(token, serverId),
      api.listChannels(token, serverId),
      api.listCategories(token, serverId).catch(() => ({ categories: [] as Category[] })),
    ])
      .then(([{ server }, { rooms }, { channels, generalUnread }, { categories }]) => {
        setServer(server);
        setRooms(rooms);
        setChannels(channels);
        setCategories(categories);
        setGeneralUnread(generalUnread);
        setInviteCode(server.inviteCode);
        setError(null);
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

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsg(label);
    setTimeout(() => setCopiedMsg(null), 2000);
  }

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
    if (channelId === null) {
      setGeneralUnread((n) => n + 1);
    } else {
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, unreadCount: (c.unreadCount ?? 0) + 1 } : c))
      );
    }
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
      setChannels((prev) => [...prev, final]);
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
      setChannels((prev) => prev.filter((c) => c.id !== channel.id));
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
      setChannels((prev) => prev.map((c) => (c.id === channelId ? { ...c, name: channel.name } : c)));
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
      const [{ server: s }] = await Promise.all([api.getServer(token, serverId)]);
      setServer(s);
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

  const filteredRooms = useMemo(
    () => rooms.filter((r) => (search ? r.name.toLowerCase().includes(search.toLowerCase()) : true)),
    [rooms, search]
  );
  const filteredChannels = useMemo(
    () => channels.filter((c) => (search ? c.name.toLowerCase().includes(search.toLowerCase()) : true)),
    [channels, search]
  );
  const showGeneralChannel = !search || "geral".includes(search.toLowerCase());

  // Group items by category. Items without categoryId or with non-existent categoryId go to "uncategorized".
  const categoryIds = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  const channelsByCategory = useMemo(() => {
    const map = new Map<string | null, TextChannel[]>();
    for (const c of filteredChannels) {
      const key = c.categoryId && categoryIds.has(c.categoryId) ? c.categoryId : null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [filteredChannels, categoryIds]);
  const roomsByCategory = useMemo(() => {
    const map = new Map<string | null, Room[]>();
    for (const r of filteredRooms) {
      const key = r.categoryId && categoryIds.has(r.categoryId) ? r.categoryId : null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }, [filteredRooms, categoryIds]);

  const currentChannel = channels.find((c) => c.id === currentChannelId) ?? null;
  const activeChannelName = currentChannel?.name ?? "geral";

  if (loading && !server) {
    return <div className="server-loading">Carregando...</div>;
  }

  function renderChannelRow(c: TextChannel) {
    const unread = c.unreadCount ?? 0;
    const showBadge = unread > 0 && currentChannelId !== c.id;
    const isEditing = editingChannelId === c.id;
    return (
      <div
        key={c.id}
        className={`channel-row${currentChannelId === c.id ? " active" : ""}${showBadge ? " unread" : ""}`}
        onClick={() => !isEditing && switchChannel(c.id)}
        onContextMenu={isOwner ? (e) => {
          e.preventDefault();
          setItemMenu({ type: "channel", id: c.id, x: e.clientX, y: e.clientY });
        } : undefined}
      >
        <div className="channel-row-head">
          <span className="channel-row-icon"><Ico.hash /></span>
          {isEditing ? (
            <input
              className="channel-row-edit-input"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitRenameChannel(c.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameChannel(c.id);
                else if (e.key === "Escape") { setEditingChannelId(null); setEditDraft(""); }
              }}
              maxLength={64}
              autoFocus
            />
          ) : (
            <span className="channel-row-name">{c.name}</span>
          )}
          {showBadge && !isEditing && (
            <span className="channel-row-unread">{unread > 99 ? "99+" : unread}</span>
          )}
        </div>
      </div>
    );
  }

  function renderRoomRow(room: Room) {
    const isActive = voice.activeRoomId === room.id && voice.activeServerId === serverId;
    const previewParticipants = roomPreviews[room.id] ?? [];
    const hasParticipants = isActive ? voice.participants.length > 0 : previewParticipants.length > 0;
    const isLive = room.onlineCount > 0 || isActive;
    const isEditing = editingRoomId === room.id;

    return (
      <div
        key={room.id}
        className={`channel-row${isActive ? " active" : ""}`}
        onClick={() => !isActive && !isEditing && handleEnterRoom(room)}
        onContextMenu={isOwner ? (e) => {
          e.preventDefault();
          setItemMenu({ type: "room", id: room.id, x: e.clientX, y: e.clientY });
        } : undefined}
      >
        <div className="channel-row-head">
          <span className="channel-row-icon">
            <Ico.wave />
          </span>
          {isEditing ? (
            <input
              className="channel-row-edit-input"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => commitRenameRoom(room.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameRoom(room.id);
                else if (e.key === "Escape") { setEditingRoomId(null); setEditDraft(""); }
              }}
              maxLength={64}
              autoFocus
            />
          ) : (
            <span className="channel-row-name">{room.name}</span>
          )}

          {!isEditing && (
            isLive && isActive ? (
              <WaveBars live color="var(--good)" count={4} />
            ) : isLive ? (
              <span className="channel-row-voice-count online">
                {room.onlineCount}
              </span>
            ) : (
              <span className="channel-row-join">Entrar</span>
            )
          )}
        </div>

        {hasParticipants && !isEditing && (
          <div className="channel-row-voice-members">
            {isActive
              ? voice.participants.map((p) => (
                  <div
                    key={p.identity}
                    className={`channel-row-voice-member${p.isSpeaking ? " speaking" : ""}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (p.isLocal) return;
                      setCtxMenu({ identity: p.identity, name: p.name, x: e.clientX, y: e.clientY });
                    }}
                    title={p.isLocal ? "Você" : "Clique direito para ajustar volume/apelido"}
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
                ))
              : previewParticipants.map((p) => (
                  <div
                    key={p.identity}
                    className="channel-row-voice-member preview"
                    title={p.name}
                  >
                    <Avatar name={p.name} id={p.identity} size={22} />
                    <span className="channel-row-voice-member-name">{p.name}</span>
                  </div>
                ))}
          </div>
        )}
      </div>
    );
  }

  function renderCategorySection(catId: string | null, label: string, isCustomCategory: boolean) {
    const channelsHere = channelsByCategory.get(catId) ?? [];
    const roomsHere = roomsByCategory.get(catId) ?? [];
    const cat = catId ? categories.find((c) => c.id === catId) : null;
    const isCollapsed = catId !== null && collapsedCategories.has(catId);
    const isEditingCat = editingCategoryId === catId;

    if (!isCustomCategory && channelsHere.length === 0 && roomsHere.length === 0 && !showGeneralChannel) {
      return null;
    }

    return (
      <div key={catId ?? "uncategorized"} className="rooms-category-section">
        {(isCustomCategory || (catId === null && categories.length > 0)) && (
          <div
            className="rooms-section-label"
            onContextMenu={isOwner && cat ? (e) => {
              e.preventDefault();
              setItemMenu({ type: "category", id: cat.id, x: e.clientX, y: e.clientY });
            } : undefined}
          >
            <button
              className="rooms-section-label-text"
              onClick={() => catId && toggleCategoryCollapsed(catId)}
              style={{ background: "none", border: "none", padding: 0, cursor: catId ? "pointer" : "default" }}
            >
              <span style={{ display: "inline-flex", transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s" }}>
                <Ico.chev />
              </span>
              {isEditingCat && cat ? (
                <input
                  className="channel-row-edit-input"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onBlur={() => commitRenameCategory(cat.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRenameCategory(cat.id);
                    else if (e.key === "Escape") { setEditingCategoryId(null); setEditDraft(""); }
                  }}
                  maxLength={64}
                  autoFocus
                />
              ) : (
                label
              )}
            </button>
            {isOwner && cat && (
              <button
                className="rooms-section-add"
                onClick={(e) => {
                  e.stopPropagation();
                  setItemMenu({ type: "category", id: cat.id, x: e.clientX, y: e.clientY });
                }}
                title="Opções da categoria"
              >
                ⋯
              </button>
            )}
          </div>
        )}

        {!isCollapsed && (
          <>
            {catId === null && showGeneralChannel && (
              <button
                className={`channel-row${currentChannelId === null ? " active" : ""}${generalUnread > 0 && currentChannelId !== null ? " unread" : ""}`}
                onClick={() => switchChannel(null)}
              >
                <div className="channel-row-head">
                  <span className="channel-row-icon"><Ico.hash /></span>
                  <span className="channel-row-name">geral</span>
                  {generalUnread > 0 && currentChannelId !== null && (
                    <span className="channel-row-unread">{generalUnread > 99 ? "99+" : generalUnread}</span>
                  )}
                </div>
              </button>
            )}
            {channelsHere.map(renderChannelRow)}
            {roomsHere.map(renderRoomRow)}
          </>
        )}
      </div>
    );
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
                {isOwner && (
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
                      onClick={() => { setShowTransfer(true); setMenuOpen(false); }}
                    >
                      Transferir servidor
                    </button>
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

          {/* Uncategorized first */}
          {renderCategorySection(null, "Geral", false)}

          {/* Custom categories */}
          {categories.map((cat) => renderCategorySection(cat.id, cat.name, true))}

          {filteredRooms.length === 0 && filteredChannels.length === 0 && !search && categories.length === 0 && (
            <p style={{ padding: "14px 10px", fontSize: 12, color: "var(--text-muted)" }}>
              {isOwner ? "Crie uma categoria, canal ou sala pelo menu ⋯" : "Sem canais ou salas ainda."}
            </p>
          )}
        </div>

        {voice.activeRoomName && voice.activeServerId === serverId && <VoiceBar />}
      </div>

      {/* ── Chat ── */}
      {token && user && serverId && (
        <ChatPanel
          serverId={serverId}
          token={token}
          currentUserId={user.id}
          currentUsername={user.username}
          isOwner={isOwner}
          channelId={currentChannelId}
          channelName={activeChannelName}
          onToggleMembers={() => setShowMembers((v) => !v)}
          onOpenPins={() => setShowPins(true)}
          onChannelMessage={onChannelMessage}
          membersVisible={showMembers}
        />
      )}

      {showPins && token && serverId && (
        <PinsModal
          token={token}
          serverId={serverId}
          isOwner={isOwner}
          onClose={() => setShowPins(false)}
        />
      )}

      {/* ── Members ── */}
      {showMembers && token && serverId && (
        <MemberList serverId={serverId} token={token} />
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

      {ctxMenu && (
        <ParticipantContextMenu
          position={{ x: ctxMenu.x, y: ctxMenu.y }}
          realName={ctxMenu.name}
          initialNickname={voice.nicknames[ctxMenu.identity] ?? ""}
          initialVolume={voice.userVolumes[ctxMenu.identity] ?? 1}
          onSetNickname={(name) => voice.setNickname(ctxMenu.identity, name)}
          onSetVolume={(v) => voice.setUserVolume(ctxMenu.identity, v)}
          onClose={() => setCtxMenu(null)}
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

function ItemContextMenu({
  menu,
  categories,
  channels,
  rooms,
  onClose,
  onRename,
  onDelete,
  onMove,
}: {
  menu: { type: "channel" | "room" | "category"; id: string; x: number; y: number };
  categories: Category[];
  channels: TextChannel[];
  rooms: Room[];
  onClose: () => void;
  onRename: (type: "channel" | "room" | "category", id: string, currentName: string) => void;
  onDelete: (type: "channel" | "room" | "category", id: string) => void;
  onMove: (type: "channel" | "room", id: string, categoryId: string | null) => void;
}) {
  const item =
    menu.type === "channel" ? channels.find((c) => c.id === menu.id) :
    menu.type === "room" ? rooms.find((r) => r.id === menu.id) :
    categories.find((c) => c.id === menu.id);
  if (!item) return null;
  const currentCategoryId = menu.type === "category" ? null : (item as TextChannel | Room).categoryId ?? null;

  return (
    <div
      className="ctx-menu"
      style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 200 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ctx-menu-header">{item.name}</div>
      <button className="ctx-menu-item" onClick={() => onRename(menu.type, menu.id, item.name)}>
        Renomear
      </button>
      {menu.type !== "category" && categories.length > 0 && (
        <>
          <div className="ctx-menu-divider" />
          <div className="ctx-menu-section-label">Mover para</div>
          {currentCategoryId !== null && (
            <button
              className="ctx-menu-item"
              onClick={() => onMove(menu.type as "channel" | "room", menu.id, null)}
            >
              ↑ Sem categoria
            </button>
          )}
          {categories
            .filter((c) => c.id !== currentCategoryId)
            .map((c) => (
              <button
                key={c.id}
                className="ctx-menu-item"
                onClick={() => onMove(menu.type as "channel" | "room", menu.id, c.id)}
              >
                {c.name}
              </button>
            ))}
        </>
      )}
      <div className="ctx-menu-divider" />
      <button
        className="ctx-menu-item ctx-menu-item-danger"
        onClick={() => onDelete(menu.type, menu.id)}
      >
        Deletar
      </button>
      <button className="ctx-menu-item" onClick={onClose}>Cancelar</button>
    </div>
  );
}

function TransferModal({
  token,
  serverId,
  currentUserId,
  onTransfer,
  onClose,
}: {
  token: string;
  serverId: string;
  currentUserId: string;
  onTransfer: (id: string, name: string) => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<import("../lib/api").Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listMembers(token, serverId)
      .then(({ members }) => setMembers(members.filter((m) => m.id !== currentUserId)))
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao listar membros"));
  }, [token, serverId, currentUserId]);

  return (
    <div className="ctx-menu-overlay" onClick={onClose}>
      <div className="ctx-menu" style={{ minWidth: 240 }} onClick={(e) => e.stopPropagation()}>
        <div className="ctx-menu-header">Transferir servidor</div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0 8px" }}>
          Escolha o novo dono. Você vira membro.
        </p>
        {error && <p className="error" style={{ fontSize: 12, padding: "4px 0" }}>{error}</p>}
        {members.length === 0 && !error && (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem outros membros.</p>
        )}
        {members.map((m) => (
          <button
            key={m.id}
            className="btn-secondary"
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}
            onClick={() => onTransfer(m.id, m.username)}
          >
            {m.username}
            {m.role === "owner" && " (dono)"}
          </button>
        ))}
        <div className="ctx-menu-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
