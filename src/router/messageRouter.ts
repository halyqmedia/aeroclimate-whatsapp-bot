import faq from "../prompt/faq.json";

// "Сәлем" сюда намеренно не входит — первое сообщение в диалоге должно проходить
// через AI-провайдер, чтобы сработал сценарий приветствия и сбора имени (см. config/business.ts).
const KEYWORDS: Record<string, string[]> = {
  бағасы: ["баға", "цена", "цену", "стоимость", "сколько стоит", "прайс", "құны"],
  "жұмыс уақыты": [
    "жұмыс уақыты",
    "рабочее время",
    "часы работы",
    "во сколько работаете",
    "график работы",
  ],
  телефон: ["телефон", "номер телефона", "ваш номер", "позвонить", "нөмір"],
  төлем: ["оплата", "төлем", "как оплатить", "безнал", "қолма-қол"],
  рахмет: ["рахмет", "спасибо", "благодарю", "рақмет", "спс"],
};

export interface RouteResult {
  matchedCategory: string;
  answer: string;
}

/**
 * Пытается ответить без обращения к AI-провайдеру. Возвращает null, если сообщение
 * не подходит ни под одну простую категорию — тогда решение принимает AI.
 */
export function routeMessage(userText: string): RouteResult | null {
  const normalized = userText.toLowerCase().trim();

  for (const [category, keywords] of Object.entries(KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      const answer = (faq as Record<string, string>)[category];
      if (answer) return { matchedCategory: category, answer };
    }
  }

  return null;
}
