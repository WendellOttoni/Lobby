import path from "path";
import fs from "fs/promises";
import { FastifyPluginAsync } from "fastify";

const MAX_BYTES = (Number(process.env.UPLOAD_MAX_MB) || 25) * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "application/pdf",
]);

export const uploadDir = path.join(process.cwd(), "uploads");

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  await fs.mkdir(uploadDir, { recursive: true });

  fastify.post(
    "/upload",
    {
      config: { rateLimit: { max: 20, timeWindow: "1m" } },
    },
    async (request, reply) => {
      await request.jwtVerify();

      const data = await request.file({ limits: { fileSize: MAX_BYTES } });
      if (!data) return reply.status(400).send({ error: "Nenhum arquivo enviado." });

      if (!ALLOWED_TYPES.has(data.mimetype)) {
        data.file.resume();
        return reply.status(400).send({ error: "Tipo de arquivo não permitido." });
      }

      const ext = path.extname(data.filename).toLowerCase();
      const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}${ext}`;
      const dest = path.join(uploadDir, safeName);

      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk as Buffer);
      }

      if (data.file.truncated) {
        return reply.status(413).send({
          error: `Arquivo muito grande (máx. ${process.env.UPLOAD_MAX_MB ?? 25}MB).`,
        });
      }

      const buffer = Buffer.concat(chunks);
      await fs.writeFile(dest, buffer);

      const baseUrl = (process.env.PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");

      return reply.send({
        filename: data.filename,
        url: `${baseUrl}/uploads/${safeName}`,
        mimeType: data.mimetype,
        size: buffer.length,
      });
    }
  );
};

export default uploadRoutes;
