import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";

const MEDIA_MODEL = "gemini-3.5-flash";

const MEDIA_ANALYSIS_PROMPT =
  "Бұл — вентиляция/кондиционирлеу объектісінің жоспары, чертежі, фотосы немесе видеосы. Ондағы " +
  "аудан, бөлме өлшемдері, төбе биіктігі сияқты өлшемдерді және маңызды техникалық ақпаратты қазақша " +
  "қысқаша (3-5 жол) тізіп жаз. Нақты өлшем көрінбесе — 'нақты өлшем көрінбейді, объект түрі: ...' деп " +
  "жаз. Түсініктеме, кіріспе сөз қоспай, тек нәтижені қайтар.";

let client: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!client) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
}

// Клиент жіберген жоба/чертеж/фото/видеоны Gemini арқылы "оқиды" да, ондағы өлшемдерді
// қысқаша мәтінге түрлендіреді — негізгі AI-провайдер (Claude/т.б.) қайтадан аудан/өлшем
// сұрамай, осы мәтінді дерек ретінде пайдалана алады.
export async function analyzeProjectFile(file: Buffer, mimetype: string): Promise<string> {
  const mimeType = mimetype.split(";")[0].trim();

  const response = await getGeminiClient().models.generateContent({
    model: MEDIA_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: MEDIA_ANALYSIS_PROMPT },
          { inlineData: { mimeType, data: file.toString("base64") } },
        ],
      },
    ],
    config: {
      maxOutputTokens: 400,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return (response.text ?? "").trim();
}
