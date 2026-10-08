// Projecao isometrica (2:1, estilo Age of Empires): ponte entre o CHAO e a TELA.
// Toda a logica do jogo (campo, grade de navegacao, ordens) usa px logicos do chao (x, y) e uma
// altura z; so o desenho projeta (config/game.js -> iso):
//
//   sx = (x - y)·scale          (x, y) = (0, 0) fica no topo do losango
//   sy = (x + y)·scale/2 - z·zScale
//
// No campo: o canto (x, y) do chao vai para o topo, (x+w, y) para a direita, (x, y+h) para a
// esquerda e (x+w, y+h) para baixo. Quem tem x + y maior esta mais "na frente" (desenhado por cima).
// Modulo puro (sem Phaser): roda no navegador e nos testes (node --test).
import { game } from "../config/index.js";

/** Profundidade de quem fica em pe no campo (personagens, bloco); o chao fica abaixo disso. */
export const STANDING_DEPTH = 11;
/** x + y por unidade de profundidade: o campo inteiro cabe numa fracao (< 1) acima de STANDING_DEPTH. */
const DEPTH_DIVISOR = 10000;

/** Ponto do chao (com altura z opcional) -> ponto da tela (px do mundo do Phaser). */
export function toScreen({ x, y, z = 0 }, cfg = game.iso) {
  return { x: (x - y) * cfg.scale, y: ((x + y) * cfg.scale) / 2 - z * cfg.zScale };
}

/** Ponto da tela -> ponto do chao (no plano z = 0). Inverso de toScreen. */
export function toGround(sx, sy, cfg = game.iso) {
  const sum = (2 * sy) / cfg.scale; // x + y
  const diff = sx / cfg.scale; // x - y
  return { x: (sum + diff) / 2, y: (sum - diff) / 2 };
}

/** Profundidade de quem esta em pe em (x, y) do chao: mais na frente (x + y maior) = por cima. */
export function depthAt(x, y) {
  return STANDING_DEPTH + (x + y) / DEPTH_DIVISOR;
}

/**
 * Direcao da animacao (right/left/up/down) para um deslocamento (dx, dy) no CHAO: projeta na tela
 * e usa o eixo dominante.
 */
export function screenDir(dx, dy, cfg = game.iso) {
  const sx = (dx - dy) * cfg.scale;
  const sy = ((dx + dy) * cfg.scale) / 2;
  if (Math.abs(sx) > Math.abs(sy)) return sx < 0 ? "left" : "right";
  return sy < 0 ? "up" : "down";
}

/** Cantos do campo na tela: { top, right, bottom, left } (no plano z = 0). */
export function fieldCorners(field = game.field, cfg = game.iso) {
  const { x, y, width: w, height: h } = field;
  return {
    top: toScreen({ x, y }, cfg),
    right: toScreen({ x: x + w, y }, cfg),
    bottom: toScreen({ x: x + w, y: y + h }, cfg),
    left: toScreen({ x, y: y + h }, cfg),
  };
}

/** Retangulo da tela { x, y, width, height } que contem o losango do campo e as laterais. */
export function screenBounds(field = game.field, cfg = game.iso) {
  const { top, right, bottom, left } = fieldCorners(field, cfg);
  return {
    x: left.x,
    y: top.y,
    width: right.x - left.x,
    height: bottom.y + cfg.thickness - top.y,
  };
}

/** Posicoes das linhas de `start` ate `start + length` a cada `cell` (sempre incluindo as pontas). */
function gridLines(start, length, cell) {
  const out = [];
  for (let d = 0; d < length; d += cell) out.push(start + d);
  out.push(start + length);
  return out;
}

/**
 * Linhas finas da grade, no CHAO: [{ from: {x, y}, to: {x, y} }]. Uma por coluna e uma por linha
 * de celulas, incluindo as bordas.
 */
export function gridSegments(field = game.field, cell = field.gridCell) {
  const { x, y, width: w, height: h } = field;
  const segments = [];
  for (const gx of gridLines(x, w, cell)) segments.push({ from: { x: gx, y }, to: { x: gx, y: y + h } });
  for (const gy of gridLines(y, h, cell)) segments.push({ from: { x, y: gy }, to: { x: x + w, y: gy } });
  return segments;
}

/** Celulas da grade no CHAO: [{ col, row, x, y, width, height }] (as da borda podem ser menores). */
export function gridCells(field = game.field, cell = field.gridCell) {
  const xs = gridLines(field.x, field.width, cell);
  const ys = gridLines(field.y, field.height, cell);
  const cells = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      cells.push({ col, row, x: xs[col], y: ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row] });
    }
  }
  return cells;
}

/** Linhas grossas, no CHAO: as 4 bordas do campo e as 2 divisoes do meio (entre os quadrantes). */
export function quadrantSegments(field = game.field) {
  const { x, y, width: w, height: h } = field;
  const midX = x + w / 2;
  const midY = y + h / 2;
  return [
    { from: { x, y }, to: { x: x + w, y } },
    { from: { x: x + w, y }, to: { x: x + w, y: y + h } },
    { from: { x: x + w, y: y + h }, to: { x, y: y + h } },
    { from: { x, y: y + h }, to: { x, y } },
    { from: { x: midX, y }, to: { x: midX, y: y + h } },
    { from: { x, y: midY }, to: { x: x + w, y: midY } },
  ];
}

/** Retangulo do chao -> losango na tela [topo, direita, baixo, esquerda], na altura z. */
export function rectToScreen(rect, z = 0, cfg = game.iso) {
  const { x, y, width: w, height: h } = rect;
  return [
    toScreen({ x, y, z }, cfg),
    toScreen({ x: x + w, y, z }, cfg),
    toScreen({ x: x + w, y: y + h, z }, cfg),
    toScreen({ x, y: y + h, z }, cfg),
  ];
}

/**
 * Laterais visiveis da plataforma, na TELA: a da frente-esquerda (aresta esquerda -> baixo, a dos
 * quadrantes C e D) e a da frente-direita (aresta baixo -> direita, a dos quadrantes D e B), cada uma
 * descendo `thickness` px. [{ side: "left" | "right", points: [4 pontos] }].
 */
export function platformFaces(field = game.field, cfg = game.iso) {
  const { right, bottom, left } = fieldCorners(field, cfg);
  const down = (p) => ({ x: p.x, y: p.y + cfg.thickness });
  return [
    { side: "left", points: [left, bottom, down(bottom), down(left)] },
    { side: "right", points: [bottom, right, down(right), down(bottom)] },
  ];
}

/**
 * Faces visiveis de um cubo de base `size` x `size` (px do chao) e altura `height` (z), na TELA,
 * relativas ao centro da base no chao: { top, left, right }, cada uma uma lista de pontos.
 * `top` e o losango de cima; `left`/`right` sao as faces da frente-esquerda e da frente-direita.
 */
export function cubeFaces(size, height, cfg = game.iso) {
  const half = size / 2;
  const base = { x: -half, y: -half, width: size, height: size };
  const [t0, r0, b0, l0] = rectToScreen(base, 0, cfg);
  const [t1, r1, b1, l1] = rectToScreen(base, height, cfg);
  return {
    top: [t1, r1, b1, l1],
    left: [l1, b1, b0, l0],
    right: [b1, r1, r0, b0],
  };
}
