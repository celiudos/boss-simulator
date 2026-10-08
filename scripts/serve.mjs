// Servidor de desenvolvimento (npm start).
// - Jogo com live reload na porta 3000, aberto para localhost e para a rede (LAN).
// - Proxy do Ollama na porta `game.ollama.lanProxyPort` (3005), usado por quem abre o jogo
//   pelo IP da rede: o navegador nao alcanca o Ollama, que so escuta em 127.0.0.1:11434.
//
// - Com `game.ollama.instances` > 1, sobe `ollama serve` extras (portas `extraInstanceBasePort`+),
//   cada um carregando sua propria copia do modelo.
//
// Uso: node scripts/serve.mjs [--no-browser]
import { spawn } from "node:child_process";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { pipeline } from "node:stream";
import { fileURLToPath } from "node:url";
import liveServer from "live-server";
import { game } from "../config/game.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GAME_PORT = 3000;
const WATCH = ["index.html", "style.css", "game", "config", "personas"];

const ollama = new URL(game.ollama.baseUrl);
const PROXY_PORT = game.ollama.lanProxyPort;
const INSTANCES = Math.max(1, Math.floor(game.ollama.instances) || 1);
/** Porta do Ollama da instancia `i` (0 = o padrao do baseUrl). */
const instancePort = (i) => (i === 0 ? ollama.port : String(game.ollama.extraInstanceBasePort + i - 1));
/** So as rotas que o jogo usa: o resto da API (pull, delete...) nao fica exposto na rede. */
const PROXY_ROUTES = new Set(["GET /api/tags", "POST /api/chat"]);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function sendJson(res, status, body) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

// ── Proxy do Ollama ───────────────────────────────────────
const proxy = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return res.writeHead(204, CORS).end();
  if (!PROXY_ROUTES.has(`${req.method} ${req.url.replace(/^\/i\/\d+/, "").split("?")[0]}`)) {
    return sendJson(res, 404, { error: `rota nao liberada no proxy: ${req.method} ${req.url}` });
  }

  // Pela LAN a instancia vem no caminho (/i/<n>/api/chat); sem prefixo e a instancia 0.
  const match = req.url.match(/^\/i\/(\d+)(\/.*)$/);
  const instance = match ? Number(match[1]) : 0;
  const path = match ? match[2] : req.url;
  if (instance >= INSTANCES) return sendJson(res, 404, { error: `instancia ${instance} nao existe` });

  // O Ollama recusa Origin de fora do localhost: o pedido segue como se viesse desta maquina.
  const { origin, referer, ...headers } = req.headers;
  const upstream = http.request(
    {
      hostname: ollama.hostname,
      port: instancePort(instance),
      path,
      method: req.method,
      headers: { ...headers, host: `${ollama.hostname}:${instancePort(instance)}` },
    },
    (up) => {
      res.writeHead(up.statusCode, { ...up.headers, ...CORS });
      pipeline(up, res, () => {});
    },
  );
  upstream.on("error", (err) => {
    if (res.headersSent || res.destroyed) return res.destroy();
    sendJson(res, 502, { error: `Ollama indisponivel em ${ollama.origin} (${err.message})` });
  });
  // Navegador desistiu (ex.: cancelou o stream): derruba o pedido para o Ollama parar de gerar.
  res.on("close", () => upstream.destroy());
  req.pipe(upstream);
});

proxy.on("error", (err) => {
  console.error(`Proxy do Ollama nao subiu na porta ${PROXY_PORT} (${err.message}). Pela LAN o chat nao vai funcionar.`);
});
proxy.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Proxy do Ollama para a LAN: porta ${PROXY_PORT} -> ${ollama.origin}`);
});

// ── Instancias extras do Ollama ───────────────────────────
// A 1a e o Ollama que ja roda na maquina; as outras sao processos proprios (mesma pasta de modelos),
// porque um unico servidor reaproveita a mesma copia do modelo em vez de carregar outra na VRAM.
const children = [];
for (let i = 1; i < INSTANCES; i++) {
  const host = `${ollama.hostname}:${instancePort(i)}`;
  const child = spawn("ollama", ["serve"], {
    env: { ...process.env, OLLAMA_HOST: host },
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-400)));
  child.on("error", (err) => console.error(`Ollama extra #${i} nao iniciou (${err.message}). O comando "ollama" esta no PATH?`));
  child.on("exit", (code) => {
    if (code) console.error(`Ollama extra #${i} (${host}) encerrou com codigo ${code}. ${stderr.trim()}`);
  });
  children.push(child);
  console.log(`Ollama extra #${i}: ${host}`);
}
const stopChildren = () => children.forEach((c) => c.kill());
process.on("exit", stopChildren);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));

// ── Jogo ──────────────────────────────────────────────────
const server = liveServer.start({
  root,
  host: "0.0.0.0",
  port: GAME_PORT,
  open: process.argv.includes("--no-browser") ? false : "/",
  watch: WATCH.map((p) => resolve(root, p)),
  wait: 200,
});

server.on("listening", () => {
  const { port } = server.address();
  const lan = Object.entries(networkInterfaces()).flatMap(([name, addrs]) =>
    addrs.filter((a) => a.family === "IPv4" && !a.internal).map((a) => `  http://${a.address}:${port}  (${name})`),
  );
  console.log(lan.length ? `Na rede (LAN):\n${lan.join("\n")}` : "Nenhum IP de rede (LAN) encontrado.");
});
