import {
  businessName,
  services,
  workingHours,
  personality,
  bookingIntentHint,
} from "../config/business";

export function buildSystemPrompt(): string {
  const servicesList = services
    .map((s) => `- ${s.name} | ${s.duration} | ${s.price} — ${s.description}`)
    .join("\n");

  return `Ты — ассистент компании "${businessName}", работаешь в WhatsApp 24/7.

${personality}

Услуги:
${servicesList}

Часы работы: ${workingHours}

${bookingIntentHint}`;
}
