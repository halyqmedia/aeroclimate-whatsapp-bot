import { AiProvider, AiReplyRequest, AiReplyResult } from "./aiProvider.interface";

// Заглушка на будущее: чтобы переключиться на Gemini, реализуйте generateReply
// через @google/generative-ai и укажите AI_PROVIDER=gemini в .env.
export class GeminiProvider implements AiProvider {
  async generateReply(_request: AiReplyRequest): Promise<AiReplyResult> {
    throw new Error("GeminiProvider ещё не реализован. Используйте AI_PROVIDER=claude.");
  }
}
