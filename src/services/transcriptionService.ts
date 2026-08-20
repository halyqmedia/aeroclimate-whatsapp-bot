import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

const TRANSCRIBE_MODEL = "gemini-3.5-flash";

const TRANSCRIBE_PROMPT =
  "Осы дауыстық хабарламаның мәтінін сөзбе-сөз транскрипциялап жаз. Тек транскрипция " +
  "мәтінін қайтар, түсініктеме, кіріспе немесе қосымша сөз қоспа.";

let client: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

export async function transcribeVoiceMessage(audio: Buffer, mimetype: string): Promise<string> {
  const mimeType = mimetype.split(";")[0].trim();

  const response = await getGeminiClient().models.generateContent({
    model: TRANSCRIBE_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: TRANSCRIBE_PROMPT },
          { inlineData: { mimeType, data: audio.toString("base64") } },
        ],
      },
    ],
    config: {
      maxOutputTokens: 500,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return (response.text ?? "").trim();
}
