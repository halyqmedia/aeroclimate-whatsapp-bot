import path from "path";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  DisconnectReason,
  downloadMediaMessage,
  getContentType,
  normalizeMessageContent,
  isJidGroup,
  isJidStatusBroadcast,
  WAMessage,
  WASocket,
} from "baileys";
import { transcribeVoiceMessage } from "./transcriptionService";
import { analyzeProjectFile } from "./mediaService";
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

const MEDIA_DOWNLOAD_FAILED_REPLY =
  "Извините, не удалось загрузить файл, отправьте, пожалуйста, ещё раз 🙏\n" +
  "Кешіріңіз, файлды жүктей алмадым, қайта жіберіп жіберіңізші 🙏";

const MEDIA_LABEL_BY_TYPE: Record<string, string> = {
  imageMessage: "фото",
  videoMessage: "видео",
  documentMessage: "құжат/жоба",
};

const ERROR_REPLY =
  "Извините, у меня небольшая техническая заминка. Менеджер скоро свяжется с вами напрямую 🙏\n" +
  "Кешіріңіз, шағын техникалық ақау болды. Менеджер жақын арада сізбен тікелей байланысады 🙏";

// Маман WhatsApp-тан жауап жазғанын анықтау үшін тек нақты жазылған хабарлама
// түрлеріне ғана қараймыз — жүйелік/шаблон түрлерін (протокол, кілт тарату
// және т.б.) елемейміз, олар адам жазбаса да fromMe болып келуі мүмкін
// (мыс. жарнамадан келген жаңа лидтерде) және ботты себепсіз тоқтатып тастайды.
const REAL_CONTENT_TYPES = new Set([
  "conversation",
  "extendedTextMessage",
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
  "locationMessage",
  "contactMessage",
  "contactsArrayMessage",
]);

function extractText(content: ReturnType<typeof normalizeMessageContent>): string | undefined {
  return content?.conversation ?? content?.extendedTextMessage?.text ?? undefined;
}

function extractMediaInfo(
  content: ReturnType<typeof normalizeMessageContent>,
  contentType: string
): { mimetype?: string; caption?: string } {
  switch (contentType) {
    case "imageMessage":
      return {
        mimetype: content?.imageMessage?.mimetype ?? undefined,
        caption: content?.imageMessage?.caption ?? undefined,
      };
    case "videoMessage":
      return {
        mimetype: content?.videoMessage?.mimetype ?? undefined,
        caption: content?.videoMessage?.caption ?? undefined,
      };
    case "documentMessage":
      return {
        mimetype: content?.documentMessage?.mimetype ?? undefined,
        caption: content?.documentMessage?.caption ?? undefined,
      };
    default:
      return {};
  }
}

async function sendReply(sock: WASocket, chatId: string, text: string, quoted: WAMessage): Promise<void> {
  markBotIsReplying(chatId, text);
  await sock.sendMessage(chatId, { text }, { quoted });
}

// Кәсіп иесіне (Ербол мырза) критикалық сәтте — клиент барлық дерек беріп, жазылым
// расталғанда — хабарлау. Клиентпен диалогтан бөлек әрекет болғандықтан, бұл жерде
// қате шықса да клиентке жауап беру процесі үзілмейді.
async function notifyOwner(sock: WASocket, text: string): Promise<void> {
  if (!env.ownerWhatsappNumber) return;
  const ownerJid = `${env.ownerWhatsappNumber}@s.whatsapp.net`;
  try {
    await sock.sendMessage(ownerJid, { text });
  } catch (error) {
    logError("Кәсіп иесіне хабарлау мүмкін болмады", error);
  }
}

async function handleMessage(sock: WASocket, msg: WAMessage): Promise<void> {
  const chatId = msg.key.remoteJid;
  if (!chatId || isJidGroup(chatId) || isJidStatusBroadcast(chatId)) return;

  const content = normalizeMessageContent(msg.message);
  const contentType = getContentType(content ?? undefined);

  if (msg.key.fromMe) {
    if (!contentType || !REAL_CONTENT_TYPES.has(contentType)) return;

    if (consumeIfBotReply(chatId, extractText(content) ?? "")) return;

    pauseBotForChat(chatId);
    logInfo(`Маман ${chatId} чатына өзі жауап берді (type=${contentType}), бот уақытша тоқтатылды`);
    return;
  }

  const isVoiceMessage = contentType === "audioMessage" && Boolean(content?.audioMessage?.ptt);
  const isMediaMessage = Boolean(contentType && MEDIA_LABEL_BY_TYPE[contentType]);
  logInfo(`Получено сообщение от ${chatId}: type=${contentType ?? "unknown"} body="${extractText(content) ?? ""}"`);
  if (!contentType) {
    logInfo(
      `Диагностика: messageStubType=${msg.messageStubType ?? "none"} message=${JSON.stringify(msg.message)}`
    );
  }

  if (isBotPausedForChat(chatId)) {
    logInfo(`Бот ${chatId} үшін тоқтатылған, хабарлама өткізіп жіберілді`);
    return;
  }

  let userText = extractText(content);
  if (!userText && !isVoiceMessage && !isMediaMessage) return;

  try {
    if (isVoiceMessage) {
      let audio: Buffer | undefined;
      try {
        audio = await downloadMediaMessage(msg, "buffer", {});
      } catch (error) {
        logError("Не удалось скачать голосовое сообщение", error);
      }
      if (!audio) {
        await sendReply(sock, chatId, VOICE_DOWNLOAD_FAILED_REPLY, msg);
        return;
      }
      userText = await transcribeVoiceMessage(audio, content?.audioMessage?.mimetype ?? "audio/ogg");
      logInfo(`Голосовое сообщение распознано: "${userText}"`);
    } else if (isMediaMessage && contentType) {
      let mediaBuffer: Buffer | undefined;
      try {
        mediaBuffer = await downloadMediaMessage(msg, "buffer", {});
      } catch (error) {
        logError("Не удалось скачать файл клиента", error);
      }
      if (!mediaBuffer) {
        await sendReply(sock, chatId, MEDIA_DOWNLOAD_FAILED_REPLY, msg);
        return;
      }

      const { mimetype, caption } = extractMediaInfo(content, contentType);
      const label = MEDIA_LABEL_BY_TYPE[contentType];

      let analysis = "";
      try {
        analysis = await analyzeProjectFile(mediaBuffer, mimetype ?? "application/octet-stream");
      } catch (error) {
        logError("Не удалось проанализировать файл клиента", error);
      }
      logInfo(`Файл клиента (${label}) проанализирован: "${analysis}"`);

      const parts: string[] = [];
      if (caption) parts.push(caption);
      parts.push(
        analysis
          ? `[Жүйе: клиент ${label} жіберді. Файлдан алынған мәлімет: ${analysis}]`
          : `[Жүйе: клиент ${label} жіберді, бірақ мазмұнын автоматты түрде оқу мүмкін болмады.]`
      );
      userText = parts.join("\n");
    }

    if (!userText) return;

    const result = await handleIncomingMessage(chatId, userText);
    await sendReply(sock, chatId, result.reply, msg);
    if (result.ownerNotification) {
      await notifyOwner(sock, result.ownerNotification);
    }
  } catch (error) {
    logError("Ошибка обработки сообщения", error);
    await sendReply(sock, chatId, ERROR_REPLY, msg);
  }
}

export async function startWhatsAppClient(): Promise<void> {
  const logger = pino({ level: "warn" });
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(env.storageDir, "baileys_auth_v7")
  );

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      // Signal сессияларын жедел жадта кэштейді — файлдан тек оқитын дүкенмен
      // шифрды шешу кейде сәтсіз аяқталады (кілттерге қатарынан жедел қатынас
      // қажет болғанда), CIPHERTEXT stub ретінде көрінеді.
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ["Aeroclimate", "Chrome", "1.0.0"],
  });

  if (env.whatsappPhoneNumber && !sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(env.whatsappPhoneNumber);
      logInfo(`Код байланыстыру (WhatsApp → Байланысу коды арқылы құрылғы қосу): ${code}`);
    } catch (error) {
      logError("Байланыстыру кодын алу мүмкін болмады", error);
    }
  }

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !env.whatsappPhoneNumber) {
      logInfo("Отсканируйте этот QR-код в WhatsApp (Связанные устройства):");
      qrcodeTerminal.generate(qr, { small: true });
      await QRCode.toFile(path.join(env.storageDir, "qr.png"), qr);
      logInfo("QR-код также сохранён как qr.png");
      setLatestQr(qr);
    }

    if (connection === "open") {
      logInfo("Бот запущен и готов отвечать клиентам!");
      setReady();
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      logError("WhatsApp-сессия отключена", lastDisconnect?.error);
      setDisconnected();

      if (!loggedOut) {
        startWhatsAppClient().catch((error) => logError("Қайта қосылу кезінде қате", error));
      } else {
        logError("Сессия шықты (logged out) — қайта QR сканерлеу керек", undefined);
      }
    }
  });

  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      handleMessage(sock, msg).catch((error) => logError("Ошибка обработки сообщения", error));
    }
  });
}
