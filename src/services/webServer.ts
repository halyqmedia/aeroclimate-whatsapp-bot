import http from "http";
import QRCode from "qrcode";
import { env } from "../config/env";
import { logInfo } from "../utils/logger";

let latestQr: string | null = null;
let isReady = false;

export function setLatestQr(qr: string): void {
  latestQr = qr;
  isReady = false;
}

export function setReady(): void {
  isReady = true;
  latestQr = null;
}

export function setDisconnected(): void {
  isReady = false;
  latestQr = null;
}

function renderPage(prefix: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aeroclimate WhatsApp</title>
<style>
body{font-family:sans-serif;text-align:center;padding:40px 16px;background:#111;color:#eee}
img{width:280px;height:280px;background:#fff;padding:12px;border-radius:8px}
.status{font-size:20px;margin-top:16px}
</style></head>
<body>
<h2>Aeroclimate WhatsApp боты</h2>
<div id="content">Жүктелуде...</div>
<script>
var prefix = ${JSON.stringify(prefix)};
async function tick(){
  const res = await fetch(prefix + '/status', {cache:'no-store'});
  const data = await res.json();
  const el = document.getElementById('content');
  if (data.ready) {
    el.innerHTML = '<div class="status">Байланысты! Терезені жабуға болады.</div>';
  } else if (data.hasQr) {
    el.innerHTML = '<img src="' + prefix + '/qr.png?t=' + Date.now() + '"><div class="status">QR-ды сканерлеңіз</div>';
  } else {
    el.innerHTML = '<div class="status">QR күтілуде...</div>';
  }
}
tick();
setInterval(tick, 1500);
</script>
</body></html>`;
}

export function startWebServer(): void {
  const secret = env.webQrSecret;
  if (!secret) {
    logInfo("WEB_QR_SECRET орнатылмаған — QR веб-беті өшірулі");
    return;
  }

  const prefix = `/q/${secret}`;
  const port = Number(process.env.PORT) || 8080;

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "";

    if (url === prefix || url === `${prefix}/`) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderPage(prefix));
      return;
    }

    if (url === `${prefix}/status`) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ready: isReady, hasQr: Boolean(latestQr) }));
      return;
    }

    if (url.startsWith(`${prefix}/qr.png`)) {
      if (!latestQr) {
        res.writeHead(404);
        res.end();
        return;
      }
      const buffer = await QRCode.toBuffer(latestQr);
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(buffer);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    logInfo(`QR веб-беті іске қосылды: /q/${secret}`);
  });
}
