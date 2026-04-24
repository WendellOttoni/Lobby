const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface Server {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  role: string;
  unreadCount?: number;
  _count?: { members: number; rooms: number };
}

export interface ServerPreview {
  id: string;
  name: string;
  _count: { members: number };
}

export interface Room {
  id: string;
  name: string;
  createdAt: string;
  onlineCount: number;
}

export interface Member {
  id: string;
  username: string;
  role: string;
  online: boolean;
  game: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
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
      "ngrok-skip-browser-warning": "true",
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

  resetInvite: (token: string, serverId: string) =>
    request<{ inviteCode: string }>(`/servers/${serverId}/invite/reset`, {
      method: "POST",
      token,
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

  updateMe: (token: string, data: { username?: string; currentPassword?: string; newPassword?: string }) =>
    request<{ user: User }>("/auth/me", {
      method: "PATCH",
      token,
      body: JSON.stringify(data),
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

  transferOwnership: (token: string, serverId: string, userId: string) =>
    request<void>(`/servers/${serverId}/transfer`, {
      method: "POST",
      token,
      body: JSON.stringify({ userId }),
    }),

  searchMessages: (token: string, serverId: string, q: string) =>
    request<{ results: Array<{ id: string; content: string; createdAt: string; authorId: string; authorName: string }> }>(
      `/servers/${serverId}/messages/search?q=${encodeURIComponent(q)}`,
      { token }
    ),

  unfurl: (token: string, url: string) =>
    request<{ title?: string; description?: string; image?: string; siteName?: string }>(
      `/unfurl?url=${encodeURIComponent(url)}`,
      { token }
    ),
};

export { ApiError };
