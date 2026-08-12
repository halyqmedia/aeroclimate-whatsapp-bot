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

// Боттың өз жауаптарын маманның хабарламасынан ажырату үшін жіберілген
// хабарлама ID-ларын қысқа уақытқа есте сақтаймыз.
const botSentMessageIds = new Set<string>();

export function markAsBotMessage(messageId: string): void {
  botSentMessageIds.add(messageId);
  setTimeout(() => botSentMessageIds.delete(messageId), 60_000);
}

export function isBotMessage(messageId: string): boolean {
  return botSentMessageIds.has(messageId);
}
