import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer } from "ws";

const PORT = 9880;
const staticDir = path.resolve(process.cwd(), "static");

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let reqPath = req.url?.split("?")[0] ?? "/";
  if (reqPath.startsWith('/static/')) reqPath = reqPath.slice('/static'.length);
  else if (!reqPath.startsWith('/shared/') && !reqPath.startsWith('/fonts/')) reqPath = `/phone-v3${reqPath}`;
  if (reqPath.endsWith('/')) reqPath += 'index.html';
  const filePath = path.resolve(staticDir, `.${reqPath}`);

  if (!filePath.startsWith(`${staticDir}${path.sep}`) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  res.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "state",
      tempo: 120,
      isPlaying: false,
      connected: true,
    })
  );

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.cmd) {
        ws.send(JSON.stringify({ type: "ack", cmd: data.cmd }));
      }
    } catch {}
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Surface Playwright Test Server running on port ${PORT}`);
});
