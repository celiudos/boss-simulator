// Cliente minimo da API local do Ollama (https://github.com/ollama/ollama/blob/main/docs/api.md).
// Modelo, URL, opcoes e quantidade de instancias ficam em config/game.js (ollama).
import { game } from "../config/index.js";

const cfg = game.ollama;

/** Aberto pelo IP da rede (LAN): passa pelo proxy do `npm start` na mesma maquina do jogo. */
export const viaLanProxy = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

/**
 * Instancia 0 = Ollama padrao (`baseUrl`); as demais sao `ollama serve` extras que o `npm start`
 * sobe nas portas seguintes (`extraInstanceBasePort`), cada uma com sua copia do modelo na VRAM.
 * Pela LAN, o proxy recebe o indice no caminho: /i/<n>/api/chat.
 */
const instanceCount = Math.max(1, Math.floor(cfg.instances) || 1);
const instanceUrls = Array.from({ length: instanceCount }, (_, i) => {
  if (viaLanProxy) return `http://${location.hostname}:${cfg.lanProxyPort}${i ? `/i/${i}` : ""}`;
  const url = new URL(cfg.baseUrl);
  if (i) url.port = String(cfg.extraInstanceBasePort + i - 1);
  return url.origin;
});
export const baseUrl = instanceUrls[0];

/** Instancias que responderam no checkOllama (a 0 sempre fica) e pedidos em andamento em cada uma. */
let active = [0];
const inflight = instanceUrls.map(() => 0);
let rotation = 0;

/** Escolhe a instancia menos ocupada (empate gira entre elas). Retorna { url, release }. */
function acquire() {
  let best = null;
  for (let n = 0; n < active.length; n++) {
    const i = active[(rotation + n) % active.length];
    if (best === null || inflight[i] < inflight[best]) best = i;
  }
  rotation++;
  inflight[best]++;
  let released = false;
  return {
    url: instanceUrls[best],
    release: () => {
      if (!released) inflight[best]--;
      released = true;
    },
  };
}

/** Mesmo modelo, keep_alive e opcoes em todas as chamadas: mudar num_ctx recarregaria o modelo. */
function chatBody(extra) {
  return { model: cfg.model, keep_alive: cfg.keepAlive, think: cfg.think, options: cfg.options, ...extra };
}

/**
 * POST numa instancia (`url` fixa uma; senao a menos ocupada). Retorna { res, release }:
 * chame release() quando terminar de ler a resposta.
 */
async function post(path, body, signal, url) {
  const slot = url ? { url, release() {} } : acquire();
  try {
    const res = await fetch(`${slot.url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      let message = detail;
      try {
        message = JSON.parse(detail).error ?? detail;
      } catch {}
      throw new Error(message || `HTTP ${res.status}`);
    }
    return { res, release: slot.release };
  } catch (err) {
    slot.release();
    throw err;
  }
}

/**
 * Ollama no ar? Modelo instalado? -> { online, hasModel, instances, error }
 * Instancias extras que nao respondem ficam de fora (o jogo segue com as demais).
 */
export async function checkOllama() {
  const wanted = cfg.model.includes(":") ? cfg.model : `${cfg.model}:latest`;
  const results = await Promise.all(
    instanceUrls.map(async (url) => {
      try {
        const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const { models = [] } = await res.json();
        return { hasModel: models.some((m) => m.name === wanted || m.model === wanted) };
      } catch (err) {
        return { error: err.message };
      }
    }),
  );
  if (results[0].error) return { online: false, hasModel: false, instances: 0, error: results[0].error };
  active = results.flatMap((r, i) => (i === 0 || (!r.error && r.hasModel) ? [i] : []));
  if (active.length < instanceCount) {
    console.warn(`[ollama] ${active.length} de ${instanceCount} instancias disponiveis (ativas: ${active.join(", ")})`);
  }
  return { online: true, hasModel: results[0].hasModel, instances: active.length };
}

/** Carrega o modelo em cada instancia (chat sem mensagens) para a 1a resposta nao esperar o load. */
export async function warmUp() {
  const results = await Promise.allSettled(
    active.map(async (i) => {
      const { res } = await post("/api/chat", chatBody({ messages: [], stream: false }), undefined, instanceUrls[i]);
      await res.json();
    }),
  );
  if (results[0].status === "rejected") throw results[0].reason;
  // Extra que falhou ao carregar (ex.: sem VRAM) sai do revezamento.
  active = active.filter((_, n) => results[n].status === "fulfilled");
}

/**
 * Pedido unico (sem stream) ao modelo, para gerar um JSON no formato `format`.
 * `options` sobrescreve as opcoes do chat (so campos que nao recarregam o modelo, como temperature).
 */
export async function generateJson({ messages, format, options, signal }) {
  const { res, release } = await post("/api/chat", chatBody({ messages, format, stream: false, options: { ...cfg.options, ...options } }), signal);
  try {
    const data = await res.json();
    return data.message?.content ?? "";
  } finally {
    release();
  }
}

/**
 * POST /api/chat em stream. `onText(textoAcumulado)` e chamado a cada pedaco;
 * se retornar false, a geracao e interrompida (o Ollama para ao perder a conexao).
 * Retorna { content, stats } (stats = ultimo pedaco, com contagem de tokens e tempos).
 */
export async function chatStream({ messages, format, onText, signal }) {
  const { res, release } = await post("/api/chat", chatBody({ messages, format, stream: true }), signal);
  try {
    return await readStream(res, onText);
  } finally {
    release();
  }
}

async function readStream(res, onText) {
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let content = "";
  let stats = null;

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const chunk = JSON.parse(line);
      if (chunk.error) throw new Error(chunk.error);
      if (chunk.done) stats = chunk;
      if (chunk.message?.content) {
        content += chunk.message.content;
        if (onText?.(content) === false) {
          await reader.cancel();
          return { content, stats };
        }
      }
    }
  }
  return { content, stats };
}
