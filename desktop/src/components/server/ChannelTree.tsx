import { useMemo } from "react";
import { Category, Room, TextChannel, VoiceParticipantPreview } from "../../lib/api";
import { useVoice } from "../../contexts/VoiceContext";
import { Avatar } from "../Avatar";
import { WaveBars } from "../WaveBars";
import { Ico } from "../icons";
import { ItemMenuState } from "../ServerModals";

export interface ParticipantCtxInfo {
  identity: string;
  name: string;
  x: number;
  y: number;
}

interface Props {
  serverId: string;
  rooms: Room[];
  channels: TextChannel[];
  categories: Category[];
  generalUnread: number;
  currentChannelId: string | null;
  search: string;
  canManageServer: boolean;
  collapsedCategories: Set<string>;
  toggleCategoryCollapsed: (id: string) => void;

  onSwitchChannel: (id: string | null) => void;
  onEnterRoom: (room: Room) => void;
  roomPreviews: Record<string, VoiceParticipantPreview[]>;

  editingChannelId: string | null;
  editingRoomId: string | null;
  editingCategoryId: string | null;
  setEditingChannelId: (id: string | null) => void;
  setEditingRoomId: (id: string | null) => void;
  setEditingCategoryId: (id: string | null) => void;
  editDraft: string;
  setEditDraft: (s: string) => void;
  commitRenameChannel: (id: string) => void;
  commitRenameRoom: (id: string) => void;
  commitRenameCategory: (id: string) => void;

  onParticipantContext: (info: ParticipantCtxInfo) => void;
  onItemContextMenu: (info: ItemMenuState) => void;
}

export function ChannelTree(props: Props) {
  const {
    serverId,
    rooms,
    channels,
    categories,
    generalUnread,
    currentChannelId,
    search,
    canManageServer,
    collapsedCategories,
    toggleCategoryCollapsed,
    onSwitchChannel,
    onEnterRoom,
    roomPreviews,
    editingChannelId,
    editingRoomId,
    editingCategoryId,
    setEditingChannelId,
    setEditingRoomId,
    setEditingCategoryId,
    editDraft,
    setEditDraft,
    commitRenameChannel,
    commitRenameRoom,
    commitRenameCategory,
    onParticipantContext,
    onItemContextMenu,
  } = props;
  const voice = useVoice();

  const filteredRooms = useMemo(
    () => rooms.filter((r) => (search ? r.name.toLowerCase().includes(search.toLowerCase()) : true)),
    [rooms, search]
  );
  const filteredChannels = useMemo(
    () => channels.filter((c) => (search ? c.name.toLowerCase().includes(search.toLowerCase()) : true)),
    [channels, search]
  );
  const showGeneralChannel = !search || "geral".includes(search.toLowerCase());

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

  function renderChannelRow(c: TextChannel) {
    const unread = c.unreadCount ?? 0;
    const showBadge = unread > 0 && currentChannelId !== c.id;
    const isEditing = editingChannelId === c.id;
    const systemIcon =
      c.systemType === "rules" ? <Ico.rules /> :
      c.systemType === "welcome" ? <Ico.welcome /> :
      <Ico.hash />;
    return (
      <div
        key={c.id}
        className={`channel-row${currentChannelId === c.id ? " active" : ""}${showBadge ? " unread" : ""}`}
        onClick={() => !isEditing && onSwitchChannel(c.id)}
        onContextMenu={canManageServer ? (e) => {
          e.preventDefault();
          onItemContextMenu({ type: "channel", id: c.id, x: e.clientX, y: e.clientY });
        } : undefined}
      >
        <div className="channel-row-head">
          <span className="channel-row-icon">{systemIcon}</span>
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
          {canManageServer && !isEditing && (
            <button
              className="channel-row-menu-btn"
              title="Opções do canal"
              onClick={(e) => {
                e.stopPropagation();
                onItemContextMenu({ type: "channel", id: c.id, x: e.clientX, y: e.clientY });
              }}
            >
              ⋯
            </button>
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
        onClick={() => !isActive && !isEditing && onEnterRoom(room)}
        onContextMenu={canManageServer ? (e) => {
          e.preventDefault();
          onItemContextMenu({ type: "room", id: room.id, x: e.clientX, y: e.clientY });
        } : undefined}
      >
        <div className="channel-row-head">
          <span className="channel-row-icon"><Ico.wave /></span>
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
                {room.onlineCount}{room.maxUsers ? `/${room.maxUsers}` : ""}
              </span>
            ) : room.maxUsers ? (
              <span className="channel-row-voice-count" style={{ opacity: 0.5 }}>0/{room.maxUsers}</span>
            ) : (
              <span className="channel-row-join">Entrar</span>
            )
          )}
          {canManageServer && !isEditing && (
            <button
              className="channel-row-menu-btn"
              title="Opções da sala"
              onClick={(e) => {
                e.stopPropagation();
                onItemContextMenu({ type: "room", id: room.id, x: e.clientX, y: e.clientY });
              }}
            >
              ⋯
            </button>
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
                      onParticipantContext({ identity: p.identity, name: p.name, x: e.clientX, y: e.clientY });
                    }}
                    title={p.isLocal ? "Você" : canManageServer ? "Clique direito para ajustar volume, apelido ou moderar" : "Clique direito para ajustar volume/apelido"}
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
                  <div key={p.identity} className="channel-row-voice-member preview" title={p.name}>
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
            onContextMenu={canManageServer && cat ? (e) => {
              e.preventDefault();
              onItemContextMenu({ type: "category", id: cat.id, x: e.clientX, y: e.clientY });
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
            {canManageServer && cat && (
              <button
                className="rooms-section-add"
                onClick={(e) => {
                  e.stopPropagation();
                  onItemContextMenu({ type: "category", id: cat.id, x: e.clientX, y: e.clientY });
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
                onClick={() => onSwitchChannel(null)}
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

  const hasNothing = filteredRooms.length === 0 && filteredChannels.length === 0 && !search && categories.length === 0;

  return (
    <>
      {renderCategorySection(null, "Geral", false)}
      {categories.map((cat) => renderCategorySection(cat.id, cat.name, true))}
      {hasNothing && (
        <p style={{ padding: "14px 10px", fontSize: 12, color: "var(--text-muted)" }}>
          {canManageServer ? "Crie uma categoria, canal ou sala pelo menu ⋯" : "Sem canais ou salas ainda."}
        </p>
      )}
    </>
  );
}
