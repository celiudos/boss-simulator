// HUD em DOM puro, reproduzindo o layout do Agent Town:
// topo: logo | pills dos personagens | botoes de ferramentas
// base: pills de status (esq.) + dock de chat (dir.)
//
// O chat conversa com o personagem escolhido (clique nele no campo ou na pill do topo) usando o
// modelo local do Ollama (game/conversation.js). A cena avisa o HUD por eventos (game/events.js).
import { game, characters } from "../config/index.js";
import { FRAME_HEIGHT, FRAME_WIDTH, PORTRAIT_FRAME_INDEX, SHEET_COLUMNS } from "./constants.js";
import { gameEvents } from "./events.js";
import { conversationFor } from "./conversation.js";
import { baseUrl, checkOllama, viaLanProxy, warmUp } from "./ollama.js";
import { QUADRANT_IDS } from "./field.js";
import { summarize } from "./layout.js";
import { personas } from "./personas.js";
import { describeResult, describeTask } from "./prompt.js";
import { World } from "./world.js";

const BGM_SRC = game.audio.bgm;
const DEFAULT_BGM_VOLUME = game.audio.defaultVolume;
const LS_BGM_VOLUME = game.audio.storageKey;

export const ICON = "/public/ui/icons";
export const MODEL = game.ollama.model;
const MAX_QUESTION = game.chat.maxQuestionChars;

const TOOLS = [
  { id: "music", label: "Music", icon: "icon-music", active: "icon-music-active" },
  { id: "connection", label: "Ollama", icon: "icon-connection", active: "icon-connection-active" },
  { id: "orders", label: "Ordens", icon: "icon-tasks", active: "icon-tasks-active" },
  { id: "workers", label: "Equipe", icon: "icon-workers", active: "icon-workers-active" },
];

/** Status da conexao com o Ollama: cor do ponto e texto da pill. */
export const OLLAMA_STATUS = {
  checking: { dot: "gray", label: "Ollama..." },
  loading: { dot: "yellow", label: "Loading model" },
  online: { dot: "green", label: "Online" },
  missing: { dot: "yellow", label: "No model" },
  offline: { dot: "red", label: "Offline" },
};

/** Status de cada personagem no HUD: classe de cor e texto. */
const CHARACTER_STATUS = {
  idle: { cls: "idle", label: "à toa" },
  thinking: { cls: "running", label: "pensando" },
  carrying: { cls: "done", label: "trabalhando" },
};

/** Estado do campo antes da cena avisar (ou sem ela): os blocos soltos no quadrante inicial e ninguem trabalhando. */
const EMPTY_WORLD = new World().snapshot();

const SVG_ATTRS =
  'width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
export const ICON_SPARKLES = `<svg ${SVG_ATTRS}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>`;

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const spritePath = (c) => `/public/characters/Premade_Character_48x48_${c.sprite}.png`;

// Retrato: recorta o 1o frame "idle-down" da sheet do personagem.
export function portrait(spritePath, scale = 1.1) {
  const fx = (PORTRAIT_FRAME_INDEX % SHEET_COLUMNS) * FRAME_WIDTH;
  const fy = Math.floor(PORTRAIT_FRAME_INDEX / SHEET_COLUMNS) * FRAME_HEIGHT;
  const w = FRAME_WIDTH * scale;
  const h = FRAME_HEIGHT * scale;
  // A sheet tem 2688px de largura (56 colunas x 48px).
  const sheetW = SHEET_COLUMNS * FRAME_WIDTH * scale;
  return `<div class="portrait" role="img" style="width:${w}px;height:${h}px;margin-top:-${h * 0.42}px;background-image:url('${esc(spritePath)}');background-size:${sheetW}px auto;background-position:-${fx * scale}px -${fy * scale}px"></div>`;
}

/** Mensagem amigavel para erros da chamada ao Ollama. */
export function errorMessage(err) {
  if (err instanceof TypeError) {
    if (viaLanProxy) {
      return `Sem conexão com o Ollama em ${baseUrl}. Confira se o "npm start" está rodando na máquina do jogo e tente de novo.`;
    }
    return `Sem conexão com o Ollama em ${baseUrl}. Abra o Ollama (ou rode "ollama serve") e tente de novo.`;
  }
  if (/not found/i.test(err.message)) return `Modelo ${MODEL} não encontrado. Rode "ollama pull ${MODEL}".`;
  return `Erro do Ollama: ${err.message}`;
}

// ── BGM ───────────────────────────────────────────────────
export function createBgm() {
  const clamp = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_BGM_VOLUME);
  const stored = localStorage.getItem(LS_BGM_VOLUME);
  let volume = clamp(stored === null ? DEFAULT_BGM_VOLUME : Number(stored));

  const audio = new Audio(BGM_SRC);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = volume;

  const tryPlay = () => {
    if (volume > 0 && audio.paused) audio.play().catch(() => {});
  };
  tryPlay();
  // Navegadores bloqueiam autoplay: toca no primeiro gesto do usuario.
  const unlock = () => {
    tryPlay();
    if (!audio.paused) {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  return {
    get volume() {
      return volume;
    },
    setVolume(percent) {
      volume = clamp(percent / 100);
      localStorage.setItem(LS_BGM_VOLUME, String(volume));
      audio.volume = volume;
      if (volume > 0) tryPlay();
      else audio.pause();
    },
  };
}

// ── Flyouts ───────────────────────────────────────────────
export function flyout({ title, subtitle, headerAction = "", body, bodyClass = "" }) {
  return `
    <div class="hud-flyout">
      <div class="hud-flyout__header">
        <div class="hud-flyout__top-row">
          <span class="hud-flyout__title">${esc(title)}</span>
          ${headerAction}
        </div>
        ${subtitle ? `<div class="hud-flyout__subtitle">${esc(subtitle)}</div>` : ""}
      </div>
      <div class="hud-flyout__body ${bodyClass}">${body}</div>
    </div>`;
}

function statusTag(status) {
  const s = CHARACTER_STATUS[status] ?? CHARACTER_STATUS.idle;
  return `<span class="hud-status hud-status--${s.cls}">${esc(s.label)}</span>`;
}

function workersPanel(crew, statusOf) {
  const items = crew
    .map((member) => {
      const hint = personas.get(member.id)?.hint;
      return `
        <div class="hud-workers__item">
          <div class="hud-workers__top">${statusTag(statusOf(member.id))}<span>${esc(member.label)}</span></div>
          <div class="hud-workers__task">${esc(member.roleTitle ?? "Personagem")} &middot; ${member.gender === "female" ? "F" : "M"}</div>
          ${hint ? `<div class="hud-workers__hint">${esc(hint)}</div>` : ""}
        </div>`;
    })
    .join("");
  return flyout({
    title: "Equipe",
    subtitle: `${crew.length} personagens`,
    body: `<div class="hud-workers">${items || '<div class="hud-empty">Ninguém no campo</div>'}</div>`,
  });
}

/** "A: 0 · B: 0 · C: 3 · D: 7" (com a pilha mais alta quando passa de 1 bloco). */
function blocksLine(world) {
  const { quadrants } = summarize(world);
  return QUADRANT_IDS.map((id) => {
    const { count, tallest } = quadrants[id];
    return tallest > 1 ? `${id}: ${count} (pilha ${tallest})` : `${id}: ${count}`;
  }).join(" · ");
}

/**
 * Painel de ordens: blocos por quadrante, tarefas em andamento e o historico das tarefas encerradas
 * (da mais recente para a mais antiga).
 */
function ordersPanel(world) {
  const nameOf = (id) => characters.find((c) => c.id === id)?.name ?? id;
  const item = (tag, cls, who, text) => `
        <div class="hud-workers__item">
          <div class="hud-workers__top"><span class="hud-status hud-status--${cls}">${esc(tag)}</span><span>${esc(nameOf(who))}</span></div>
          <div class="hud-workers__task">${esc(text)}</div>
        </div>`;
  const running = world.jobs.map((j) => item("fazendo", "running", j.characterId, `Vai ${describeTask(j)} (${j.done} de ${j.quantity})`));
  const history = [...world.history]
    .reverse()
    .map((h) => {
      const text = `${nameOf(h.characterId)} ${describeResult(h)}`;
      return h.reason ? item("parou", "empty", h.characterId, `${text} (${h.reason})`) : item("feito", "done", h.characterId, text);
    });
  const body = [...running, ...history].join("");
  return flyout({
    title: "Ordens",
    subtitle: `Blocos: ${blocksLine(world)}`,
    body: `<div class="hud-workers">${body || '<div class="hud-empty">Nenhuma ordem cumprida ainda. Convença alguém pelo chat!</div>'}</div>`,
  });
}

export function musicPanel(bgm) {
  const pct = Math.round(bgm.volume * 100);
  return `
    <div class="hud-music-bar">
      <span class="hud-music-bar__label">&#9834;</span>
      <input class="hud-music-bar__slider" id="bgm-slider" type="range" min="0" max="100" step="1" value="${pct}" aria-label="Music volume" />
      <span class="hud-music-bar__pct" id="bgm-pct">${pct}</span>
    </div>`;
}

export function connectionPanel(status, error) {
  const s = OLLAMA_STATUS[status];
  const help =
    status === "offline"
      ? `<div class="hud-panel__help">Abra o Ollama ou rode <code>ollama serve</code>.${error ? `<br><span class="hud-panel__error">${esc(error)}</span>` : ""}</div>`
      : status === "missing"
        ? `<div class="hud-panel__help">Baixe o modelo: <code>ollama pull ${esc(MODEL)}</code></div>`
        : status === "loading"
          ? '<div class="hud-panel__help">Carregando o modelo na memória (só na primeira vez)...</div>'
          : "";
  return flyout({
    title: "Ollama",
    subtitle: "IA local dos personagens",
    body: `
      <div class="hud-panel__stack">
        <div class="hud-panel__row"><span class="pixel-dot pixel-dot--${s.dot}"></span><span>${esc(s.label)}</span></div>
        <label class="hud-panel__label" for="conn-url">URL</label>
        <input id="conn-url" class="pixel-input hud-panel__input" value="${esc(baseUrl)}" readonly />
        <label class="hud-panel__label" for="conn-model">Model</label>
        <input id="conn-model" class="pixel-input hud-panel__input" value="${esc(MODEL)}" readonly />
        ${help}
        <button type="button" class="pixel-button pixel-button--primary" id="conn-retry" ${status === "checking" || status === "loading" ? "disabled" : ""}>Reconnect</button>
      </div>`,
  });
}

function chatPanelHtml(character) {
  return flyout({
    title: "Chat",
    subtitle: character ? `${character.name} · ${character.role}` : game.name,
    bodyClass: "hud-flyout__body--chat",
    body: `
      <div class="hud-chat-layout">
        <div class="hud-chat" id="chat-list"></div>
        <div class="hud-chat-quick" id="chat-quick" hidden></div>
        <div class="hud-chat-input-row">
          <div class="hud-chat-input-col">
            <textarea id="chat-input" class="pixel-input pixel-chat-input" rows="1" maxlength="${MAX_QUESTION}"></textarea>
            <span class="hud-chat__counter" id="chat-counter">0/${MAX_QUESTION}</span>
          </div>
          <button type="button" id="chat-send" class="pixel-icon-btn pixel-icon-btn--primary pixel-chat-icon-btn" title="Send">&#10148;</button>
        </div>
      </div>`,
  });
}

// Sem quebras de linha dentro da bolha: o texto usa white-space: pre-wrap.
function chatBubble(kind, role, text, extra = "") {
  return `<div class="hud-chat__bubble hud-chat__bubble--${kind}"><div class="hud-chat__header"><span class="hud-chat__role">${esc(role)}</span>${extra}</div>${text}</div>`;
}

/** Etiqueta curta da ordem na fala do personagem: "2 blocos → A", "torre ×5 → B", "parede ×10 → C". */
const ORDER_TAG = { levar_bloco: null, empilhar: "pilha", torre: "torre", parede: "parede" };
function orderTag({ action, quantity, destination }) {
  const what = ORDER_TAG[action] ? `${ORDER_TAG[action]} ×${quantity}` : `${quantity} ${quantity === 1 ? "bloco" : "blocos"}`;
  return `${what} → ${destination}`;
}

function chatMessagesHtml(character, streamingText, notice) {
  if (!character) {
    return '<div class="hud-chat__system">Clique em um personagem (no campo ou na barra do topo) para conversar.</div>';
  }
  const conv = conversationFor(character);
  const name = character.name.toUpperCase();
  const items = [];
  if (!conv.entries.length && streamingText === undefined) {
    items.push(`<div class="hud-chat__system">Você é o chefe. Converse com ${esc(character.name)} e tente convencer a pessoa a trabalhar com os blocos: levar para outro quadrante (A, B, C ou D), empilhar ou montar uma torre ou uma parede.</div>`);
  }
  items.push(
    ...conv.entries.map((e) => {
      if (e.role === "user") return chatBubble("user", "VOCE", esc(e.text));
      if (e.role === "system") return `<div class="hud-chat__system hud-chat__system--${e.kind === "order" ? "order" : "error"}">${esc(e.text)}</div>`;
      const tag = e.order ? `<span class="hud-chat__tag">${esc(orderTag(e.order))}</span>` : "";
      return chatBubble("agent", name, esc(e.text), tag);
    }),
  );
  if (streamingText !== undefined) {
    const body = streamingText
      ? `${esc(streamingText)}<span class="hud-chat__cursor"></span>`
      : '<span class="hud-chat__typing"><i></i><i></i><i></i></span>';
    items.push(chatBubble("agent", name, body));
  }
  if (notice) items.push(`<div class="hud-chat__system hud-chat__system--error">${esc(notice)}</div>`);
  return items.join("");
}

// ── Init ──────────────────────────────────────────────────
export function initHud() {
  const $ = (id) => document.getElementById(id);
  const pills = $("agent-pills");
  const tools = $("tool-buttons");
  const flyoutEl = $("topright-flyout");
  const chatPanel = $("chat-panel");
  const chatToggle = $("chat-toggle");
  const chatIcon = chatToggle.querySelector("img");
  const bottom = $("bottom-bar");

  const byId = new Map(characters.map((c) => [c.id, c]));
  const bgm = createBgm();
  const state = {
    /** Personagens em cena (evento "crew"): { id, label, gender, roleTitle, spritePath }. */
    crew: [],
    openPanel: null,
    /** id do personagem com quem o chat esta conversando. */
    chatWith: null,
    /** Respostas chegando em stream (id -> texto parcial). */
    streaming: new Map(),
    /** Aviso (erro) no fim do chat: { id, text } */
    notice: null,
    /** Chave de OLLAMA_STATUS. */
    ollama: "checking",
    ollamaError: "",
    /** Status por personagem (chave de CHARACTER_STATUS). */
    status: new Map(),
    /** Uso de contexto da ultima resposta: { used, total } */
    ctx: null,
    /** Estado dos blocos e tarefas (evento "world"): { blocks, jobs, history } (World.snapshot). */
    world: null,
  };
  const statusOf = (id) => {
    const status = state.status.get(id) ?? "idle";
    // Trabalhando com os blocos: o estado vem do campo (evento "world"), nao do chat.
    return status === "idle" && state.world?.jobs.some((j) => j.characterId === id) ? "carrying" : status;
  };

  function setStatus(id, status) {
    state.status.set(id, status);
    renderPills();
    renderBottom();
    if (state.openPanel === "workers") renderFlyout();
  }

  function setOllama(status, error = "") {
    state.ollama = status;
    state.ollamaError = error;
    renderBottom();
    if (state.openPanel === "connection") renderFlyout();
  }

  /** Verifica o Ollama e ja carrega o modelo, para a 1a resposta sair rapido. */
  async function connectOllama() {
    setOllama("checking");
    const { online, hasModel, error } = await checkOllama();
    if (!online) return setOllama("offline", error);
    if (!hasModel) return setOllama("missing");
    if (!game.ollama.warmUp) return setOllama("online");
    setOllama("loading");
    try {
      await warmUp();
      setOllama("online");
    } catch (err) {
      setOllama("offline", err.message);
    }
  }

  function renderTools() {
    tools.innerHTML = TOOLS.map((t) => {
      const active = state.openPanel === t.id;
      const icon = t.id === "music" && bgm.volume <= 0 ? "icon-music-muted" : active ? t.active : t.icon;
      return `<button type="button" class="topbar-tool-btn ${active ? "topbar-tool-btn--active" : ""}" data-tool="${t.id}" title="${t.label}">
        <img src="${ICON}/${icon}.png" alt="${t.label}" /></button>`;
    }).join("");
  }

  function renderPills() {
    const chatOpen = state.openPanel === "chat";
    pills.innerHTML = state.crew.length
      ? state.crew
          .map((m) => {
            const status = statusOf(m.id);
            return `<button type="button" class="topbar-agent-pill ${chatOpen && state.chatWith === m.id ? "topbar-agent-pill--active" : ""}" data-id="${esc(m.id)}" title="Conversar com ${esc(m.label)} - ${esc(CHARACTER_STATUS[status].label)}">
          <span class="topbar-agent-pill__avatar">${portrait(m.spritePath)}</span>
          <span class="topbar-agent-pill__name">${esc(m.label)}</span></button>`;
          })
          .join("")
      : '<span class="topbar-agent-pill__empty">Ninguém no campo</span>';
  }

  /** Texto da pill dos blocos: quantos ha em cada quadrante ("Blocos A0 B0 C3 D7"), mais os carregados. */
  function blockLabel() {
    const w = state.world;
    if (!w) return "Blocos: --";
    const { quadrants, carried } = summarize(w);
    const counts = QUADRANT_IDS.map((id) => `${id}${quadrants[id].count}`).join(" ");
    return `Blocos ${counts}${carried ? ` · ${carried} na mão` : ""}`;
  }

  function renderBottom() {
    const total = characters.length;
    const busy = characters.filter((c) => statusOf(c.id) !== "idle").length;
    const s = OLLAMA_STATUS[state.ollama];
    const pct = state.ctx ? Math.min(100, Math.round((state.ctx.used / state.ctx.total) * 100)) : 0;
    bottom.innerHTML = `
      <span class="hud-pill hud-pill--connection" title="Ollama"><span class="pixel-dot pixel-dot--${s.dot}"></span><span>${esc(s.label)}</span></span>
      <span class="hud-pill hud-pill--model">${ICON_SPARKLES}<span>${esc(MODEL)}</span></span>
      <span class="hud-pill hud-pill--metric hud-pill--block" title="Blocos em cada quadrante"><span>${esc(blockLabel())}</span></span>
      <span class="hud-pill hud-pill--metric"><span>${busy}/${total} busy</span></span>
      <span class="hud-meter-inline" title="Contexto usado na última resposta">
        <span class="hud-meter-inline__label">CTX</span>
        <span class="hud-meter-inline__bar"><span class="hud-meter__fill" style="display:block;width:${pct}%"></span></span>
        <span class="hud-meter-inline__value">${state.ctx ? `${pct}%` : "--"}</span>
      </span>`;
  }

  function renderFlyout() {
    const id = state.openPanel;
    if (!id || id === "chat") {
      flyoutEl.hidden = true;
      flyoutEl.innerHTML = "";
      return;
    }
    flyoutEl.innerHTML =
      id === "music"
        ? musicPanel(bgm)
        : id === "connection"
          ? connectionPanel(state.ollama, state.ollamaError)
          : id === "orders"
            ? ordersPanel(state.world ?? EMPTY_WORLD)
            : workersPanel(state.crew, statusOf);
    flyoutEl.hidden = false;

    const slider = $("bgm-slider");
    if (slider) {
      slider.addEventListener("input", () => {
        bgm.setVolume(Number(slider.value));
        $("bgm-pct").textContent = String(Math.round(bgm.volume * 100));
        renderTools();
      });
    }
    $("conn-retry")?.addEventListener("click", connectOllama);
  }

  // ── Chat ────────────────────────────────────────────────
  /** Estrutura do painel: so muda ao abrir/fechar ou trocar de personagem. */
  function renderChat() {
    const open = state.openPanel === "chat";
    chatToggle.classList.toggle("hud-chat-dock__btn--active", open);
    chatIcon.src = `${ICON}/${open ? "icon-chat-active" : "icon-chat"}.png`;
    chatPanel.hidden = !open;
    if (!open) {
      chatPanel.innerHTML = "";
      return;
    }
    chatPanel.innerHTML = chatPanelHtml(byId.get(state.chatWith));
    const input = $("chat-input");
    $("chat-send").addEventListener("click", () => sendChat());
    $("chat-quick").addEventListener("click", (e) => {
      const reply = game.chat.quickReplies.find((q) => q.id === e.target.closest("[data-quick]")?.dataset.quick);
      if (reply) sendChat(reply.text);
    });
    input.addEventListener("input", renderCounter);
    input.addEventListener("keydown", (e) => {
      // O Phaser escuta o teclado na janela; evita capturar teclas enquanto digita.
      e.stopPropagation();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChat();
      } else if (e.key === "Escape") {
        input.blur();
        state.openPanel = null;
        renderTools();
        renderPills();
        renderChat();
      }
    });
    renderChatMessages();
    renderChatInput();
  }

  function renderChatMessages() {
    const list = $("chat-list");
    if (!list) return;
    const character = byId.get(state.chatWith);
    const notice = state.notice?.id === state.chatWith ? state.notice.text : "";
    list.innerHTML = chatMessagesHtml(character, state.streaming.get(state.chatWith), notice);
    list.scrollTop = list.scrollHeight;
  }

  function renderCounter() {
    const input = $("chat-input");
    const counter = $("chat-counter");
    if (!input || !counter) return;
    counter.textContent = `${input.value.length}/${MAX_QUESTION}`;
    counter.classList.toggle("hud-chat__counter--full", input.value.length >= MAX_QUESTION);
  }

  /** Habilita a digitacao so quando ha alguem para responder. */
  function renderChatInput() {
    const input = $("chat-input");
    if (!input) return;
    const character = byId.get(state.chatWith);
    const conv = character && conversationFor(character);
    const blocked = !character || conv.pending;
    input.disabled = blocked;
    $("chat-send").disabled = blocked;
    // Respostas prontas: as com `always` ficam sempre; as demais so ate o chefe falar.
    const quick = $("chat-quick");
    const replies = !character ? [] : game.chat.quickReplies.filter((q) => q.always || conv.bossMessages === 0);
    quick.hidden = !replies.length;
    quick.innerHTML = replies
      .map((q) => `<button type="button" class="hud-chat-quick__btn" data-quick="${esc(q.id)}" ${conv.pending ? "disabled" : ""}>${esc(q.label)}</button>`)
      .join("");
    input.placeholder = !character ? "Ninguém selecionado" : conv.pending ? `${character.name} está pensando...` : `Fale com ${character.name}... (Enter envia)`;
    renderCounter();
  }

  async function sendChat(override) {
    const character = byId.get(state.chatWith);
    const input = $("chat-input");
    if (!character || !input) return;
    const conv = conversationFor(character);
    // `override`: texto de uma resposta pronta (os cliques passam o evento, que e ignorado).
    const fromQuick = typeof override === "string";
    const question = (fromQuick ? override : input.value).trim().slice(0, MAX_QUESTION);
    if (!question || conv.pending) return;

    const { id } = character;
    const reply = conv.send(
      question,
      (partial) => {
        state.streaming.set(id, partial.text);
        if (state.chatWith === id) renderChatMessages();
      },
      () => state.world ?? EMPTY_WORLD,
    );
    if (!fromQuick) input.value = "";
    state.notice = null;
    state.streaming.set(id, "");
    setStatus(id, "thinking");
    gameEvents.emit("character:thinking", { id, thinking: true });
    renderChatMessages();
    renderChatInput();

    try {
      const { text, order, stats } = await reply;
      if (stats) state.ctx = { used: (stats.prompt_eval_count ?? 0) + (stats.eval_count ?? 0), total: game.ollama.options.num_ctx };
      state.streaming.delete(id);
      setStatus(id, "idle");
      gameEvents.emit("character:reply", { id, text });
      // Ordem aceita e possivel: a cena executa a tarefa (e avisa o HUD pelo evento "world").
      if (order) gameEvents.emit("order:start", { id, order });
    } catch (err) {
      console.error("[chat]", err);
      state.streaming.delete(id);
      state.notice = { id, text: errorMessage(err) };
      setStatus(id, "idle");
      gameEvents.emit("character:thinking", { id, thinking: false });
      // Devolve a pergunta para o jogador tentar de novo.
      const current = $("chat-input");
      if (!fromQuick && state.chatWith === id && current && !current.value) current.value = question;
      if (err instanceof TypeError) connectOllama();
    }
    if (state.chatWith === id) {
      renderBottom();
      renderChatMessages();
      renderChatInput();
      $("chat-input")?.focus();
    }
  }

  function openChat(characterId) {
    if (!byId.has(characterId)) return;
    state.chatWith = characterId;
    state.openPanel = "chat";
    renderTools();
    renderPills();
    renderFlyout();
    renderChat();
    // Fora do evento que abriu o chat, para a tecla nao ser digitada no campo.
    setTimeout(() => $("chat-input")?.focus(), 0);
  }

  function renderAll() {
    renderTools();
    renderPills();
    renderBottom();
    renderFlyout();
    renderChat();
  }

  tools.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tool]");
    if (!btn) return;
    const id = btn.dataset.tool;
    state.openPanel = state.openPanel === id ? null : id;
    renderTools();
    renderPills();
    renderFlyout();
    renderChat();
  });

  chatToggle.addEventListener("click", () => {
    state.openPanel = state.openPanel === "chat" ? null : "chat";
    renderTools();
    renderPills();
    renderFlyout();
    renderChat();
    if (state.openPanel === "chat") $("chat-input")?.focus();
  });

  pills.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (btn) openChat(btn.dataset.id);
  });

  gameEvents.on("crew", (crew) => {
    state.crew = crew;
    renderPills();
    renderBottom();
    if (state.openPanel === "workers") renderFlyout();
  });
  gameEvents.on("chat:open", ({ characterId }) => openChat(characterId));
  gameEvents.on("world", (world) => {
    state.world = world;
    renderPills();
    renderBottom();
    if (state.openPanel === "orders" || state.openPanel === "workers") renderFlyout();
  });

  renderAll();
  connectOllama();
}
