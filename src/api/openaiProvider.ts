import { AiProvider, AiReplyRequest, AiReplyResult } from "./aiProvider.interface";

// Заглушка на будущее: чтобы переключиться на OpenAI, реализуйте generateReply
// через @openai/sdk (chat.completions.create) и укажите AI_PROVIDER=openai в .env.
export class OpenAiProvider implements AiProvider {
  async generateReply(_request: AiReplyRequest): Promise<AiReplyResult> {
    throw new Error("OpenAiProvider ещё не реализован. Используйте AI_PROVIDER=claude.");
  }
}
