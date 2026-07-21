export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiReplyRequest {
  systemPrompt: string;
  messages: AiMessage[];
  maxTokens?: number;
}

export interface AiReplyResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiProvider {
  generateReply(request: AiReplyRequest): Promise<AiReplyResult>;
}
