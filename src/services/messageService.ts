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
const ATTENTION_MARKER = "НАЗАР_КЕРЕК";
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

// AI-жауаптағы БОЛУ_МАРКЕР/НАЗАР_КЕРЕК жады тарихынан алынып тасталатындықтан (клиентке
// көрсетілмейді), AI бұрын растап қойғанын "есіне түсіре" алмайды — сол себепті бір
// клиент кезектес хабарламалар/фото-альбом жіберсе, маркер бірнеше рет қайталанып шығуы
// мүмкін. Осыны кодта бөгейміз: бір чат үшін бір маркер түрі белгілі бір терезеде тек
// бір рет ғана кәсіп иесіне хабарлауға және сақтауға әкеледі.
const NOTIFICATION_DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const recentNotificationAt = new Map<string, number>();

function shouldNotifyOnce(kind: "booking" | "attention", chatId: string): boolean {
  const key = `${kind}:${chatId}`;
  const now = Date.now();
  const last = recentNotificationAt.get(key);
  if (last !== undefined && now - last < NOTIFICATION_DEDUPE_WINDOW_MS) {
    return false;
  }
  recentNotificationAt.set(key, now);
  return true;
}

// Пайдаланушы осы диалогта дәл сол сұрақты бұрын қойған ба — солай болса,
// AI-ды қайта шақырмай, бұрынғы жауапты қайтарамыз (тек осы chatId ішінде
// ізделеді, сондықтан басқа клиенттің аты/қаласы кездейсоқ ағып кетпейді).
function findRepeatedAnswer(recent: ChatMessage[], userText: string): string | null {
  const normalized = userText.trim().toLowerCase();
  for (let i = 0; i < recent.length - 1; i++) {
    if (
      recent[i].role === "user" &&
      recent[i].content.trim().toLowerCase() === normalized &&
      recent[i + 1].role === "assistant"
    ) {
      return recent[i + 1].content;
    }
  }
  return null;
}

function buildAiMessages(chatId: string, userText: string) {
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

// Клиенттің нөмірін chatId-ден (77071234567@s.whatsapp.net) адам оқитын түрге түрлендіреді.
function formatContact(chatId: string): string {
  return `+${chatId.replace(/@.*$/, "")}`;
}

// Критикалық сәттер — 1) клиент барлық керек дерегін беріп, AI жазылымды растаған кез,
// 2) клиент ашуланған/шағымданған/күрделі жағдай туған кез (назар аудару міндетті).
// Екі жағдайда да кәсіп иесіне толық контекст (қысқаша қорытынды + соңғы хабарламалар)
// бірден жіберіледі, сол арқылы клиент күтіп отырған кезде хабарлама артынан қалып қоймайды.
function buildOwnerNotification(
  chatId: string,
  closingMessage: string,
  summary: string,
  recent: ChatMessage[],
  urgent: boolean
): string {
  const header = urgent
    ? "⚠️ НАЗАР АУДАРЫҢЫЗ! Клиент ашуланды/шағымданды"
    : "🔔 Жаңа лид!";
  const waLink = `https://wa.me/${chatId.replace(/@.*$/, "")}`;
  const parts = [header, `Клиент нөмірі: ${formatContact(chatId)} (${waLink})`];
  if (summary) parts.push(`Қысқаша: ${summary}`);
  const transcript = recent
    .map((m) => `${m.role === "user" ? "Клиент" : "Бот"}: ${m.content}`)
    .join("\n");
  if (transcript) parts.push(`Диалог:\n${transcript}`);
  parts.push(`Қорытынды: ${closingMessage}`);
  return parts.join("\n\n");
}

export interface IncomingMessageResult {
  reply: string;
  ownerNotification?: string;
}

export async function handleIncomingMessage(
  chatId: string,
  userText: string
): Promise<IncomingMessageResult> {
  if (isRateLimited(chatId)) {
    return { reply: RATE_LIMIT_REPLY };
  }

  // 1. Router — простые категории без обращения к AI-провайдеру
  const routed = routeMessage(userText);
  if (routed) {
    await memory.addTurn(chatId, userText, routed.answer);
    return { reply: routed.answer };
  }

  // 2. Осы диалогтағы тура қайталама сұрақ — бұрынғы жауапты қайталаймыз
  const { recent } = memory.getContext(chatId);
  const repeated = findRepeatedAnswer(recent, userText);
  if (repeated) {
    await memory.addTurn(chatId, userText, repeated);
    return { reply: repeated };
  }

  // 3. Кэш — если такой же вопрос уже задавали в начале диалога
  const cacheKey = `q:${userText.trim().toLowerCase()}`;
  if (recent.length === 0) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      await memory.addTurn(chatId, userText, cached);
      return { reply: cached };
    }
  }

  // 4. AI-провайдер — только если предыдущие шаги не дали ответа
  const conversationId = randomUUID();
  const startedAt = Date.now();
  try {
    const messages = buildAiMessages(chatId, userText);
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
    const isBookingConfirmed = finalReply.includes(BOOKING_MARKER);
    const needsAttention = finalReply.includes(ATTENTION_MARKER);
    if (isBookingConfirmed || needsAttention) {
      finalReply = finalReply.replace(BOOKING_MARKER, "").replace(ATTENTION_MARKER, "").trim();
    }

    const shouldSaveBooking = isBookingConfirmed && shouldNotifyOnce("booking", chatId);
    if (shouldSaveBooking) {
      saveBooking(chatId, finalReply);
    }

    await memory.addTurn(chatId, userText, finalReply);
    if (recent.length === 0) {
      await cache.set(cacheKey, finalReply, env.cacheTtlSeconds);
    }

    const shouldNotifyAttention = needsAttention && shouldNotifyOnce("attention", chatId);
    let ownerNotification: string | undefined;
    if (shouldSaveBooking || shouldNotifyAttention) {
      const updatedContext = memory.getContext(chatId);
      ownerNotification = buildOwnerNotification(
        chatId,
        finalReply,
        updatedContext.summary,
        updatedContext.recent,
        shouldNotifyAttention
      );
    }

    return { reply: finalReply, ownerNotification };
  } catch (error) {
    logError("Ошибка обращения к AI-провайдеру", error);
    return { reply: ERROR_REPLY };
  }
}
