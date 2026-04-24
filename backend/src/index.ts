import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import serversRoutes from "./routes/servers.js";
import chatRoutes from "./routes/chat.js";
import unfurlRoutes from "./routes/unfurl.js";
import channelRoutes from "./routes/channels.js";
import pinsRoutes from "./routes/pins.js";
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
fastify.register(jwtPlugin);
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(serversRoutes, { prefix: "/servers" });
fastify.register(chatRoutes);
fastify.register(unfurlRoutes);
fastify.register(channelRoutes, { prefix: "/servers" });
fastify.register(pinsRoutes, { prefix: "/servers" });

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
