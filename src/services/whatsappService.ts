import path from "path";
import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { transcribeVoiceMessage } from "./transcriptionService";
import { handleIncomingMessage } from "./messageService";
import { logInfo, logError } from "../utils/logger";

export function startWhatsAppClient(): void {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr) => {
    logInfo("Отсканируйте этот QR-код в WhatsApp (Связанные устройства):");
    qrcodeTerminal.generate(qr, { small: true });
    await QRCode.toFile(path.join(__dirname, "..", "..", "qr.png"), qr);
    logInfo("QR-код также сохранён как qr.png");
  });

  client.on("ready", () => {
    logInfo("Бот запущен и готов отвечать клиентам!");
  });

  client.on("disconnected", (reason) => {
    logError("WhatsApp-сессия отключена", reason);
  });

  client.on("auth_failure", (msg) => {
    logError("Ошибка авторизации WhatsApp", msg);
  });

  client.on("message", async (msg: Message) => {
    logInfo(`Получено сообщение от ${msg.from}: type=${msg.type} body="${msg.body}"`);
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

    const isVoiceMessage = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio");
    if (!msg.body && !isVoiceMessage) return;

    try {
      let userText = msg.body;

      if (isVoiceMessage) {
        let media;
        try {
          media = await msg.downloadMedia();
        } catch (error) {
          logError("Не удалось скачать голосовое сообщение", error);
        }
        if (!media) {
          await msg.reply(
            "Извините, не удалось скачать голосовое сообщение, напишите, пожалуйста, текстом 🙏\n" +
              "Кешіріңіз, дауыстық хабарламаны жүктей алмадым, жазбаша жазып жіберіңізші 🙏"
          );
          return;
        }
        userText = await transcribeVoiceMessage(media);
        logInfo(`Голосовое сообщение распознано: "${userText}"`);
      }

      if (!userText) return;

      const reply = await handleIncomingMessage(msg.from, userText);
      await msg.reply(reply);
    } catch (error) {
      logError("Ошибка обработки сообщения", error);
      await msg.reply(
        "Извините, у меня небольшая техническая заминка. Менеджер скоро свяжется с вами напрямую 🙏\n" +
          "Кешіріңіз, шағын техникалық ақау болды. Менеджер жақын арада сізбен тікелей байланысады 🙏"
      );
    }
  });

  client.initialize().catch((error) => logError("initialize() упал с ошибкой", error));
}
