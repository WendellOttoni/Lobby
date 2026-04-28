import { FastifyPluginAsync } from "fastify";
import prisma from "../db/client.js";
import { canManageServer, canReadChannel } from "../services/permissions.js";

interface SearchFilters {
  text: string;
  from?: string;
  channel?: string;
  before?: Date;
  after?: Date;
  hasLink?: boolean;
  hasImage?: boolean;
}

function parseSearchQuery(raw: string): SearchFilters {
  const filters: SearchFilters = { text: "" };
  const tokens = raw.split(/\s+/);
  const remaining: string[] = [];
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon > 0) {
      const key = tok.slice(0, colon).toLowerCase();
      const val = tok.slice(colon + 1);
      if (key === "from" && val) { filters.from = val; continue; }
      if (key === "in" && val) { filters.channel = val.replace(/^#/, ""); continue; }
      if (key === "before" && val) { const d = new Date(val); if (!isNaN(d.getTime())) { filters.before = d; continue; } }
      if (key === "after" && val) { const d = new Date(val); if (!isNaN(d.getTime())) { filters.after = d; continue; } }
      if (key === "has") {
        if (val === "link") { filters.hasLink = true; continue; }
        if (val === "image" || val === "img") { filters.hasImage = true; continue; }
      }
    }
    remaining.push(tok);
  }
  filters.text = remaining.join(" ").trim();
  return filters;
}

const searchRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/:serverId/messages/search", async (request, reply) => {
    const { sub } = request.user as { sub: string };
    const { serverId } = request.params as { serverId: string };
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) return reply.status(400).send({ error: "Query deve ter ao menos 2 caracteres" });

    const member = await prisma.serverMember.findUnique({
      where: { userId_serverId: { userId: sub, serverId } },
    });
    if (!member) return reply.status(403).send({ error: "Sem acesso" });

    const filters = parseSearchQuery(q.trim());

    let authorId: string | undefined;
    if (filters.from) {
      const author = await prisma.user.findUnique({
        where: { username: filters.from },
        select: { id: true },
      });
      if (!author) return reply.send({ results: [] });
      authorId = author.id;
    }

    let channelId: string | null | undefined;
    if (filters.channel === "geral") {
      channelId = null;
    } else if (filters.channel) {
      const channel = await prisma.textChannel.findFirst({
        where: { serverId, name: filters.channel },
        select: { id: true },
      });
      if (!channel) return reply.send({ results: [] });
      channelId = channel.id;
    }

    const and: Record<string, unknown>[] = [];
    const where: Record<string, unknown> = { serverId };
    if (filters.text) and.push({ content: { contains: filters.text, mode: "insensitive" } });
    if (authorId) where.authorId = authorId;
    if (channelId !== undefined) where.channelId = channelId;
    if (channelId === undefined && !canManageServer(member.role)) {
      const channels = await prisma.textChannel.findMany({ where: { serverId }, select: { id: true } });
      const readable = await Promise.all(
        channels.map(async (channel) => ({
          id: channel.id,
          readable: await canReadChannel(sub, serverId, channel.id),
        }))
      );
      where.OR = [
        { channelId: null },
        { channelId: { in: readable.filter((item) => item.readable).map((item) => item.id) } },
      ];
    }
    if (channelId !== undefined && !(await canReadChannel(sub, serverId, channelId))) {
      return reply.status(403).send({ error: "Sem acesso ao canal" });
    }
    if (filters.before || filters.after) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.after) range.gte = filters.after;
      if (filters.before) range.lte = filters.before;
      where.createdAt = range;
    }
    if (filters.hasLink) {
      and.push({
        OR: [
          { content: { contains: "http://", mode: "insensitive" } },
          { content: { contains: "https://", mode: "insensitive" } },
          { content: { contains: "www.", mode: "insensitive" } },
        ],
      });
    }
    if (filters.hasImage) {
      and.push({ OR: [
        { content: { contains: ".png", mode: "insensitive" } },
        { content: { contains: ".jpg", mode: "insensitive" } },
        { content: { contains: ".jpeg", mode: "insensitive" } },
        { content: { contains: ".gif", mode: "insensitive" } },
        { content: { contains: ".webp", mode: "insensitive" } },
        { content: { contains: "tenor.com", mode: "insensitive" } },
        { content: { contains: "giphy.com", mode: "insensitive" } },
      ] });
    }
    if (and.length > 0) where.AND = and;

    const results = await prisma.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { author: { select: { username: true } } },
    });

    return reply.send({
      results: results.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        authorId: m.authorId,
        authorName: m.author.username,
        channelId: m.channelId,
      })),
    });
  });
};

export default searchRoutes;
