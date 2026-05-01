import "dotenv/config";
import path from "path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import serversRoutes from "./routes/servers.js";
import roomsRoutes from "./routes/rooms.js";
import moderationRoutes from "./routes/moderation.js";
import searchRoutes from "./routes/search.js";
import chatRoutes from "./routes/chat.js";
import unfurlRoutes from "./routes/unfurl.js";
import channelRoutes from "./routes/channels.js";
import categoriesRoutes from "./routes/categories.js";
import pinsRoutes from "./routes/pins.js";
import friendsRoutes from "./routes/friends.js";
import dmRoutes from "./routes/dm.js";
import uploadRoutes, { uploadDir } from "./routes/upload.js";
import rolesRoutes from "./routes/roles.js";
import prisma from "./db/client.js";
import { getRoomService } from "./services/livekit.js";
import { validateEnv } from "./env.js";

validateEnv();

const isDev = process.env.NODE_ENV !== "production";

const fastify = Fastify({
  logger: isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : { level: "info" },
});

const extraOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? [];

fastify.register(cors, {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  origin: (origin, cb) => {
    if (
      !origin ||
      origin === "http://localhost:1420" ||
      origin === "http://localhost:5173" ||
      origin === "tauri://localhost" ||
      origin === "http://tauri.localhost" ||
      origin.includes(".ngrok") ||
      extraOrigins.includes(origin)
    ) {
      cb(null, true);
    } else {
      cb(new Error("CORS: origin não permitida"), false);
    }
  },
  credentials: true,
});

fastify.register(websocket);
fastify.register(rateLimit, { global: false });
fastify.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024 } });
fastify.register(fastifyStatic, {
  root: path.resolve(uploadDir),
  prefix: "/uploads/",
  decorateReply: false,
  setHeaders: (res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
});
fastify.register(jwtPlugin);
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(serversRoutes, { prefix: "/servers" });
fastify.register(roomsRoutes, { prefix: "/servers" });
fastify.register(moderationRoutes, { prefix: "/servers" });
fastify.register(searchRoutes, { prefix: "/servers" });
fastify.register(chatRoutes);
fastify.register(unfurlRoutes);
fastify.register(channelRoutes, { prefix: "/servers" });
fastify.register(categoriesRoutes, { prefix: "/servers" });
fastify.register(pinsRoutes, { prefix: "/servers" });
fastify.register(friendsRoutes);
fastify.register(dmRoutes);
fastify.register(uploadRoutes);
fastify.register(rolesRoutes, { prefix: "/servers" });

fastify.get("/health", async (_, reply) => {
  const checks: Record<string, "ok" | "fail"> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  try {
    await getRoomService().listRooms();
    checks.livekit = "ok";
  } catch {
    checks.livekit = "fail";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  return reply
    .status(allOk ? 200 : 503)
    .send({ status: allOk ? "ok" : "degraded", checks });
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await fastify.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
