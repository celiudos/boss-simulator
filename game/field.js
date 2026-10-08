// Geometria do campo: quatro quadrantes (config/game.js -> field).
//
//   A | B      A = cima, esquerda    B = cima, direita
//   --+--      C = baixo, esquerda   D = baixo, direita
//   C | D
//
// Modulo puro (sem Phaser): roda no navegador e nos testes (node --test).
import { game } from "../config/index.js";

/** Ids dos quadrantes, na ordem de leitura. */
export const QUADRANT_IDS = ["A", "B", "C", "D"];

const POSITION = { A: [0, 0], B: [1, 0], C: [0, 1], D: [1, 1] };

/**
 * Os quatro quadrantes: [{ id, label, col, row, x, y, width, height, center }], em px do mundo.
 * `label` descreve a posicao ("cima, à esquerda").
 */
export function quadrants(field = game.field) {
  const width = field.width / 2;
  const height = field.height / 2;
  return QUADRANT_IDS.map((id) => {
    const [col, row] = POSITION[id];
    const x = field.x + col * width;
    const y = field.y + row * height;
    return { id, label: field.labels?.[id] ?? "", col, row, x, y, width, height, center: { x: x + width / 2, y: y + height / 2 } };
  });
}

/** Quadrante `id` (ou null se nao existir). */
export function quadrantById(id, field = game.field) {
  return quadrants(field).find((q) => q.id === id) ?? null;
}

/**
 * Em qual quadrante esta o ponto (x, y)? null se estiver fora do campo.
 * Um ponto exatamente sobre a linha do meio conta para o quadrante da direita / de baixo.
 */
export function quadrantOf(x, y, field = game.field) {
  if (x < field.x || y < field.y || x > field.x + field.width || y > field.y + field.height) return null;
  const col = x >= field.x + field.width / 2 ? 1 : 0;
  const row = y >= field.y + field.height / 2 ? 1 : 0;
  return QUADRANT_IDS.find((id) => POSITION[id][0] === col && POSITION[id][1] === row);
}

/**
 * Encolhe o retangulo `n` px de cada lado. Se `n` for grande demais, sobra um retangulo vazio
 * (largura/altura 0) no centro.
 */
export function inset(rect, n) {
  const width = Math.max(0, rect.width - 2 * n);
  const height = Math.max(0, rect.height - 2 * n);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - height) / 2,
    width,
    height,
  };
}

/** O ponto esta dentro do retangulo (bordas incluidas)? */
export function contains(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
