const AVATAR_COLORS = [
  "#5865f2", "#3ba55d", "#faa61a", "#ed4245",
  "#00b0f4", "#a660e8", "#f47b67", "#43b581",
];

export function avatarBg(id: string): string {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
