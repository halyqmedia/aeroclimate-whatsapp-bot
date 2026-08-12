import { startWhatsAppClient } from "./services/whatsappService";
import { startWebServer } from "./services/webServer";

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});

startWebServer();
startWhatsAppClient();
