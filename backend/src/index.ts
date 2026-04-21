import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwtPlugin from "./plugins/jwt.js";
import authRoutes from "./routes/auth.js";
import roomsRoutes from "./routes/rooms.js";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

fastify.register(cors, {
  origin: ["http://localhost:1420", "tauri://localhost"],
  credentials: true,
});

fastify.register(jwtPlugin);
fastify.register(authRoutes, { prefix: "/auth" });
fastify.register(roomsRoutes, { prefix: "/rooms" });

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
