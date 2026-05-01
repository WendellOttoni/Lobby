const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  statusText?: string | null;
  statusEmoji?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface TextChannel {
  id: string;
  name: string;
  serverId: string;
  createdAt: string;
  categoryId?: string | null;
  position?: number;
  topic?: string | null;
  slowMode?: number | null;
  isSystem?: boolean;
  systemType?: string | null;
  unreadCount?: number;
}

export interface Category {
  id: string;
  name: string;
  position: number;
}

export interface VoiceParticipantPreview {
  identity: string;
  name: string;
}

export interface PinnedMessage {
  id: string;
  messageId: string;
  channelId: string | null;
  pinnedBy: string;
  pinnerName: string;
  pinnedAt: string;
  message: {
    id: string;
    content: string;
    createdAt: string;
    authorId: string;
    authorName: string;
  } | null;
}

export interface Server {
  id: string;
  name: string;
  inviteCode: string;
  inviteUses?: number;
  inviteMaxUses?: number | null;
  inviteExpiresAt?: string | null;
  ownerId: string;
  role: string;
  unreadCount?: number;
  _count?: { members: number; rooms: number };
}

export interface ServerPreview {
  id: string;
  name: string;
  inviteCode?: string;
  inviteUses?: number;
  inviteMaxUses?: number | null;
  inviteExpiresAt?: string | null;
  _count: { members: number };
}

export interface Room {
  id: string;
  name: string;
  createdAt: string;
  onlineCount: number;
  maxUsers?: number | null;
  categoryId?: string | null;
  position?: number;
}

export interface Member {
  id: string;
  username: string;
  avatarUrl?: string | null;
  bio?: string | null;
  role: string;
  roleColor?: string | null;
  online: boolean;
  game: string | null;
  gameStartedAt?: number | null;
  statusText: string | null;
  statusEmoji?: string | null;
}

export interface ServerRole {
  id: string;
  serverId: string;
  name: string;
  color: string | null;
  position: number;
}

export interface ServerBan {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string | null;
  bannedBy: string;
  bannedByName: string;
  reason: string | null;
  createdAt: string;
}

export interface ServerAuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  targetId: string | null;
  targetType: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationPreference {
  channelId: string | null;
  muted: boolean;
}

export interface ChannelPermission {
  id: string;
  serverId: string;
  channelId: string;
  role: "member" | "admin";
  canRead: boolean;
  canWrite: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface FriendUser {
  id: string;
  username: string;
}

export interface FriendRequest {
  id: string;
  from: FriendUser;
}

export interface OutgoingRequest {
  id: string;
  to: FriendUser;
}

export interface DMMessage {
  id: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  authorId: string;
  recipientId: string;
  authorName: string;
  conversationId: string;
}

export interface CallTokenResponse {
  token: string;
  url: string;
  roomName: string;
}

export interface SearchResult {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  channelId: string | null;
}

export interface AttachmentMeta {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface LivekitTokenResponse {
  token: string;
  url: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, body, ...rest } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    body,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error ?? data.message ?? `HTTP ${response.status}`
    );
  }

  return data as T;
}

export const api = {
  register: (username: string, email: string, password: string) =>
    request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  me: (token: string) =>
    request<{ user: User }>("/auth/me", { token }),

  listServers: (token: string) =>
    request<{ servers: Server[] }>("/servers", { token }),

  createServer: (token: string, name: string) =>
    request<{ server: Server }>("/servers", {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),

  getInvitePreview: (token: string, code: string) =>
    request<{ server: ServerPreview }>(`/servers/invite/${code}`, { token }),

  joinServer: (token: string, code: string) =>
    request<{ server: Server }>(`/servers/invite/${code}/join`, {
      method: "POST",
      token,
    }),

  getServer: (token: string, serverId: string) =>
    request<{ server: Server; role: string }>(`/servers/${serverId}`, { token }),

  resetInvite: (token: string, serverId: string, options?: { maxUses?: number | null; expiresInHours?: number | null }) =>
    request<{ inviteCode: string; inviteUses: number; inviteMaxUses: number | null; inviteExpiresAt: string | null }>(`/servers/${serverId}/invite/reset`, {
      method: "POST",
      token,
      body: JSON.stringify(options ?? {}),
    }),

  listRooms: (token: string, serverId: string) =>
    request<{ rooms: Room[] }>(`/servers/${serverId}/rooms`, { token }),

  createRoom: (token: string, serverId: string, name: string) =>
    request<{ room: Room }>(`/servers/${serverId}/rooms`, {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),

  getRoomToken: (token: string, serverId: string, roomId: string) =>
    request<LivekitTokenResponse>(`/servers/${serverId}/rooms/${roomId}/token`, {
      method: "POST",
      token,
    }),

  updateMe: (token: string, data: {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
    statusText?: string | null;
    statusEmoji?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }) =>
    request<{ user: User }>("/auth/me", {
      method: "PATCH",
      token,
      body: JSON.stringify(data),
    }),

  listChannels: (token: string, serverId: string) =>
    request<{ channels: TextChannel[]; generalUnread: number }>(`/servers/${serverId}/channels`, { token }),

  markChannelRead: (token: string, serverId: string, channelId: string) =>
    request<void>(`/servers/${serverId}/channels/${channelId}/read`, {
      method: "POST",
      token,
    }),

  getFirstUnread: (token: string, serverId: string, channelId: string) =>
    request<{ messageId: string | null }>(`/servers/${serverId}/channels/${channelId}/first-unread`, { token }),

  listRoles: (token: string, serverId: string) =>
    request<{ roles: ServerRole[] }>(`/servers/${serverId}/roles`, { token }),

  updateRole: (token: string, serverId: string, roleName: string, color: string | null) =>
    request<{ role: ServerRole }>(`/servers/${serverId}/roles/${roleName}`, {
      method: "PUT",
      token,
      body: JSON.stringify({ color }),
    }),

  updateChannel: (token: string, serverId: string, channelId: string, data: {
    name?: string;
    topic?: string | null;
    slowMode?: number | null;
    isSystem?: boolean;
    systemType?: string | null;
  }) =>
    request<{ channel: TextChannel }>(`/servers/${serverId}/channels/${channelId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(data),
    }),

  createChannel: (token: string, serverId: string, name: string) =>
    request<{ channel: TextChannel }>(`/servers/${serverId}/channels`, {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),

  renameChannel: (token: string, serverId: string, channelId: string, name: string) =>
    request<{ channel: TextChannel }>(`/servers/${serverId}/channels/${channelId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name }),
    }),

  deleteChannel: (token: string, serverId: string, channelId: string) =>
    request<void>(`/servers/${serverId}/channels/${channelId}`, { method: "DELETE", token }),

  listChannelPermissions: (token: string, serverId: string, channelId: string) =>
    request<{ permissions: ChannelPermission[] }>(`/servers/${serverId}/channels/${channelId}/permissions`, { token }),

  setChannelPermission: (
    token: string,
    serverId: string,
    channelId: string,
    role: "member" | "admin",
    permission: { canRead: boolean; canWrite: boolean }
  ) =>
    request<{ permission: ChannelPermission }>(`/servers/${serverId}/channels/${channelId}/permissions/${role}`, {
      method: "PUT",
      token,
      body: JSON.stringify(permission),
    }),

  renameRoom: (token: string, serverId: string, roomId: string, name: string) =>
    request<{ room: Room }>(`/servers/${serverId}/rooms/${roomId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name }),
    }),

  voiceDisconnectParticipant: (token: string, serverId: string, roomId: string, identity: string) =>
    request<void>(`/servers/${serverId}/rooms/${roomId}/participants/${identity}/disconnect`, {
      method: "POST",
      token,
    }),

  voiceForceMuteParticipant: (token: string, serverId: string, roomId: string, identity: string) =>
    request<void>(`/servers/${serverId}/rooms/${roomId}/participants/${identity}/mute`, {
      method: "POST",
      token,
    }),

  listRoomParticipants: (token: string, serverId: string, roomId: string) =>
    request<{ participants: VoiceParticipantPreview[] }>(
      `/servers/${serverId}/rooms/${roomId}/participants`,
      { token }
    ),

  listCategories: (token: string, serverId: string) =>
    request<{ categories: Category[] }>(`/servers/${serverId}/categories`, { token }),

  createCategory: (token: string, serverId: string, name: string) =>
    request<{ category: Category }>(`/servers/${serverId}/categories`, {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),

  renameCategory: (token: string, serverId: string, categoryId: string, name: string) =>
    request<{ category: Category }>(`/servers/${serverId}/categories/${categoryId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (token: string, serverId: string, categoryId: string) =>
    request<void>(`/servers/${serverId}/categories/${categoryId}`, { method: "DELETE", token }),

  setChannelCategory: (token: string, serverId: string, channelId: string, categoryId: string | null) =>
    request<void>(`/servers/${serverId}/channels/${channelId}/category`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ categoryId }),
    }),

  setRoomCategory: (token: string, serverId: string, roomId: string, categoryId: string | null) =>
    request<void>(`/servers/${serverId}/rooms/${roomId}/category`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ categoryId }),
    }),

  listPins: (token: string, serverId: string) =>
    request<{ pins: PinnedMessage[] }>(`/servers/${serverId}/pins`, { token }),

  pinMessage: (token: string, serverId: string, messageId: string) =>
    request<{ pin: PinnedMessage }>(`/servers/${serverId}/pins/${messageId}`, {
      method: "POST",
      token,
    }),

  unpinMessage: (token: string, serverId: string, messageId: string) =>
    request<void>(`/servers/${serverId}/pins/${messageId}`, {
      method: "DELETE",
      token,
    }),

  deleteServer: (token: string, serverId: string) =>
    request<void>(`/servers/${serverId}`, { method: "DELETE", token }),

  leaveServer: (token: string, serverId: string) =>
    request<void>(`/servers/${serverId}/leave`, { method: "POST", token }),

  deleteRoom: (token: string, serverId: string, roomId: string) =>
    request<void>(`/servers/${serverId}/rooms/${roomId}`, { method: "DELETE", token }),

  heartbeat: (token: string, game: string | null) =>
    request<void>("/auth/heartbeat", {
      method: "POST",
      token,
      body: JSON.stringify({ game }),
    }),

  listMembers: (token: string, serverId: string) =>
    request<{ members: Member[] }>(`/servers/${serverId}/members`, { token }),

  markServerRead: (token: string, serverId: string) =>
    request<void>(`/servers/${serverId}/read`, { method: "POST", token }),

  listNotificationPreferences: (token: string, serverId: string) =>
    request<{ preferences: NotificationPreference[] }>(`/servers/${serverId}/notification-preferences`, { token }),

  setNotificationPreference: (token: string, serverId: string, channelId: string | null, muted: boolean) =>
    request<void>(`/servers/${serverId}/notification-preferences`, {
      method: "PUT",
      token,
      body: JSON.stringify({ channelId, muted }),
    }),

  transferOwnership: (token: string, serverId: string, userId: string) =>
    request<void>(`/servers/${serverId}/transfer`, {
      method: "POST",
      token,
      body: JSON.stringify({ userId }),
    }),

  setMemberRole: (token: string, serverId: string, userId: string, role: "admin" | "member") =>
    request<{ member: Pick<Member, "id" | "username" | "role"> }>(
      `/servers/${serverId}/members/${userId}/role`,
      {
        method: "PATCH",
        token,
        body: JSON.stringify({ role }),
      }
    ),

  kickMember: (token: string, serverId: string, userId: string) =>
    request<void>(`/servers/${serverId}/members/${userId}/kick`, {
      method: "POST",
      token,
    }),

  banMember: (token: string, serverId: string, userId: string, reason?: string) =>
    request<void>(`/servers/${serverId}/members/${userId}/ban`, {
      method: "POST",
      token,
      body: JSON.stringify({ reason }),
    }),

  listBans: (token: string, serverId: string) =>
    request<{ bans: ServerBan[] }>(`/servers/${serverId}/bans`, { token }),

  unbanMember: (token: string, serverId: string, userId: string) =>
    request<void>(`/servers/${serverId}/bans/${userId}`, { method: "DELETE", token }),

  listAuditLogs: (token: string, serverId: string) =>
    request<{ logs: ServerAuditLog[] }>(`/servers/${serverId}/audit`, { token }),

  searchMessages: (token: string, serverId: string, q: string) =>
    request<{ results: SearchResult[] }>(
      `/servers/${serverId}/messages/search?q=${encodeURIComponent(q)}`,
      { token }
    ),

  deleteAccount: (token: string) =>
    request<void>("/auth/me", { method: "DELETE", token }),

  unfurl: (token: string, url: string) =>
    request<{ title?: string; description?: string; image?: string; siteName?: string }>(
      `/unfurl?url=${encodeURIComponent(url)}`,
      { token }
    ),

  searchUsers: (token: string, q: string) =>
    request<{ users: FriendUser[] }>(`/users/search?q=${encodeURIComponent(q)}`, { token }),

  listFriends: (token: string) =>
    request<{ friends: FriendUser[]; incoming: FriendRequest[]; outgoing: OutgoingRequest[] }>(
      "/friends",
      { token }
    ),

  sendFriendRequest: (token: string, username: string) =>
    request<{ ok: boolean }>("/friends/request", {
      method: "POST",
      token,
      body: JSON.stringify({ username }),
    }),

  acceptFriendRequest: (token: string, requestId: string) =>
    request<{ ok: boolean }>(`/friends/${requestId}/accept`, { method: "POST", token }),

  removeFriend: (token: string, requestId: string) =>
    request<{ ok: boolean }>(`/friends/${requestId}`, { method: "DELETE", token }),

  getDMMessages: (token: string, userId: string, before?: string) =>
    request<{ messages: DMMessage[] }>(
      `/dm/${userId}/messages${before ? `?before=${before}` : ""}`,
      { token }
    ),

  getCallToken: (token: string, userId: string) =>
    request<CallTokenResponse>(`/dm/${userId}/call-token`, { method: "POST", token }),

  uploadFile: async (token: string, file: File): Promise<AttachmentMeta> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(response.status, data.error ?? "Upload falhou");
    return data as AttachmentMeta;
  },
};

export { ApiError };
