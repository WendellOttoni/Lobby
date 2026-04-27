const MUTED_SERVERS_KEY = "lobby_muted_servers";
const MUTED_CHANNELS_KEY = "lobby_muted_channels";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeSet(key: string, values: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...values]));
}

export function isServerMuted(serverId: string): boolean {
  return readSet(MUTED_SERVERS_KEY).has(serverId);
}

export function setServerMuted(serverId: string, muted: boolean) {
  const values = readSet(MUTED_SERVERS_KEY);
  if (muted) values.add(serverId);
  else values.delete(serverId);
  writeSet(MUTED_SERVERS_KEY, values);
}

function channelKey(serverId: string, channelId: string | null): string {
  return `${serverId}:${channelId ?? "geral"}`;
}

export function isChannelMuted(serverId: string, channelId: string | null): boolean {
  return readSet(MUTED_CHANNELS_KEY).has(channelKey(serverId, channelId));
}

export function setChannelMuted(serverId: string, channelId: string | null, muted: boolean) {
  const values = readSet(MUTED_CHANNELS_KEY);
  const key = channelKey(serverId, channelId);
  if (muted) values.add(key);
  else values.delete(key);
  writeSet(MUTED_CHANNELS_KEY, values);
}
