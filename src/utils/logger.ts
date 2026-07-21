import fs from "fs";
import path from "path";

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LOG_FILE = path.join(LOG_DIR, "requests.log");

export interface RequestLogEntry {
  conversationId: string;
  user: string;
  question: string;
  responseTimeMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

function appendLine(line: string): void {
  fs.appendFileSync(LOG_FILE, line + "\n", "utf-8");
}

export function logInfo(message: string): void {
  const line = `[${new Date().toISOString()}] INFO ${message}`;
  console.log(line);
  appendLine(line);
}

export function logError(message: string, error?: unknown): void {
  const details = error instanceof Error ? error.message : String(error ?? "");
  const line = `[${new Date().toISOString()}] ERROR ${message} ${details}`;
  console.error(line);
  appendLine(line);
}

export function logRequest(entry: RequestLogEntry): void {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry });
  console.log(
    `Conversation ${entry.conversationId}\nInput:\n${entry.inputTokens} tokens\n\nOutput:\n${entry.outputTokens} tokens\n\nCost:\n$${entry.costUsd.toFixed(4)}`
  );
  appendLine(line);
}
