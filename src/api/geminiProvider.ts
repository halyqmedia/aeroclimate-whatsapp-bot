import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { AiProvider, AiReplyRequest, AiReplyResult } from "./aiProvider.interface";

export class GeminiProvider implements AiProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }

  async generateReply(request: AiReplyRequest): Promise<AiReplyResult> {
    const response = await this.client.models.generateContent({
      model: env.model,
      contents: request.messages.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      })),
      config: {
        systemInstruction: request.systemPrompt,
        maxOutputTokens: request.maxTokens ?? env.maxTokens,
        temperature: env.temperature,
        // WhatsApp-боттың жауабы қысқа әрі жылдам болуы керек — thinking өшірілмесе,
        // модель maxOutputTokens бюджетінің көбін "ойлауға" жұмсап, жауапты кесіп тастайды.
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return {
      text: response.text ?? "",
      inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }
}
