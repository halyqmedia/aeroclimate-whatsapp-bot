import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Отсутствует обязательная переменная окружения: ${name}`);
  }
  return value;
}

export const env = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  model: process.env.MODEL ?? "claude-sonnet-4-6",
  maxTokens: Number(process.env.MAX_TOKENS ?? 500),
  temperature: Number(process.env.TEMPERATURE ?? 1),
  cacheTtlSeconds: Number(process.env.CACHE_TTL ?? 60 * 60 * 24),
  aiProvider: process.env.AI_PROVIDER ?? "claude",
};
