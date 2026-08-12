import fs from "fs";
import path from "path";
import { env } from "../config/env";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Summarizer = (oldMessages: ChatMessage[], previousSummary: string) => Promise<string>;

const RECENT_LIMIT = 6; // сколько последних сообщений отправляем как есть
const STORE_FILE = path.join(env.storageDir, "conversations.json");

interface ChatState {
  summary: string;
  recent: ChatMessage[];
}

// Хранит историю диалога в памяти и дублирует на диск (STORE_FILE), чтобы рестарт
// процесса не обнулял диалоги у всех клиентов разом. В AI-провайдер по-прежнему
// уходит только summary + последние RECENT_LIMIT сообщений — экономит токены.
export class ConversationMemory {
  private chats = new Map<string, ChatState>();

  constructor(private readonly summarize: Summarizer) {
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(STORE_FILE)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8")) as Record<string, ChatState>;
      this.chats = new Map(Object.entries(raw));
    } catch {
      // повреждённый файл — начинаем с чистой памяти вместо падения бота
    }
  }

  private persist(): void {
    fs.writeFileSync(STORE_FILE, JSON.stringify(Object.fromEntries(this.chats)));
  }

  async addTurn(chatId: string, userText: string, assistantText: string): Promise<void> {
    const state = this.chats.get(chatId) ?? { summary: "", recent: [] };

    state.recent.push({ role: "user", content: userText });
    state.recent.push({ role: "assistant", content: assistantText });

    if (state.recent.length > RECENT_LIMIT) {
      const overflowCount = state.recent.length - RECENT_LIMIT;
      const toSummarize = state.recent.slice(0, overflowCount);
      state.recent = state.recent.slice(overflowCount);
      state.summary = await this.summarize(toSummarize, state.summary);
    }

    this.chats.set(chatId, state);
    this.persist();
  }

  getContext(chatId: string): { summary: string; recent: ChatMessage[] } {
    const state = this.chats.get(chatId);
    return state ? { summary: state.summary, recent: state.recent } : { summary: "", recent: [] };
  }
}
