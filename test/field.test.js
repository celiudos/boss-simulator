import { test } from "node:test";
import assert from "node:assert/strict";
import { characters, game } from "../config/index.js";
import { QUADRANT_IDS, contains, inset, quadrantById, quadrantOf, quadrants } from "../game/field.js";

const field = { x: 10, y: 20, width: 400, height: 200, labels: { A: "a", B: "b", C: "c", D: "d" } };

test("quatro quadrantes A-D em ordem de leitura, cobrindo o campo sem sobreposicao", () => {
  const qs = quadrants(field);
  assert.deepEqual(qs.map((q) => q.id), ["A", "B", "C", "D"]);
  assert.deepEqual(qs.map((q) => q.id), QUADRANT_IDS);
  const area = qs.reduce((sum, q) => sum + q.width * q.height, 0);
  assert.equal(area, field.width * field.height);
  // A cima-esquerda, B cima-direita, C baixo-esquerda, D baixo-direita.
  const [a, b, c, d] = qs;
  assert.deepEqual([a.x, a.y], [10, 20]);
  assert.deepEqual([b.x, b.y], [210, 20]);
  assert.deepEqual([c.x, c.y], [10, 120]);
  assert.deepEqual([d.x, d.y], [210, 120]);
  for (const q of qs) assert.deepEqual(q.center, { x: q.x + 100, y: q.y + 50 });
  // Nenhum par se sobrepoe (dentro do mesmo quadrante nao: so encosta nas linhas).
  for (const p of qs) {
    for (const o of qs) {
      if (p === o) continue;
      const overlapX = p.x < o.x + o.width && o.x < p.x + p.width;
      const overlapY = p.y < o.y + o.height && o.y < p.y + p.height;
      assert.ok(!(overlapX && overlapY), `${p.id} x ${o.id}`);
    }
  }
});

test("quadrantOf: centros, cantos, linhas e fora do campo", () => {
  for (const q of quadrants(field)) assert.equal(quadrantOf(q.center.x, q.center.y, field), q.id);
  assert.equal(quadrantOf(10, 20, field), "A");
  assert.equal(quadrantOf(409.9, 20, field), "B");
  assert.equal(quadrantOf(10, 219.9, field), "C");
  assert.equal(quadrantOf(410, 220, field), "D", "canto inferior direito ainda e do campo");
  // Sobre a linha do meio: vale o quadrante da direita / de baixo.
  assert.equal(quadrantOf(210, 50, field), "B");
  assert.equal(quadrantOf(50, 120, field), "C");
  assert.equal(quadrantOf(210, 120, field), "D");
  // Fora.
  assert.equal(quadrantOf(9.9, 50, field), null);
  assert.equal(quadrantOf(50, 19.9, field), null);
  assert.equal(quadrantOf(410.1, 50, field), null);
  assert.equal(quadrantOf(50, 220.1, field), null);
});

test("quadrantById e rotulos vindos do config", () => {
  assert.equal(quadrantById("D", field).x, 210);
  assert.equal(quadrantById("Z", field), null);
  assert.equal(quadrantById("B", field).label, "b");
  for (const id of QUADRANT_IDS) assert.ok(quadrantById(id).label.length > 0, `rotulo de ${id} no config`);
});

test("inset encolhe dos quatro lados e nunca fica negativo", () => {
  assert.deepEqual(inset({ x: 0, y: 0, width: 100, height: 60 }, 10), { x: 10, y: 10, width: 80, height: 40 });
  const tiny = inset({ x: 0, y: 0, width: 100, height: 60 }, 40);
  assert.equal(tiny.height, 0);
  assert.equal(tiny.y, 30, "fica no centro");
  assert.ok(tiny.width >= 0);
});

test("contains inclui as bordas", () => {
  const r = { x: 0, y: 0, width: 10, height: 10 };
  assert.ok(contains(r, 0, 0) && contains(r, 10, 10) && contains(r, 5, 5));
  assert.ok(!contains(r, 10.1, 5) && !contains(r, 5, -0.1));
});

test("config: os quadrantes de casa dos personagens existem e sao diferentes", () => {
  const homes = characters.map((c) => c.home);
  for (const h of homes) assert.ok(quadrantById(h), `casa ${h}`);
  assert.equal(new Set(homes).size, characters.length);
  // Sobra um quadrante livre (o bloco comeca la na Task 3).
  assert.equal(QUADRANT_IDS.filter((id) => !homes.includes(id)).length, QUADRANT_IDS.length - characters.length);
  // O recuo do passeio deixa area para andar em cada quadrante.
  for (const q of quadrants(game.field)) {
    const home = inset(q, game.crew.homeInset);
    assert.ok(home.width > 0 && home.height > 0, q.id);
  }
});
