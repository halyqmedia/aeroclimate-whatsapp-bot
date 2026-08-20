import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { env } from "../config/env";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

export async function transcribeVoiceMessage(audio: Buffer, mimetype: string): Promise<string> {
  const ext = mimetype.includes("ogg") ? "ogg" : "mp3";
  const tmpPath = path.join(env.storageDir, `tmp_voice_${Date.now()}.${ext}`);
  fs.writeFileSync(tmpPath, audio);
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
