import { test } from "node:test";
import assert from "node:assert/strict";
import { game } from "../config/index.js";
import { NavGrid } from "../game/NavGrid.js";
import { inset, quadrants } from "../game/field.js";

const body = { width: 24, height: 19.2 };

/** Sala 240x240 com uma parede no meio (com passagem embaixo). */
function room() {
  return new NavGrid({
    rects: [{ x: 110, y: 0, width: 20, height: 190 }],
    bounds: { x: 0, y: 0, width: 240, height: 240 },
    cell: 24,
    body,
  });
}

/** Gerador pseudoaleatorio deterministico (0 <= n < 1). */
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

test("findPath contorna a parede e nao atravessa colisoes", () => {
  const g = room();
  const from = { x: 40, y: 40 };
  const to = { x: 200, y: 40 };
  const path = g.findPath(from, to);
  assert.ok(path && path.length >= 2, "precisa de pelo menos uma curva");
  assert.deepEqual(path.at(-1), to);
  let prev = from;
  for (const p of path) {
    assert.ok(g.lineFree(prev, p), `trecho livre ${JSON.stringify(prev)} -> ${JSON.stringify(p)}`);
    prev = p;
  }
  assert.ok(path.some((p) => p.y > 190), "passa por baixo da parede");
});

test("destino inalcancavel: vai ate o ponto alcancavel mais perto; grade sem espaco livre: null", () => {
  const g = new NavGrid({
    rects: [{ x: 110, y: 0, width: 20, height: 240 }],
    bounds: { x: 0, y: 0, width: 240, height: 240 },
    cell: 24,
    body,
  });
  // A parede divide a sala: so a maior regiao fica na grade, e o caminho para encostado na parede.
  const path = g.findPath({ x: 40, y: 40 }, { x: 200, y: 40 });
  assert.ok(path);
  assert.ok(path.at(-1).x < 110, "nao atravessa a parede");
  const full = new NavGrid({ rects: [{ x: 0, y: 0, width: 240, height: 240 }], bounds: { x: 0, y: 0, width: 240, height: 240 }, cell: 24, body });
  assert.equal(full.findPath({ x: 40, y: 40 }, { x: 200, y: 40 }), null);
});

test("ponto de partida dentro de um movel: sai pela celula livre mais proxima", () => {
  const g = room();
  const path = g.findPath({ x: 120, y: 60 }, { x: 40, y: 220 });
  assert.ok(path);
  assert.ok(g.isFree(path[0].x, path[0].y));
});

test("randomWalkableIn sorteia so dentro do retangulo e sem encostar em colisoes", () => {
  const g = room();
  const rect = { x: 130, y: 20, width: 100, height: 200 };
  const random = seeded(3);
  for (let i = 0; i < 100; i++) {
    const p = g.randomWalkableIn(rect, random);
    assert.ok(p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height, JSON.stringify(p));
    assert.ok(g.isFree(p.x, p.y));
  }
});

test("randomWalkableIn: retangulo sem celula livre cai na mais proxima do centro", () => {
  const g = room();
  const inWall = { x: 112, y: 40, width: 16, height: 100 };
  const p = g.randomWalkableIn(inWall, seeded(1));
  assert.ok(p && g.isFree(p.x, p.y));
});

test("campo do config: cada personagem passeia so no quadrante de casa e ha caminho entre quadrantes", () => {
  const f = game.field;
  const g = new NavGrid({
    rects: [],
    bounds: { x: f.x, y: f.y, width: f.width, height: f.height },
    cell: game.crew.navCell,
    body,
  });
  assert.equal(g.cols * game.crew.navCell, f.width, "largura do campo e multiplo da celula");
  assert.equal(g.rows * game.crew.navCell, f.height, "altura do campo e multipla da celula");

  const random = seeded(7);
  const quads = quadrants();
  for (const q of quads) {
    const home = inset(q, game.crew.homeInset);
    for (let i = 0; i < 100; i++) {
      const p = g.randomWalkableIn(home, random);
      assert.ok(p.x >= home.x && p.x <= home.x + home.width && p.y >= home.y && p.y <= home.y + home.height, `${q.id}: ${JSON.stringify(p)}`);
      // Uma caminhada entre dois pontos do mesmo quadrante nunca sai dele (reta dentro de um retangulo).
      const to = g.randomWalkableIn(home, random);
      for (const step of g.findPath(p, to)) {
        assert.ok(step.x >= q.x && step.x <= q.x + q.width && step.y >= q.y && step.y <= q.y + q.height);
      }
    }
  }
  for (const a of quads) {
    for (const b of quads) {
      assert.ok(g.findPath(g.nearestWalkable(a.center.x, a.center.y), g.nearestWalkable(b.center.x, b.center.y)), `${a.id} -> ${b.id}`);
    }
  }
});
