import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { env } from "../config/env";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

export async function transcribeVoiceMessage(media: {
  data: string;
  mimetype: string;
}): Promise<string> {
  const ext = media.mimetype.includes("ogg") ? "ogg" : "mp3";
  const tmpPath = path.join(__dirname, "..", "..", `tmp_voice_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, Buffer.from(media.data, "base64"));
  try {
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: "whisper-1",
    });
    return transcription.text;
  } finally {
    fs.unlinkSync(tmpPath);
  }
}
