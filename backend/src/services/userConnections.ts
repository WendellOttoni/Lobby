import type { WebSocket } from "@fastify/websocket";

// userId → active WebSocket connections (can have multiple tabs)
export const userConnections = new Map<string, Set<WebSocket>>();

export function sendToUser(userId: string, data: object): void {
  const conns = userConnections.get(userId);
  if (!conns) return;
  const json = JSON.stringify(data);
  for (const ws of conns) {
    if (ws.readyState === 1) ws.send(json);
  }
}

export function registerWs(userId: string, ws: WebSocket): () => void {
  if (!userConnections.has(userId)) userConnections.set(userId, new Set());
  userConnections.get(userId)!.add(ws);
  return () => {
    userConnections.get(userId)?.delete(ws);
    if (userConnections.get(userId)?.size === 0) userConnections.delete(userId);
  };
}
