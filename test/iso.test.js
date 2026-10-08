import { test } from "node:test";
import assert from "node:assert/strict";
import { game } from "../config/index.js";
import { NavGrid } from "../game/NavGrid.js";
import { inset, quadrants } from "../game/field.js";
import {
  STANDING_DEPTH,
  cubeFaces,
  depthAt,
  fieldCorners,
  gridCells,
  gridSegments,
  platformFaces,
  quadrantSegments,
  rectToScreen,
  screenBounds,
  screenDir,
  toGround,
  toScreen,
} from "../game/iso.js";

const cfg = { scale: 0.7071, zScale: 1, thickness: 28 };
const field = { x: 0, y: 0, width: 960, height: 640, gridCell: 64 };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/** Ponto dentro do poligono convexo (pontos em qualquer sentido), bordas incluidas. */
function insideConvex(points, p) {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-6) continue;
    const s = Math.sign(cross);
    if (sign && s !== sign) return false;
    sign = s;
  }
  return true;
}

test("toScreen/toGround: ida e volta devolve o ponto do chao", () => {
  for (const p of [{ x: 0, y: 0 }, { x: 960, y: 0 }, { x: 123.4, y: 567.8 }, { x: -50, y: 20 }]) {
    const s = toScreen(p, cfg);
    const g = toGround(s.x, s.y, cfg);
    assert.ok(near(g.x, p.x) && near(g.y, p.y), JSON.stringify({ p, g }));
  }
});

test("z > 0 sobe na tela e nao muda o x", () => {
  const ground = toScreen({ x: 100, y: 200 }, cfg);
  const up = toScreen({ x: 100, y: 200, z: 30 }, cfg);
  assert.equal(up.x, ground.x);
  assert.ok(near(ground.y - up.y, 30 * cfg.zScale));
});

test("cantos do campo: topo, direita, baixo e esquerda do losango", () => {
  const { top, right, bottom, left } = fieldCorners(field, cfg);
  assert.deepEqual(top, toScreen({ x: 0, y: 0 }, cfg));
  assert.ok(top.y < left.y && top.y < right.y && top.y < bottom.y, "topo e o mais alto");
  assert.ok(bottom.y > left.y && bottom.y > right.y, "baixo e o mais baixo");
  assert.ok(left.x < top.x && left.x < bottom.x, "esquerda e o mais a esquerda");
  assert.ok(right.x > top.x && right.x > bottom.x, "direita e o mais a direita");
});

test("centros dos quadrantes: A no topo, B a direita, C a esquerda, D embaixo", () => {
  const s = Object.fromEntries(quadrants(field).map((q) => [q.id, toScreen(q.center, cfg)]));
  const ys = Object.values(s).map((p) => p.y);
  const xs = Object.values(s).map((p) => p.x);
  assert.equal(s.A.y, Math.min(...ys));
  assert.equal(s.D.y, Math.max(...ys));
  assert.equal(s.C.x, Math.min(...xs));
  assert.equal(s.B.x, Math.max(...xs));
});

test("rotulos do config descrevem o que se ve na tela", () => {
  assert.deepEqual(game.field.labels, { A: "no topo", B: "à direita", C: "à esquerda", D: "embaixo" });
});

test("depthAt cresce com x + y e fica acima do chao", () => {
  assert.ok(depthAt(0, 0) >= STANDING_DEPTH);
  assert.ok(depthAt(10, 10) > depthAt(5, 5));
  assert.ok(depthAt(0, 100) > depthAt(99, 0));
  assert.equal(depthAt(30, 70), depthAt(70, 30));
  assert.ok(depthAt(field.width, field.height) < STANDING_DEPTH + 1, "o campo inteiro cabe numa fracao");
});

test("screenDir: eixo dominante do deslocamento projetado na tela", () => {
  assert.equal(screenDir(10, 10, cfg), "down");
  assert.equal(screenDir(-10, -10, cfg), "up");
  assert.equal(screenDir(10, -10, cfg), "right");
  assert.equal(screenDir(-10, 10, cfg), "left");
  // Ao longo de um eixo do chao, a tela anda 2x mais na horizontal que na vertical.
  assert.equal(screenDir(10, 0, cfg), "right");
  assert.equal(screenDir(0, 10, cfg), "left");
  assert.equal(screenDir(-10, 0, cfg), "left");
  assert.equal(screenDir(0, -10, cfg), "right");
});

test("screenBounds contem os 4 cantos e a espessura das laterais", () => {
  const b = screenBounds(field, cfg);
  const inside = (p) => p.x >= b.x - 1e-6 && p.x <= b.x + b.width + 1e-6 && p.y >= b.y - 1e-6 && p.y <= b.y + b.height + 1e-6;
  const corners = Object.values(fieldCorners(field, cfg));
  for (const p of corners) assert.ok(inside(p), JSON.stringify(p));
  for (const face of platformFaces(field, cfg)) for (const p of face.points) assert.ok(inside(p));
  assert.ok(near(b.y + b.height, fieldCorners(field, cfg).bottom.y + cfg.thickness));
});

test("gridSegments: uma linha por coluna e por linha de celulas, todas dentro do campo", () => {
  const segs = gridSegments(field, 64);
  const cols = field.width / 64;
  const rows = field.height / 64;
  assert.equal(segs.length, cols + 1 + (rows + 1));
  const inField = (p) => p.x >= 0 && p.x <= field.width && p.y >= 0 && p.y <= field.height;
  for (const s of segs) assert.ok(inField(s.from) && inField(s.to));
  assert.equal(gridCells(field, 64).length, cols * rows);
  // Tamanho que nao divide o campo: a ultima celula fica menor, mas a borda continua la.
  const odd = gridSegments({ x: 0, y: 0, width: 100, height: 64 }, 64);
  assert.ok(odd.some((s) => s.from.x === 100 && s.to.x === 100));
});

test("quadrantSegments: as 4 bordas e as 2 linhas do meio", () => {
  const segs = quadrantSegments(field);
  assert.equal(segs.length, 6);
  assert.ok(segs.some((s) => s.from.x === 480 && s.to.x === 480 && s.from.y === 0 && s.to.y === 640));
  assert.ok(segs.some((s) => s.from.y === 320 && s.to.y === 320 && s.from.x === 0 && s.to.x === 960));
});

test("platformFaces: 2 laterais de 4 pontos, descendo `thickness`", () => {
  const faces = platformFaces(field, cfg);
  assert.deepEqual(faces.map((f) => f.side), ["left", "right"]);
  const { right, bottom, left } = fieldCorners(field, cfg);
  for (const { points } of faces) {
    assert.equal(points.length, 4);
    assert.ok(near(points[3].y - points[0].y, cfg.thickness));
    assert.ok(near(points[2].y - points[1].y, cfg.thickness));
  }
  assert.deepEqual(faces[0].points.slice(0, 2), [left, bottom]);
  assert.deepEqual(faces[1].points.slice(0, 2), [bottom, right]);
});

test("caminho da NavGrid num quadrante, projetado, fica dentro do losango desse quadrante", () => {
  const grid = new NavGrid({ rects: [], bounds: field, cell: 20, body: { width: 24, height: 19.2 } });
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (const q of quadrants(field)) {
    const home = inset(q, 40);
    const diamond = rectToScreen(q, 0, cfg);
    let from = grid.randomWalkableIn(home, rng);
    for (let i = 0; i < 10; i++) {
      const to = grid.randomWalkableIn(home, rng);
      const path = grid.findPath(from, to);
      assert.ok(path, `caminho em ${q.id}`);
      for (const p of [from, ...path]) assert.ok(insideConvex(diamond, toScreen(p, cfg)), `${q.id}: ${JSON.stringify(p)}`);
      from = path.at(-1);
    }
  }
});

test("cubeFaces: topo e duas laterais que encostam no losango do chao", () => {
  const size = 32;
  const height = 30;
  const { top, left, right } = cubeFaces(size, height, cfg);
  for (const face of [top, left, right]) assert.equal(face.length, 4);
  // O topo fica acima (y menor) das laterais.
  const maxTop = Math.max(...top.map((p) => p.y));
  assert.ok(maxTop <= Math.min(...left.map((p) => p.y)) + height + 1e-6);
  assert.ok(Math.min(...top.map((p) => p.y)) < Math.min(...left.map((p) => p.y)));
  // Cada lateral tem largura size·scale.
  const width = (pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
  assert.ok(near(width(left), size * cfg.scale));
  assert.ok(near(width(right), size * cfg.scale));
  assert.ok(near(width(top), 2 * size * cfg.scale));
  // A base das laterais coincide com o losango do chao (esquerda -> baixo -> direita).
  const [, r0, b0, l0] = rectToScreen({ x: -16, y: -16, width: 32, height: 32 }, 0, cfg);
  assert.deepEqual([left[3], left[2]], [l0, b0]);
  assert.deepEqual([right[3], right[2]], [b0, r0]);
  // Laterais verticais com a altura do cubo.
  assert.ok(near(left[3].y - left[0].y, height * cfg.zScale));
});

test("config: projecao e bloco com as chaves novas", () => {
  for (const k of ["scale", "zScale", "thickness"]) assert.equal(typeof game.iso[k], "number", k);
  for (const k of ["topColor", "leftColor", "rightColor", "borderColor"]) assert.match(game.block[k], /^#[0-9a-f]{6}$/i, k);
  assert.ok(game.block.size > 0 && game.block.height > 0 && game.block.carryHeight > game.block.height);
  assert.equal(typeof game.block.standOffset.x, "number");
  assert.equal(typeof game.block.standOffset.y, "number");
  assert.equal(game.field.width % game.field.gridCell, 0);
  assert.equal(game.field.height % game.field.gridCell, 0);
});
