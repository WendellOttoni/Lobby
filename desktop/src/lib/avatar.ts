const AVATAR_COLORS: [string, string][] = [
  ["#0a84ff", "#2997ff"],
  ["#30d158", "#34c759"],
  ["#ff9f0a", "#ffcc00"],
  ["#ff453a", "#ff6961"],
  ["#5ac8fa", "#32ade6"],
  ["#bf5af2", "#9b59b6"],
  ["#ff6b6b", "#ee5a52"],
  ["#64d2ff", "#5ac8fa"],
  ["#ff375f", "#ff2d55"],
  ["#6c6c70", "#8e8e93"],
];

function hashId(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return hash;
}

export function avatarBg(id: string): string {
  const [a, b] = AVATAR_COLORS[hashId(id) % AVATAR_COLORS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
