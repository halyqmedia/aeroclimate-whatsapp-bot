import { env } from "../config/env";
import { AiProvider } from "./aiProvider.interface";
import { ClaudeProvider } from "./claudeProvider";
import { OpenAiProvider } from "./openaiProvider";
import { GeminiProvider } from "./geminiProvider";

export function createAiProvider(): AiProvider {
  switch (env.aiProvider) {
    case "openai":
      return new OpenAiProvider();
    case "gemini":
      return new GeminiProvider();
    case "claude":
    default:
      return new ClaudeProvider();
  }
}
