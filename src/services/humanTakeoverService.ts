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

// Боттың өз жауаптарын маманның хабарламасынан ажырату үшін chatId+мәтін
// бойынша салыстырамыз (хабарлама ID-іне емес — соны сақтау үшін жіберу
// нәтижесінің әрдайым тұрақты қайтарылуына сену керек еді).
//
// Бір чатқа қатар бірнеше жауап дайын болуы мүмкін (клиент кетінен бірнеше
// хабарлама жазса, әр хабарлама параллель өңделеді) — сол себепті чат басына
// бір емес, кезек (массив) сақтаймыз, әйтпесе екінші жауап біріншісінің
// жазбасын үстінен басып жазып, оны "маман жауабы" қылып көрсетіп қояды.
interface PendingBotReply {
  text: string;
  expiresAt: number;
}

const pendingBotRepliesByChat = new Map<string, PendingBotReply[]>();
const PENDING_TTL_MS = 30_000;

export function markBotIsReplying(chatId: string, text: string): void {
  const list = pendingBotRepliesByChat.get(chatId) ?? [];
  list.push({ text, expiresAt: Date.now() + PENDING_TTL_MS });
  pendingBotRepliesByChat.set(chatId, list);
}

export function consumeIfBotReply(chatId: string, text: string): boolean {
  const list = pendingBotRepliesByChat.get(chatId);
  if (!list) return false;

  const now = Date.now();
  const fresh = list.filter((p) => p.expiresAt > now);
  const index = fresh.findIndex((p) => p.text === text);
  const matched = index !== -1;
  if (matched) fresh.splice(index, 1);

  if (fresh.length > 0) {
    pendingBotRepliesByChat.set(chatId, fresh);
  } else {
    pendingBotRepliesByChat.delete(chatId);
  }
  return matched;
}
