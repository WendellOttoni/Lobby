const AVATAR_GRADIENTS: [string, string][] = [
  ["#5865f2", "#7c6ef5"],
  ["#3ba55d", "#4fc47a"],
  ["#faa61a", "#fbbe52"],
  ["#ed4245", "#f16568"],
  ["#00b0f4", "#39c6ff"],
  ["#a660e8", "#c184f0"],
  ["#f47b67", "#f89e8e"],
  ["#06b6d4", "#22d3ee"],
  ["#ec4899", "#f472b6"],
  ["#8b5cf6", "#a78bfa"],
];

function hashId(id: string): number {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return hash;
}

export function avatarBg(id: string): string {
  const [a, b] = AVATAR_GRADIENTS[hashId(id) % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
