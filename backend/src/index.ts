import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import serversRoutes from "./routes/servers.js";
import chatRoutes from "./routes/chat.js";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

const extraOrigins = process.env.CORS_ORIGINS?.split(",").map((o) => o.trim()) ?? [];

fastify.register(cors, {
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
fastify.register(jwtPlugin);
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(serversRoutes, { prefix: "/servers" });
fastify.register(chatRoutes);

fastify.get("/health", async () => ({ status: "ok" }));

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
