import { test } from "node:test";
import assert from "node:assert/strict";
import { game } from "../config/index.js";
import { contains, inset, quadrantById, quadrantOf } from "../game/field.js";
import { depthAt } from "../game/iso.js";
import { allCells, cellAt, cellCenter, nearestFreeCell, normalizeQuantity, planCells, quadrantCells, summarize } from "../game/layout.js";
import { World } from "../game/world.js";

test("config: 10 blocos, casa do tamanho do bloco e campo divisivel pelas casas", () => {
  assert.equal(game.block.count, 10);
  assert.equal(game.block.cell, game.block.size, "blocos vizinhos encostam (paredes sem fresta)");
  assert.equal(game.field.width % game.block.cell, 0);
  assert.equal(game.field.height % game.block.cell, 0);
  assert.ok(game.block.wallLength >= 2);
});

test("cellCenter/cellAt: ida e volta", () => {
  for (const c of [{ col: 0, row: 0 }, { col: 7, row: 3 }, { col: 29, row: 19 }]) {
    const p = cellCenter(c);
    assert.deepEqual(cellAt(p.x, p.y), c);
  }
});

test("casas de cada quadrante: dentro do quadrante, longe das linhas, mais perto do centro primeiro", () => {
  const { cell, margin } = game.block;
  for (const id of ["A", "B", "C", "D"]) {
    const cells = quadrantCells(id);
    assert.ok(cells.length >= 40, `${id}: espaco de sobra`);
    const area = inset(quadrantById(id), margin);
    for (const c of cells) {
      assert.equal(quadrantOf(c.center.x, c.center.y), id);
      // A casa inteira fica dentro da area com folga.
      assert.ok(contains(area, c.center.x - cell / 2, c.center.y - cell / 2) && contains(area, c.center.x + cell / 2, c.center.y + cell / 2), `${id} ${c.col},${c.row}`);
    }
    for (let i = 1; i < cells.length; i++) assert.ok(cells[i].d >= cells[i - 1].d);
    assert.ok(cells[0].loose, "a casa do centro e de bloco solto");
    // Cabe uma parede inteira numa fileira.
    const cols = new Set(cells.filter((c) => c.row === cells[0].row).map((c) => c.col));
    assert.ok(cols.size >= game.block.wallLength);
  }
  assert.deepEqual(quadrantCells("Z"), []);
  assert.equal(allCells().length, ["A", "B", "C", "D"].reduce((n, id) => n + quadrantCells(id).length, 0));
});

test("normalizeQuantity: inteiro de 1 ao total; sem numero, 1 para levar e todos para o resto", () => {
  assert.equal(normalizeQuantity("torre", 3), 3);
  assert.equal(normalizeQuantity("torre", "4"), 4);
  assert.equal(normalizeQuantity("torre", 99), game.block.count);
  assert.equal(normalizeQuantity("levar_bloco", null), 1);
  assert.equal(normalizeQuantity("levar_bloco", 0), 1);
  assert.equal(normalizeQuantity("parede", 2.5), game.block.count);
  assert.equal(normalizeQuantity("empilhar", undefined, 6), 6);
});

test("planCells: torre perto do centro; duas torres no mesmo quadrante nao encostam", () => {
  const w = new World({ start: "D" });
  const a = planCells(w, { action: "torre", destination: "A" }, 5);
  assert.equal(a.ok, true);
  assert.deepEqual(a.cells, [{ col: quadrantCells("A")[0].col, row: quadrantCells("A")[0].row }]);
  w.startJob("juca", { action: "torre", quantity: 5, destination: "A" });
  const b = planCells(w, { characterId: "rita", action: "torre", destination: "A" }, 5);
  const [ca] = a.cells;
  const [cb] = b.cells;
  assert.ok(Math.max(Math.abs(ca.col - cb.col), Math.abs(ca.row - cb.row)) >= 2, "uma casa de folga");
});

test("planCells: parede numa fileira de casas livres; nao passa por cima de blocos", () => {
  const w = new World({ start: "D" });
  const { ok, cells } = planCells(w, { action: "parede", destination: "D" }, 10);
  assert.equal(ok, true);
  assert.equal(cells.length, game.block.wallLength);
  const taken = new Set(w.blocks.map((b) => `${b.col},${b.row}`));
  for (const c of cells) assert.ok(!taken.has(`${c.col},${c.row}`), "casa livre");
  assert.equal(new Set(cells.map((c) => c.row)).size, 1);
});

test("planCells: sem espaco, recusa com o motivo", () => {
  const field = { x: 0, y: 0, width: 256, height: 256, labels: { A: "a", B: "b", C: "c", D: "d" } };
  const cfg = { ...game.block, margin: 32 };
  // Quadrante de 128 px menos 32 de cada lado: 2x2 casas; uma parede de 3 nao cabe.
  assert.equal(quadrantCells("A", field, cfg).length, 4);
  const empty = { blocks: [], jobs: [] };
  const r = planCells(empty, { action: "parede", destination: "A" }, 3, field, cfg);
  assert.deepEqual(r, { ok: false, reason: "Não há espaço livre no quadrante A para uma parede." });
  assert.equal(planCells(empty, { action: "parede", destination: "A" }, 2, field, cfg).ok, true);
});

test("nearestFreeCell: casa sem bloco e sem reserva mais perto do ponto", () => {
  const w = new World({ start: "D" });
  const b = w.blocks[0];
  const p = cellCenter(b);
  const free = nearestFreeCell(w, p.x, p.y);
  assert.ok(free);
  assert.ok(!(free.col === b.col && free.row === b.row), "a casa ocupada nao vale");
  assert.ok(Math.max(Math.abs(free.col - b.col), Math.abs(free.row - b.row)) === 1, "a vizinha");
  assert.equal(free.quadrant, "D");
});

test("summarize: blocos por quadrante, pilha mais alta e carregados", () => {
  const w = new World({ start: "D" });
  assert.deepEqual(summarize(w).quadrants.D, { count: game.block.count, tallest: 1 });
  w.startJob("bia", { action: "torre", quantity: 3, destination: "B" });
  for (let i = 0; i < 3; i++) {
    w.beginTrip("bia", { x: 0, y: 0 });
    w.pickUp("bia");
    w.place("bia");
  }
  w.finishJob("bia");
  w.startJob("bia", { action: "levar_bloco", quantity: 1, destination: "C" });
  w.beginTrip("bia", { x: 0, y: 0 });
  w.pickUp("bia");
  const s = summarize(w);
  assert.deepEqual(s.quadrants.B, { count: 3, tallest: 3 });
  assert.deepEqual(s.quadrants.D, { count: game.block.count - 4, tallest: 1 });
  assert.equal(s.carried, 1);
  assert.equal(s.total, game.block.count);
});

test("profundidade: niveis da pilha cabem entre casas vizinhas (desenho na ordem certa)", () => {
  // Block.js soma ate count * LEVEL_DEPTH (1e-5) por nivel; a casa vizinha fica cell / 10000 a frente.
  const { cell, count } = game.block;
  const neighbor = depthAt(cell, 0) - depthAt(0, 0);
  assert.ok(count * 0.00001 < neighbor, "a pilha mais alta nao passa a frente da casa vizinha");
});
