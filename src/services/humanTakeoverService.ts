import { env } from "../config/env";

// Маман WhatsApp-тан (телефон/WhatsApp Web) өзі жауап жазса, осы чат үшін
// бот белгілі бір уақытқа дейін автожауап беруді тоқтатады.
const pausedUntilByChat = new Map<string, number>();

export function pauseBotForChat(chatId: string): void {
  pausedUntilByChat.set(chatId, Date.now() + env.agentPauseMs);
}

export function isBotPausedForChat(chatId: string): boolean {
  const until = pausedUntilByChat.get(chatId);
  if (!until) return false;
  if (Date.now() >= until) {
    pausedUntilByChat.delete(chatId);
    return false;
  }
  return true;
}

// Боттың өз жауаптарын маманның хабарламасынан ажырату үшін chatId+мәтін бойынша
// салыстырамыз. msg.reply() қайтаратын Message объектісіне (демек оның id-іне)
// сенуге болмайды — whatsapp-web.js кейде хабарлама сәтті жіберілсе де осы
// объектіні undefined етіп қайтарады (кітапхананың ішкі race condition-ы).
interface PendingBotReply {
  text: string;
  expiresAt: number;
}

const pendingBotReplyByChat = new Map<string, PendingBotReply>();
const PENDING_TTL_MS = 15_000;

export function markBotIsReplying(chatId: string, text: string): void {
  pendingBotReplyByChat.set(chatId, { text, expiresAt: Date.now() + PENDING_TTL_MS });
}

export function consumeIfBotReply(chatId: string, text: string): boolean {
  const pending = pendingBotReplyByChat.get(chatId);
  if (!pending || Date.now() >= pending.expiresAt) {
    pendingBotReplyByChat.delete(chatId);
    return false;
  }
  if (pending.text !== text) return false;
  pendingBotReplyByChat.delete(chatId);
  return true;
}
