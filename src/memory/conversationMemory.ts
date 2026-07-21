export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type Summarizer = (oldMessages: ChatMessage[], previousSummary: string) => Promise<string>;

const RECENT_LIMIT = 6; // сколько последних сообщений отправляем как есть

interface ChatState {
  summary: string;
  recent: ChatMessage[];
}

// Хранит историю диалога в памяти. Отправляет в Claude только summary + последние
// RECENT_LIMIT сообщений, а не весь диалог — экономит токены на длинных беседах.
export class ConversationMemory {
  private chats = new Map<string, ChatState>();

  constructor(private readonly summarize: Summarizer) {}

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
  }

  getContext(chatId: string): { summary: string; recent: ChatMessage[] } {
    const state = this.chats.get(chatId);
    return state ? { summary: state.summary, recent: state.recent } : { summary: "", recent: [] };
  }
}
