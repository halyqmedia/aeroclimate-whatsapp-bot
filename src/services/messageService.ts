import { randomUUID } from "crypto";
import { routeMessage } from "../router/messageRouter";
import { buildSystemPrompt } from "../prompt/systemPrompt";
import { cache } from "../cache/memoryCache";
import { ConversationMemory, ChatMessage } from "../memory/conversationMemory";
import { AiProvider } from "../api/aiProvider.interface";
import { createAiProvider } from "../api/providerFactory";
import { estimateCostUsd } from "../utils/tokenCost";
import { logRequest, logError } from "../utils/logger";
import { saveBooking } from "./bookingService";
import { isRateLimited } from "./rateLimiterService";
import { env } from "../config/env";

const BOOKING_MARKER = "ЗАПИСЬ_ПОДТВЕРЖДЕНА";
const RATE_LIMIT_REPLY = "Бір сәт күте тұрыңыз.";
const ERROR_REPLY =
  "Извините, у меня небольшая техническая заминка. Менеджер скоро свяжется с вами напрямую 🙏\n" +
  "Кешіріңіз, шағын техникалық ақау болды. Менеджер жақын арада сізбен тікелей байланысады 🙏";

async function summarizeOldMessages(
  oldMessages: ChatMessage[],
  previousSummary: string
): Promise<string> {
  const transcript = oldMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
  const response = await aiProvider.generateReply({
    systemPrompt:
      "Сен диалог тарихын қысқаша (3-4 сөйлем) қорытындылайсың. Тек маңызды деректерді сақта: аты, қала, объект, қызмет түрі, келісілген мәліметтер.",
    messages: [
      {
        role: "user",
        content: `Алдыңғы қорытынды: ${previousSummary || "жоқ"}\n\nЖаңа хабарламалар:\n${transcript}\n\nЖаңартылған қысқаша қорытынды жаз.`,
      },
    ],
    maxTokens: 200,
  });
  return response.text.trim();
}

const aiProvider: AiProvider = createAiProvider();
const memory = new ConversationMemory(summarizeOldMessages);

function buildClaudeMessages(chatId: string, userText: string) {
  const { summary, recent } = memory.getContext(chatId);
  const messages: ChatMessage[] = [];

  if (summary) {
    messages.push({ role: "user", content: `[Алдыңғы диалог қысқаша]: ${summary}` });
    messages.push({ role: "assistant", content: "Түсінікті, осыны ескере отырып жалғастырамын." });
  }

  messages.push(...recent);
  messages.push({ role: "user", content: userText });
  return messages;
}

export async function handleIncomingMessage(chatId: string, userText: string): Promise<string> {
  if (isRateLimited(chatId)) {
    return RATE_LIMIT_REPLY;
  }

  // 1. Router — простые категории без обращения к Claude
  const routed = routeMessage(userText);
  if (routed) {
    await memory.addTurn(chatId, userText, routed.answer);
    return routed.answer;
  }

  // 2. Кэш — если такой же вопрос уже задавали в начале диалога
  const { recent } = memory.getContext(chatId);
  const cacheKey = `q:${userText.trim().toLowerCase()}`;
  if (recent.length === 0) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      await memory.addTurn(chatId, userText, cached);
      return cached;
    }
  }

  // 3. Claude — только если предыдущие шаги не дали ответа
  const conversationId = randomUUID();
  const startedAt = Date.now();
  try {
    const messages = buildClaudeMessages(chatId, userText);
    const result = await aiProvider.generateReply({
      systemPrompt: buildSystemPrompt(),
      messages,
    });

    const cost = estimateCostUsd(env.model, result.inputTokens, result.outputTokens);
    logRequest({
      conversationId,
      user: chatId,
      question: userText,
      responseTimeMs: Date.now() - startedAt,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: cost,
    });

    let finalReply = result.text;
    if (finalReply.includes(BOOKING_MARKER)) {
      finalReply = finalReply.replace(BOOKING_MARKER, "").trim();
      saveBooking(chatId, finalReply);
    }

    await memory.addTurn(chatId, userText, finalReply);
    if (recent.length === 0) {
      await cache.set(cacheKey, finalReply, env.cacheTtlSeconds);
    }

    return finalReply;
  } catch (error) {
    logError("Ошибка обращения к AI-провайдеру", error);
    return ERROR_REPLY;
  }
}
