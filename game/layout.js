// Onde os blocos ficam no campo e como as tarefas com eles sao planejadas.
//
// O chao e dividido em "casas" (celulas de block.cell px do chao, contadas a partir do canto do
// campo). Cada casa tem uma pilha: o bloco no chao fica no nivel 0, o de cima no 1, e assim por
// diante. Dentro de cada quadrante so valem as casas a `block.margin` px das linhas.
//
// O estado e um objeto simples (o mesmo de World.snapshot, ver game/world.js):
//   blocks: [{ id, col, row, level, quadrant, carrierId, reservedBy, built }]
//     no chao: col/row = casa e level = nivel da pilha; carregado: carrierId e col/row/level null
//     (quadrant fica o de onde saiu); reservedBy: quem esta indo busca-lo; built: faz parte de
//     uma estrutura montada (torre, parede ou pilha)
//   jobs: [{ characterId, action, origin, destination, quantity, done, cells, trip }]
//     cells: casas da estrutura (torre, parede ou pilha), reservadas enquanto a tarefa durar
//     trip: { blockId, to: { col, row, level }, picked } da viagem atual (ou null)
// Ninguem pega bloco de casa reservada, nem coloca bloco onde outro vai buscar: assim varios
// personagens trabalham ao mesmo tempo sem desmontar o que o outro esta montando.
//
// Modulo puro (sem Phaser): roda no navegador e nos testes (node --test).
import { game } from "../config/index.js";
import { QUADRANT_IDS, inset, quadrantById } from "./field.js";

/** Tarefas com os blocos (o "acao" do modelo, sem o "nenhuma"). */
export const BLOCK_ACTIONS = ["levar_bloco", "empilhar", "torre", "parede"];
/** Origem quando o chefe nao diz de onde pegar os blocos. */
export const ANY_ORIGIN = "qualquer";

const keyOf = ({ col, row }) => `${col},${row}`;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Viagem que pega um bloco de cima de uma pilha (estrutura) custa como andar isso a mais (em casas). */
const PILE_PENALTY_CELLS = 10;

/** Centro da casa (col, row) no chao (px logicos). */
export function cellCenter({ col, row }, field = game.field, cell = game.block.cell) {
  return { x: field.x + (col + 0.5) * cell, y: field.y + (row + 0.5) * cell };
}

/** Casa que contem o ponto (x, y) do chao. */
export function cellAt(x, y, field = game.field, cell = game.block.cell) {
  return { col: Math.floor((x - field.x) / cell), row: Math.floor((y - field.y) / cell) };
}

/**
 * Casas validas do quadrante `id`, da mais perto do centro para a mais longe:
 * [{ col, row, quadrant, center, d, loose }]. `loose` marca uma casa sim, outra nao (nas duas
 * direcoes): e onde ficam os blocos soltos, com espaco entre eles.
 */
export function quadrantCells(id, field = game.field, cfg = game.block) {
  const q = quadrantById(id, field);
  if (!q) return [];
  const { cell } = cfg;
  const area = inset(q, cfg.margin);
  const eps = 1e-9;
  const c0 = Math.ceil((area.x - field.x) / cell - eps);
  const c1 = Math.floor((area.x + area.width - field.x) / cell + eps) - 1;
  const r0 = Math.ceil((area.y - field.y) / cell - eps);
  const r1 = Math.floor((area.y + area.height - field.y) / cell + eps) - 1;
  // A grade dos soltos fica alinhada com a casa do centro (simetrica em volta dela).
  const mid = cellAt(q.center.x, q.center.y, field, cell);
  const cells = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const center = cellCenter({ col, row }, field, cell);
      const loose = (col - mid.col) % 2 === 0 && (row - mid.row) % 2 === 0;
      cells.push({ col, row, quadrant: id, center, d: dist(center, q.center), loose });
    }
  }
  // Empate na distancia (centro do quadrante na divisa entre casas): a casa de solto vem antes.
  return cells.sort((a, b) => a.d - b.d || b.loose - a.loose || a.row - b.row || a.col - b.col);
}

/** Todas as casas validas do campo (os 4 quadrantes). */
export function allCells(field = game.field, cfg = game.block) {
  return QUADRANT_IDS.flatMap((id) => quadrantCells(id, field, cfg));
}

/** Quantidade de blocos de uma ordem: inteiro de 1 ate o total; sem numero, 1 para levar e todos para o resto. */
export function normalizeQuantity(action, quantity, total = game.block.count) {
  const q = Number(quantity);
  if (Number.isInteger(q) && q >= 1) return Math.min(q, total);
  return action === "levar_bloco" ? 1 : total;
}

/** Indice das pilhas e das casas reservadas, montado a partir do estado. */
export function indexState(state) {
  const stacks = new Map();
  for (const b of state.blocks) {
    if (b.carrierId || b.col === null || b.col === undefined) continue;
    const k = keyOf(b);
    if (!stacks.has(k)) stacks.set(k, []);
    stacks.get(k).push(b);
  }
  for (const s of stacks.values()) s.sort((a, b) => a.level - b.level);
  /** casa -> id de quem a reservou (estrutura ou destino da viagem atual). */
  const reserved = new Map();
  for (const j of state.jobs) {
    for (const c of j.cells) reserved.set(keyOf(c), j.characterId);
    if (j.trip) reserved.set(keyOf(j.trip.to), j.characterId);
  }
  const height = (c) => stacks.get(keyOf(c))?.length ?? 0;
  const top = (c) => stacks.get(keyOf(c))?.at(-1) ?? null;
  /** A casa ou alguma das 8 vizinhas esta reservada (por outra pessoa que nao `except`)? */
  const nearReserved = (c, except = null) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const who = reserved.get(keyOf({ col: c.col + dc, row: c.row + dr }));
        if (who !== undefined && who !== except) return true;
      }
    }
    return false;
  };
  return { stacks, reserved, height, top, nearReserved };
}

/**
 * Blocos que a tarefa pode usar: no chao, sem ninguem indo busca-los, fora de casas reservadas
 * (de qualquer tarefa, inclusive as `cells` desta), da `origin` (se houver) e, para levar, fora do
 * destino. Sem origem, os blocos de estruturas ja montadas (`built`: torre, parede, pilha) ficam
 * onde estao: so sao desmontados se o chefe disser de qual quadrante pegar.
 * `topOnly`: so os que estao no alto da pilha (os que da para pegar agora).
 */
export function sourceBlocks(state, { action, origin = ANY_ORIGIN, destination, cells = [] }, { topOnly = false, index = indexState(state) } = {}) {
  const own = new Set(cells.map(keyOf));
  return state.blocks.filter((b) => {
    if (b.carrierId || b.reservedBy || b.col === null || b.col === undefined) return false;
    const k = keyOf(b);
    if (own.has(k) || index.reserved.has(k)) return false;
    if (origin === ANY_ORIGIN ? b.built : b.quadrant !== origin) return false;
    if (action === "levar_bloco" && b.quadrant === destination) return false;
    if (topOnly && b.level !== index.height(b) - 1) return false;
    return true;
  });
}

/** O que cada tarefa monta, para as mensagens: "uma torre", "uma parede", "a pilha". */
const STRUCTURE_NAME = { empilhar: "uma pilha", torre: "uma torre", parede: "uma parede" };

/**
 * Casas da estrutura de uma tarefa nova, no quadrante `destination`:
 *  - levar_bloco: nenhuma (cada bloco vai para uma casa solta escolhida na hora)
 *  - empilhar: a pilha mais alta do destino (sem ninguem mexendo nela); sem pilha, uma casa livre
 *  - torre: a casa livre mais perto do centro (longe das estruturas dos outros)
 *  - parede: `min(quantity, wallLength)` casas livres lado a lado (no eixo x do chao), o mais perto
 *    do centro possivel; o que passar do comprimento sobe em novas fileiras
 * Retorna { ok: true, cells: [{ col, row }] } ou { ok: false, reason }.
 */
export function planCells(state, { characterId = null, action, destination }, quantity, field = game.field, cfg = game.block) {
  if (action === "levar_bloco") return { ok: true, cells: [] };
  const index = indexState(state);
  const cells = quadrantCells(destination, field, cfg);
  const pick = ({ col, row }) => ({ col, row });
  const freeGround = (c) => index.height(c) === 0 && !index.nearReserved(c, characterId);
  const noRoom = { ok: false, reason: `Não há espaço livre no quadrante ${destination} para ${STRUCTURE_NAME[action]}.` };

  if (action === "empilhar") {
    const piles = cells
      .filter((c) => index.height(c) > 0 && !index.reserved.has(keyOf(c)) && !index.top(c).reservedBy)
      .sort((a, b) => index.height(b) - index.height(a) || a.d - b.d);
    if (piles.length) return { ok: true, cells: [pick(piles[0])] };
  }
  if (action === "empilhar" || action === "torre") {
    const spot = cells.find(freeGround);
    return spot ? { ok: true, cells: [pick(spot)] } : noRoom;
  }
  if (action !== "parede") return { ok: false, reason: `A tarefa "${action}" não existe.` };

  const length = Math.max(1, Math.min(quantity, cfg.wallLength));
  const byKey = new Map(cells.map((c) => [keyOf(c), c]));
  const center = quadrantById(destination, field).center;
  let best = null;
  for (const start of cells) {
    const run = [];
    for (let i = 0; i < length; i++) {
      const c = byKey.get(keyOf({ col: start.col + i, row: start.row }));
      if (!c || !freeGround(c)) break;
      run.push(c);
    }
    if (run.length < length) continue;
    const mid = { x: (run[0].center.x + run.at(-1).center.x) / 2, y: run[0].center.y };
    const d = dist(mid, center);
    if (!best || d < best.d - 1e-9) best = { run, d };
  }
  return best ? { ok: true, cells: best.run.map(pick) } : noRoom;
}

/**
 * Proxima viagem da tarefa `job`, saindo de `from` (pes de quem vai buscar, no chao):
 * { blockId, to: { col, row, level } }, ou null se ja acabou, se nao sobrou bloco ou nao ha onde por.
 *  - levar_bloco: a casa solta livre mais perto do centro do destino
 *  - estruturas: a casa da estrutura com a pilha mais baixa (a parede sobe fileira por fileira)
 * O bloco escolhido e o que deixa a viagem mais curta (ate ele e dele ate o destino), evitando
 * desmontar pilhas quando ha blocos soltos.
 */
export function nextTrip(state, job, from, field = game.field, cfg = game.block) {
  if (job.done >= job.quantity) return null;
  const index = indexState(state);
  let to = null;
  if (job.action === "levar_bloco") {
    const free = quadrantCells(job.destination, field, cfg).filter((c) => index.height(c) === 0 && !index.reserved.has(keyOf(c)));
    const spot = free.find((c) => c.loose && !index.nearReserved(c)) ?? free.find((c) => !index.nearReserved(c)) ?? free[0];
    if (spot) to = { col: spot.col, row: spot.row, level: 0 };
  } else {
    for (const c of job.cells) {
      const level = index.height(c);
      if (!to || level < to.level) to = { col: c.col, row: c.row, level };
    }
  }
  if (!to) return null;

  const target = cellCenter(to, field, cfg.cell);
  const candidates = sourceBlocks(state, job, { topOnly: true, index }).filter((b) => keyOf(b) !== keyOf(to));
  let best = null;
  for (const b of candidates) {
    const p = cellCenter(b, field, cfg.cell);
    const cost = dist(from, p) + dist(p, target) + (index.height(b) > 1 ? PILE_PENALTY_CELLS * cfg.cell : 0);
    if (!best || cost < best.cost) best = { b, cost };
  }
  return best ? { blockId: best.b.id, to } : null;
}

/**
 * Casa livre (sem bloco e sem reserva) mais perto do ponto (x, y) do chao, em qualquer quadrante:
 * onde cai o bloco quando uma viagem e interrompida. null se nao houver nenhuma.
 */
export function nearestFreeCell(state, x, y, field = game.field, cfg = game.block) {
  const index = indexState(state);
  let best = null;
  for (const c of allCells(field, cfg)) {
    if (index.height(c) > 0 || index.reserved.has(keyOf(c))) continue;
    const d = Math.hypot(c.center.x - x, c.center.y - y);
    if (!best || d < best.d) best = { col: c.col, row: c.row, quadrant: c.quadrant, d };
  }
  return best && { col: best.col, row: best.row, quadrant: best.quadrant };
}

/**
 * Resumo para o HUD e para o prompt: { quadrants: { A: { count, tallest } ... }, carried, total }.
 * `tallest` = altura da pilha mais alta do quadrante (0 sem blocos, 1 so com blocos soltos).
 */
export function summarize(state) {
  const quadrants = Object.fromEntries(QUADRANT_IDS.map((id) => [id, { count: 0, tallest: 0 }]));
  let carried = 0;
  for (const b of state.blocks) {
    if (b.carrierId) {
      carried++;
      continue;
    }
    const q = quadrants[b.quadrant];
    if (!q) continue;
    q.count++;
    q.tallest = Math.max(q.tallest, b.level + 1);
  }
  return { quadrants, carried, total: state.blocks.length };
}
