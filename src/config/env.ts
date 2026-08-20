import "dotenv/config";
import fs from "fs";
import path from "path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value;
}

const aiProvider = process.env.AI_PROVIDER ?? "claude";

const REQUIRED_KEY_BY_PROVIDER: Record<string, string> = {
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  claude: "claude-sonnet-4-6",
  gemini: "gemini-3.5-flash",
  openai: "gpt-4o-mini",
};

required(REQUIRED_KEY_BY_PROVIDER[aiProvider] ?? "ANTHROPIC_API_KEY");

export const env = {
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  model: process.env.MODEL ?? DEFAULT_MODEL_BY_PROVIDER[aiProvider] ?? "claude-sonnet-4-6",
  maxTokens: Number(process.env.MAX_TOKENS ?? 500),
  temperature: Number(process.env.TEMPERATURE ?? 1),
  cacheTtlSeconds: Number(process.env.CACHE_TTL ?? 60 * 60 * 24),
  aiProvider,
  storageDir: process.env.STORAGE_DIR ?? path.join(__dirname, "..", ".."),
  whatsappPhoneNumber: process.env.WHATSAPP_PHONE_NUMBER ?? "",
  webQrSecret: process.env.WEB_QR_SECRET ?? "",
  agentPauseMs: Number(process.env.AGENT_PAUSE_HOURS ?? 2) * 60 * 60 * 1000,
};

fs.mkdirSync(env.storageDir, { recursive: true });
