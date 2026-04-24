interface PresenceEntry {
  username: string;
  lastSeen: number;
  game: string | null;
}

const store = new Map<string, PresenceEntry>();

const ONLINE_THRESHOLD_MS = 2 * 60 * 1000;
const GC_INTERVAL_MS = 10 * 60 * 1000;
const GC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const gcTimer = setInterval(() => {
  const cutoff = Date.now() - GC_MAX_AGE_MS;
  for (const [id, entry] of store) {
    if (entry.lastSeen < cutoff) store.delete(id);
  }
}, GC_INTERVAL_MS);
gcTimer.unref?.();

export function updatePresence(userId: string, username: string, game: string | null) {
  store.set(userId, { username, lastSeen: Date.now(), game });
}

export function isOnline(userId: string): boolean {
  const entry = store.get(userId);
  if (!entry) return false;
  return Date.now() - entry.lastSeen < ONLINE_THRESHOLD_MS;
}

export function getPresence(userId: string): { game: string | null } | null {
  const entry = store.get(userId);
  if (!entry || !isOnline(userId)) return null;
  return { game: entry.game };
}
