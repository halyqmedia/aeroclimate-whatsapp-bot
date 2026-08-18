import path from "path";
import { Client, LocalAuth, Message } from "whatsapp-web.js";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import { transcribeVoiceMessage } from "./transcriptionService";
import { handleIncomingMessage } from "./messageService";
import { logInfo, logError } from "../utils/logger";
import { env } from "../config/env";
import { setLatestQr, setReady, setDisconnected } from "./webServer";
import {
  pauseBotForChat,
  isBotPausedForChat,
  markBotIsReplying,
  consumeIfBotReply,
} from "./humanTakeoverService";

const VOICE_DOWNLOAD_FAILED_REPLY =
  "Извините, не удалось скачать голосовое сообщение, напишите, пожалуйста, текстом 🙏\n" +
  "Кешіріңіз, дауыстық хабарламаны жүктей алмадым, жазбаша жазып жіберіңізші 🙏";

const ERROR_REPLY =
  "Извините, у меня небольшая техническая заминка. Менеджер скоро свяжется с вами напрямую 🙏\n" +
  "Кешіріңіз, шағын техникалық ақау болды. Менеджер жақын арада сізбен тікелей байланысады 🙏";

export function startWhatsAppClient(): void {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(env.storageDir, ".wwebjs_auth") }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
    ...(env.whatsappPhoneNumber
      ? { pairWithPhoneNumber: { phoneNumber: env.whatsappPhoneNumber, showNotification: true } }
      : {}),
  });

  client.on("qr", async (qr) => {
    logInfo("Отсканируйте этот QR-код в WhatsApp (Связанные устройства):");
    qrcodeTerminal.generate(qr, { small: true });
    await QRCode.toFile(path.join(env.storageDir, "qr.png"), qr);
    logInfo("QR-код также сохранён как qr.png");
    setLatestQr(qr);
  });

  client.on("code", (code) => {
    logInfo(`Код байланыстыру (WhatsApp → Байланысу коды арқылы құрылғы қосу): ${code}`);
  });

  client.on("ready", () => {
    logInfo("Бот запущен и готов отвечать клиентам!");
    setReady();
  });

  client.on("disconnected", (reason) => {
    logError("WhatsApp-сессия отключена", reason);
    setDisconnected();
  });

  client.on("auth_failure", (msg) => {
    logError("Ошибка авторизации WhatsApp", msg);
  });

  // Маман өзі WhatsApp-тан жауап жазса (fromMe, боттың өз хабарламасы емес),
  // сол чат үшін ботты уақытша тоқтатамыз — клиентпен маман тікелей сөйлесіп жатыр.
  // Тек нақты жазылған хабарлама түрлеріне ғана қараймыз: жарнамадан (Facebook/
  // Instagram) келген жаңа лидтерде WhatsApp өзі notification_template/protocol
  // сияқты жүйелік хабарламаны fromMe=true етіп белгілейді — бұл адам жазған
  // хабарлама емес, сондықтан ескермейміз (әйтпесе бот жаңа лидке бір рет те
  // жауап бермей тұрып өзін-өзі тоқтатып тастайды).
  const REAL_MESSAGE_TYPES = new Set([
    "chat",
    "image",
    "video",
    "audio",
    "ptt",
    "document",
    "location",
    "sticker",
    "vcard",
    "multi_vcard",
  ]);

  client.on("message_create", (msg: Message) => {
    if (!msg.fromMe || !REAL_MESSAGE_TYPES.has(msg.type)) return;
    const chatId = msg.id.remote;
    if (chatId.includes("@g.us") || chatId === "status@broadcast") return;

    if (consumeIfBotReply(chatId, msg.body)) return;

    pauseBotForChat(chatId);
    logInfo(`Маман ${chatId} чатына өзі жауап берді (type=${msg.type}), бот уақытша тоқтатылды`);
  });

  client.on("message", async (msg: Message) => {
    logInfo(`Получено сообщение от ${msg.from}: type=${msg.type} body="${msg.body}"`);
    if (msg.from.includes("@g.us") || msg.from === "status@broadcast") return;

    if (isBotPausedForChat(msg.from)) {
      logInfo(`Бот ${msg.from} үшін тоқтатылған, хабарлама өткізіп жіберілді`);
      return;
    }

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
          markBotIsReplying(msg.from, VOICE_DOWNLOAD_FAILED_REPLY);
          await msg.reply(VOICE_DOWNLOAD_FAILED_REPLY);
          return;
        }
        userText = await transcribeVoiceMessage(media);
        logInfo(`Голосовое сообщение распознано: "${userText}"`);
      }

      if (!userText) return;

      const reply = await handleIncomingMessage(msg.from, userText);
      markBotIsReplying(msg.from, reply);
      await msg.reply(reply);
    } catch (error) {
      logError("Ошибка обработки сообщения", error);
      markBotIsReplying(msg.from, ERROR_REPLY);
      await msg.reply(ERROR_REPLY);
    }
  });

  client.initialize().catch((error) => logError("initialize() упал с ошибкой", error));
}
