import fs from "fs";
import path from "path";
import { logInfo } from "../utils/logger";

const BOOKINGS_FILE = path.join(__dirname, "..", "..", "bookings.json");
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, "[]");

interface Booking {
  chatId: string;
  rawSummary: string;
  createdAt: string;
}

export function saveBooking(chatId: string, text: string): void {
  const bookings: Booking[] = JSON.parse(fs.readFileSync(BOOKINGS_FILE, "utf-8"));
  bookings.push({ chatId, rawSummary: text, createdAt: new Date().toISOString() });
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
  logInfo(`Новая запись сохранена от ${chatId}`);
}
