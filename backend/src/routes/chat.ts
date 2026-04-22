import { FastifyPluginAsync } from "fastify";
import { WebSocket } from "@fastify/websocket";
import prisma from "../db/client.js";

interface ChatMessage {
  id: string;
  content: string;
  createdAt: string;
  authorId: string;
  authorName: string;
}

interface Connection {
  ws: WebSocket;
  userId: string;
  username: string;
}

const rooms = new Map<string, Set<Connection>>();

function broadcast(serverId: string, payload: string) {
  rooms.get(serverId)?.forEach(({ ws }) => {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  });
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    "/servers/:serverId/ws",
    { websocket: true },
    async (socket, req) => {
      const { serverId } = req.params as { serverId: string };
      const token = (req.query as Record<string, string>).token;

      // Verify JWT and extract user
      let userId: string;
      let username: string;
      try {
        const payload = fastify.jwt.verify<{ sub: string }>(token);
        userId = payload.sub;
        const user = await prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { username: true },
        });
        username = user.username;
      } catch {
        socket.close(1008, "Unauthorized");
        return;
      }

      // Check server membership
      const member = await prisma.serverMember.findUnique({
        where: { userId_serverId: { userId, serverId } },
      });
      if (!member) {
        socket.close(1008, "Not a member");
        return;
      }

      // Join room
      if (!rooms.has(serverId)) rooms.set(serverId, new Set());
      const conn: Connection = { ws: socket, userId, username };
      rooms.get(serverId)!.add(conn);

      // Send history (last 80 messages, oldest first)
      const history = await prisma.message.findMany({
        where: { serverId },
        orderBy: { createdAt: "asc" },
        take: 80,
        include: { author: { select: { username: true } } },
      });
      socket.send(
        JSON.stringify({
          type: "history",
          messages: history.map(
            (m): ChatMessage => ({
              id: m.id,
              content: m.content,
              createdAt: m.createdAt.toISOString(),
              authorId: m.authorId,
              authorName: m.author.username,
            })
          ),
        })
      );

      socket.on("message", async (raw: Buffer) => {
        try {
          const data = JSON.parse(raw.toString());
          if (data.type !== "message" || !data.content?.trim()) return;

          const content = String(data.content).trim().slice(0, 2000);

          const msg = await prisma.message.create({
            data: { content, authorId: userId, serverId },
            include: { author: { select: { username: true } } },
          });

          broadcast(
            serverId,
            JSON.stringify({
              type: "message",
              id: msg.id,
              content: msg.content,
              createdAt: msg.createdAt.toISOString(),
              authorId: msg.authorId,
              authorName: msg.author.username,
            })
          );
        } catch {}
      });

      socket.on("close", () => {
        rooms.get(serverId)?.delete(conn);
        if (rooms.get(serverId)?.size === 0) rooms.delete(serverId);
      });
    }
  );
};

export default chatRoutes;
