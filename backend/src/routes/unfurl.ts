import { FastifyPluginAsync } from "fastify";
import { parse } from "node-html-parser";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 100_000;
const MAX_CACHE_ENTRIES = 500;

const cache = new Map<string, { data: UnfurlResult; ts: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000;

const PRIVATE_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|::1|fc00:|fd00:|fe80:)/i;
const PRIVATE_172_RE = /^172\.(1[6-9]|2\d|3[01])\./;

function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (PRIVATE_HOST_RE.test(host)) return false;
  if (PRIVATE_172_RE.test(host)) return false;
  return true;
}

interface UnfurlResult {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

async function fetchMeta(url: string, depth = 0): Promise<UnfurlResult> {
  if (depth > 3) return {};
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
      headers: { "User-Agent": "LobbyBot/1.0 (link preview)" },
    });
    clearTimeout(timer);

    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return {};
      const absolute = new URL(next, url).toString();
      if (!isPublicHttpUrl(absolute) || absolute === url) return {};
      return fetchMeta(absolute, depth + 1);
    }

    if (!res.ok) return {};

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return {};

    const reader = res.body?.getReader();
    if (!reader) return {};

    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      bytes += value.byteLength;
      if (bytes >= MAX_BYTES) { reader.cancel(); break; }
    }

    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc); merged.set(c, acc.length);
        return merged;
      }, new Uint8Array())
    );

    const root = parse(html);
    const og = (prop: string) =>
      root.querySelector(`meta[property="og:${prop}"]`)?.getAttribute("content") ||
      root.querySelector(`meta[name="og:${prop}"]`)?.getAttribute("content");
    const meta = (name: string) =>
      root.querySelector(`meta[name="${name}"]`)?.getAttribute("content");

    const result: UnfurlResult = {
      title: og("title") || root.querySelector("title")?.text?.trim(),
      description: og("description") || meta("description"),
      image: og("image"),
      siteName: og("site_name"),
    };

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
    cache.set(url, { data: result, ts: Date.now() });
    return result;
  } catch {
    clearTimeout(timer);
    return {};
  }
}

const unfurlRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/unfurl", {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    preHandler: [fastify.authenticate],
    handler: async (request, reply) => {
      const { url } = request.query as { url?: string };
      if (!url || !isPublicHttpUrl(url)) {
        return reply.status(400).send({ error: "URL inválida" });
      }
      const data = await fetchMeta(url);
      return reply.send(data);
    },
  });
};

export default unfurlRoutes;
