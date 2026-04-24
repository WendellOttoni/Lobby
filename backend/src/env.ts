const REQUIRED = [
  "DATABASE_URL",
  "JWT_SECRET",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_URL",
] as const;

export function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[env] Variáveis obrigatórias faltando: ${missing.join(", ")}`);
    process.exit(1);
  }
}
