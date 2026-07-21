import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config/env";
import { AiProvider, AiReplyRequest, AiReplyResult } from "./aiProvider.interface";

export class ClaudeProvider implements AiProvider {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async generateReply(request: AiReplyRequest): Promise<AiReplyResult> {
    const response = await this.client.messages.create({
      model: env.model,
      max_tokens: request.maxTokens ?? env.maxTokens,
      temperature: env.temperature,
      system: request.systemPrompt,
      messages: request.messages,
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}
