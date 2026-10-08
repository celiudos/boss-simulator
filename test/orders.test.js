import { test } from "node:test";
import assert from "node:assert/strict";
import { characters, game } from "../config/index.js";
import { resolveReply, validateOrder } from "../game/orders.js";
import { buildMessages, parseReply } from "../game/prompt.js";
import { World } from "../game/world.js";

const rita = characters.find((c) => c.id === "rita");
const juca = characters.find((c) => c.id === "juca");
/** Resposta do modelo (JSON) ja lida, como a conversa a recebe. */
const modelSays = (aceitou, acao, destino, { quantidade = 1, origem = "qualquer", fala = "Ok." } = {}) =>
  parseReply(JSON.stringify({ aceitou, acao, quantidade, origem, destino, fala }));
const order = (action, destination, quantity = 1, origin = "qualquer") => ({ action, quantity, origin, destination });

/** Executa todas as viagens da tarefa de `id` (sem cena: pega e coloca na hora). Retorna o historico. */
function runAll(world, id, from = { x: 0, y: 0 }) {
  while (world.beginTrip(id, from)) {
    assert.ok(world.pickUp(id), "pegou");
    assert.ok(world.place(id), "colocou");
  }
  return world.finishJob(id);
}

/** Pilhas por casa: "col,row" -> [niveis], para conferir que nao ha buracos nem dois blocos no mesmo lugar. */
function stacks(world) {
  const map = new Map();
  for (const b of world.blocks) {
    if (b.carrierId) continue;
    const k = `${b.col},${b.row}`;
    map.set(k, [...(map.get(k) ?? []), b.level].sort((a, z) => a - z));
  }
  return map;
}

function assertConsistent(world) {
  for (const [k, levels] of stacks(world)) assert.deepEqual(levels, levels.map((_, i) => i), `pilha ${k} sem buracos`);
}

test("mundo comeca com os blocos do config, soltos (um por casa) no quadrante inicial", () => {
  const w = new World();
  assert.equal(w.blocks.length, game.block.count);
  assert.equal(game.block.count, 10);
  for (const b of w.blocks) {
    assert.equal(b.quadrant, game.block.start);
    assert.equal(b.level, 0);
    assert.equal(b.carrierId, null);
  }
  assert.equal(stacks(w).size, game.block.count, "cada bloco numa casa");
  // Soltos: nenhum encosta no outro (casa sim, casa nao).
  for (const a of w.blocks) {
    for (const b of w.blocks) {
      if (a !== b) assert.ok(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) >= 2, "espaco entre os soltos");
    }
  }
  assert.deepEqual(w.snapshot().jobs, []);
  assert.deepEqual(w.snapshot().history, []);
});

test("o quadrante inicial dos blocos nao e a casa de ninguem", () => {
  assert.ok(!characters.some((c) => c.home === game.block.start));
});

test("ordem possivel: personagem, tarefa e destino validos", () => {
  const w = new World();
  for (const c of characters) {
    for (const action of ["levar_bloco", "empilhar", "torre", "parede"]) {
      for (const dest of ["A", "B", "C", "D"]) {
        if (action === "levar_bloco" && dest === "D") continue;
        const r = validateOrder(w, { characterId: c.id, ...order(action, dest, 3) });
        assert.equal(r.ok, true, `${c.id} ${action} ${dest}: ${r.reason}`);
        assert.equal(r.quantity, 3);
      }
    }
  }
});

test("recusas: personagem, tarefa, destino ou origem inexistentes", () => {
  const w = new World();
  assert.match(validateOrder(w, { characterId: "fulano", ...order("torre", "A") }).reason, /personagem não existe/);
  assert.match(validateOrder(w, { characterId: "bia", ...order("voar", "A") }).reason, /tarefa "voar" não existe/);
  for (const destination of ["E", "a", "", "AB", null, undefined, 3]) {
    const r = validateOrder(w, { characterId: "bia", ...order("torre", destination) });
    assert.equal(r.ok, false, String(destination));
    assert.match(r.reason, /não existe/);
  }
  assert.match(validateOrder(w, { characterId: "bia", ...order("torre", "Z") }).reason, /A, B, C, D/);
  assert.match(validateOrder(w, { characterId: "bia", ...order("torre", "A", 2, "X") }).reason, /origem "X" não existe/);
});

test("levar: recusa sem blocos fora do destino ou na origem pedida", () => {
  const w = new World({ start: "D" });
  assert.deepEqual(validateOrder(w, { characterId: "rita", ...order("levar_bloco", "D") }), {
    ok: false,
    reason: "Não há blocos soltos fora do quadrante D.",
  });
  assert.equal(validateOrder(w, { characterId: "rita", ...order("levar_bloco", "B", 1, "A") }).reason, "Não há blocos livres no quadrante A.");
  assert.match(validateOrder(w, { characterId: "rita", ...order("levar_bloco", "D", 1, "D") }).reason, /mesmo quadrante/);
});

test("quantidade: limitada aos blocos livres; sem numero, 1 para levar e todos para o resto", () => {
  const w = new World();
  const many = validateOrder(w, { characterId: "juca", ...order("torre", "A", 50) });
  assert.equal(many.ok, true);
  assert.equal(many.requested, game.block.count);
  assert.equal(many.quantity, game.block.count);
  assert.equal(validateOrder(w, { characterId: "juca", action: "levar_bloco", destination: "A" }).quantity, 1);
  assert.equal(validateOrder(w, { characterId: "juca", action: "parede", destination: "A", quantity: null }).quantity, game.block.count);
  assert.equal(validateOrder(w, { characterId: "juca", action: "torre", destination: "A", quantity: 0 }).quantity, game.block.count);

  // Com 3 blocos ocupados numa tarefa de outro personagem, so sobram 7 (o resto ja esta reservado).
  w.startJob("bia", order("torre", "A", 3));
  w.beginTrip("bia", { x: 0, y: 0 });
  const left = validateOrder(w, { characterId: "juca", ...order("parede", "C", 10) });
  assert.equal(left.ok, true);
  assert.equal(left.quantity, 9, "so o bloco reservado pela Bia fica de fora");
});

test("cada personagem faz uma tarefa por vez, citando o que ele ja esta fazendo", () => {
  const w = new World();
  assert.equal(w.startJob("juca", order("torre", "A", 4)).ok, true);
  const r = validateOrder(w, { characterId: "juca", ...order("levar_bloco", "B") });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "Juca já está ocupado: vai montar uma torre de 4 blocos no quadrante A (no topo) (0 de 4).");
  assert.match(validateOrder(w, { characterId: "rita", ...order("parede", "C", 2) }).reason ?? "ok", /ok/, "outro personagem pode trabalhar junto");
  w.startJob("rita", order("parede", "C", 2));
  assert.match(validateOrder(w, { characterId: "rita", ...order("torre", "B") }).reason, /^Rita já está ocupada/);
});

test("torre: todos os blocos numa casa so, um em cima do outro", () => {
  const w = new World({ start: "D" });
  const started = w.startJob("juca", order("torre", "A", 5));
  assert.equal(started.ok, true);
  assert.equal(started.job.cells.length, 1);
  const entry = runAll(w, "juca");
  assert.equal(entry.done, 5);
  assert.equal(entry.reason, null);
  const tower = w.blocks.filter((b) => b.quadrant === "A");
  assert.equal(tower.length, 5);
  assert.equal(new Set(tower.map((b) => `${b.col},${b.row}`)).size, 1, "uma casa");
  assert.deepEqual(tower.map((b) => b.level).sort(), [0, 1, 2, 3, 4]);
  assert.equal(w.blocks.filter((b) => b.quadrant === "D").length, 5);
  assertConsistent(w);
});

test("parede: fileiras de ate wallLength blocos lado a lado, subindo camada por camada", () => {
  const w = new World({ start: "D" });
  const { job } = w.startJob("rita", order("parede", "C", 8));
  assert.equal(job.cells.length, game.block.wallLength);
  const row = job.cells[0].row;
  job.cells.forEach((c, i) => {
    assert.equal(c.row, row, "mesma fileira");
    assert.equal(c.col, job.cells[0].col + i, "casas vizinhas");
  });
  // Na metade: a 1a fileira inteira antes de comecar a 2a.
  for (let i = 0; i < game.block.wallLength; i++) {
    w.beginTrip("rita", { x: 0, y: 0 });
    w.pickUp("rita");
    assert.equal(w.place("rita").level, 0);
  }
  w.beginTrip("rita", { x: 0, y: 0 });
  w.pickUp("rita");
  assert.equal(w.place("rita").level, 1);
  const entry = runAll(w, "rita");
  assert.equal(entry.done, 8);
  const wall = w.blocks.filter((b) => b.quadrant === "C");
  assert.equal(wall.filter((b) => b.level === 0).length, 5);
  assert.equal(wall.filter((b) => b.level === 1).length, 3);
  assertConsistent(w);
});

test("parede curta: com poucos blocos, uma fileira so", () => {
  const w = new World();
  const { job } = w.startJob("rita", order("parede", "B", 3));
  assert.equal(job.cells.length, 3);
  runAll(w, "rita");
  assert.ok(w.blocks.filter((b) => b.quadrant === "B").every((b) => b.level === 0));
});

test("empilhar: os blocos do proprio quadrante vao para cima de uma pilha que ja existe la", () => {
  const w = new World({ start: "D" });
  const { job } = w.startJob("bia", order("empilhar", "D", 10, "D"));
  assert.equal(job.quantity, 9, "a pilha de baixo ja esta la: sobram 9 para empilhar");
  const entry = runAll(w, "bia");
  assert.equal(entry.done, 9);
  assert.equal(stacks(w).size, 1, "uma pilha so");
  assert.deepEqual([...stacks(w).values()][0], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test("empilhar sem pilha no destino: comeca uma nova, como uma torre; depois sobe na mesma", () => {
  const w = new World({ start: "D" });
  runAll(w, (w.startJob("juca", order("empilhar", "A", 2)), "juca"));
  runAll(w, (w.startJob("juca", order("empilhar", "A", 3)), "juca"));
  const inA = w.blocks.filter((b) => b.quadrant === "A");
  assert.equal(new Set(inA.map((b) => `${b.col},${b.row}`)).size, 1);
  assert.equal(Math.max(...inA.map((b) => b.level)), 4);
});

test("levar: blocos soltos no destino, sem encostar uns nos outros", () => {
  const w = new World({ start: "D" });
  w.startJob("bia", order("levar_bloco", "B", 4));
  assert.equal(runAll(w, "bia").done, 4);
  const inB = w.blocks.filter((b) => b.quadrant === "B");
  assert.equal(inB.length, 4);
  assert.ok(inB.every((b) => b.level === 0));
  for (const a of inB) for (const b of inB) if (a !== b) assert.ok(Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row)) >= 2);
  // Levar de volta pega dos que estao fora do destino.
  w.startJob("bia", order("levar_bloco", "D", 2, "B"));
  runAll(w, "bia");
  assert.equal(w.blocks.filter((b) => b.quadrant === "B").length, 2);
});

test("tarefas ao mesmo tempo nao mexem na estrutura do outro", () => {
  const w = new World({ start: "D" });
  w.startJob("juca", order("torre", "A", 4));
  w.startJob("rita", order("parede", "C", 4));
  w.startJob("bia", order("levar_bloco", "B", 2));
  // Viagens intercaladas, como na cena.
  let active = ["juca", "rita", "bia"];
  while (active.length) {
    active = active.filter((id) => {
      if (!w.beginTrip(id, { x: 480, y: 320 })) {
        w.finishJob(id);
        return false;
      }
      return true;
    });
    for (const id of active) assert.ok(w.pickUp(id), `${id} pegou`);
    for (const id of active) assert.ok(w.place(id), `${id} colocou`);
  }
  assert.deepEqual(w.history.map((h) => [h.characterId, h.done]).sort(), [["bia", 2], ["juca", 4], ["rita", 4]]);
  const towerA = w.blocks.filter((b) => b.quadrant === "A");
  assert.equal(new Set(towerA.map((b) => `${b.col},${b.row}`)).size, 1);
  assert.equal(towerA.length, 4);
  assert.equal(w.blocks.filter((b) => b.quadrant === "C").length, 4);
  assertConsistent(w);
});

test("sem blocos suficientes a tarefa para antes e registra o motivo", () => {
  const w = new World({ start: "D" });
  w.startJob("juca", order("torre", "A", 10));
  // Enquanto o Juca trabalha, a Rita leva 3 blocos (os que ele ainda nao pegou).
  w.beginTrip("juca", { x: 0, y: 0 });
  w.pickUp("juca");
  w.place("juca");
  w.startJob("rita", order("levar_bloco", "C", 3, "D"));
  runAll(w, "rita");
  const entry = runAll(w, "juca");
  assert.equal(entry.quantity, 10);
  assert.equal(entry.done, 10, "pegou os 3 da Rita no C tambem (origem qualquer)");

  const w2 = new World({ start: "D" });
  w2.startJob("juca", order("torre", "A", 10, "D"));
  w2.beginTrip("juca", { x: 0, y: 0 });
  w2.pickUp("juca");
  w2.place("juca");
  w2.startJob("rita", order("levar_bloco", "C", 3, "D"));
  runAll(w2, "rita");
  const partial = runAll(w2, "juca");
  assert.equal(partial.done, 7, "so do D: 10 - 3 que a Rita levou");
  assert.match(partial.reason, /não sobrou bloco/);
});

test("bloco reservado ou carregado nao e pego por outro", () => {
  const w = new World({ start: "D" });
  w.startJob("juca", order("levar_bloco", "A", 1));
  const trip = w.beginTrip("juca", { x: 0, y: 0 });
  w.startJob("bia", order("levar_bloco", "B", 10));
  const seen = new Set();
  while (true) {
    const t = w.beginTrip("bia", { x: 0, y: 0 });
    if (!t) break;
    seen.add(t.blockId);
    w.pickUp("bia");
    w.place("bia");
  }
  assert.ok(!seen.has(trip.blockId));
  assert.equal(seen.size, 9);
});

test("abortJob: bloco na mao cai numa casa livre perto; sem bloco, so libera a reserva", () => {
  const w = new World({ start: "D" });
  w.startJob("juca", order("torre", "A", 3));
  const t = w.beginTrip("juca", { x: 0, y: 0 });
  w.pickUp("juca");
  const { dropped, entry } = w.abortJob("juca", { x: 400, y: 400 });
  assert.equal(dropped.blockId, t.blockId);
  assert.equal(dropped.level, 0);
  assert.equal(w.blockById(t.blockId).carrierId, null);
  assert.equal(w.blockById(t.blockId).quadrant, "C", "(400, 400) fica no C");
  assert.equal(entry.done, 0);
  assert.equal(entry.reason, "a tarefa foi interrompida");
  assert.equal(w.busy("juca"), false);

  w.startJob("rita", order("torre", "B", 2));
  const t2 = w.beginTrip("rita", { x: 0, y: 0 });
  assert.equal(w.blockById(t2.blockId).reservedBy, "rita");
  assert.equal(w.abortJob("rita").dropped, null);
  assert.equal(w.blockById(t2.blockId).reservedBy, null);
  assertConsistent(w);
});

test("snapshot e uma copia: mexer nele nao altera o mundo", () => {
  const w = new World();
  w.startJob("juca", order("torre", "A", 2));
  w.beginTrip("juca", { x: 0, y: 0 });
  const snap = w.snapshot();
  snap.blocks[0].col = 999;
  snap.jobs[0].cells.push({ col: 1, row: 1 });
  snap.jobs[0].trip.to.level = 99;
  snap.history.push({});
  assert.notEqual(w.blocks[0].col, 999);
  assert.equal(w.jobs[0].cells.length, 1);
  assert.equal(w.jobs[0].trip.to.level, 0);
  assert.equal(w.history.length, 0);
});

test("resolveReply: aceitou + tarefa possivel -> executa e avisa no chat", () => {
  const w = new World().snapshot();
  const r = resolveReply(modelSays(true, "torre", "B", { quantidade: 4, fala: "Pode deixar, chefe!" }), w, rita);
  assert.deepEqual(r.order, { action: "torre", quantity: 4, origin: "qualquer", destination: "B" });
  assert.equal(r.rejected, null);
  assert.deepEqual(r.entries.map((e) => e.role), ["assistant", "system"]);
  assert.deepEqual(r.entries[0], { role: "assistant", text: "Pode deixar, chefe!", order: r.order });
  assert.equal(r.entries[1].kind, "order");
  assert.equal(r.entries[1].text, "Rita vai montar uma torre de 4 blocos no quadrante B (à direita).");

  const lev = resolveReply(modelSays(true, "levar_bloco", "A", { quantidade: 1, origem: "D" }), w, rita);
  assert.equal(lev.entries[1].text, "Rita vai levar 1 bloco do quadrante D para o quadrante A (no topo).");
});

test("resolveReply: pediu mais blocos do que ha livres -> faz com os que ha e avisa", () => {
  const w = new World();
  w.startJob("juca", order("levar_bloco", "A", 4));
  runAll(w, "juca");
  const r = resolveReply(modelSays(true, "parede", "C", { quantidade: 10, origem: "D" }), w.snapshot(), rita);
  assert.equal(r.order.quantity, 6);
  assert.equal(r.entries[1].text, "Rita vai montar uma parede de 6 blocos do quadrante D no quadrante C (à esquerda) (só há 6 blocos livres).");
});

test("resolveReply: aceitou mas e impossivel -> recusa com o motivo", () => {
  const w = new World({ start: "D" }).snapshot();
  const r = resolveReply(modelSays(true, "levar_bloco", "D", { fala: "Vou lá!" }), w, rita);
  assert.equal(r.order, null);
  assert.deepEqual(r.rejected, { reason: "Não há blocos soltos fora do quadrante D." });
  assert.deepEqual(r.entries[1], { role: "system", kind: "rejected", text: "Pedido não executado: Não há blocos soltos fora do quadrante D." });
});

test("sem origem, torres e paredes ficam de pe; com origem, podem ser desmontadas", () => {
  const w = new World({ start: "D" });
  w.startJob("juca", order("torre", "A", 10));
  runAll(w, "juca");
  assert.ok(w.blocks.every((b) => b.built && b.quadrant === "A"));

  const r = validateOrder(w, { characterId: "rita", ...order("parede", "C", 5) });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "Não há blocos soltos para isso. Os outros estão em estruturas: diga de qual quadrante pegar.");
  assert.match(validateOrder(w, { characterId: "rita", ...order("levar_bloco", "B") }).reason, /fora do quadrante B\. Os outros estão em estruturas/);

  // Pegando do A: desmonta a torre de cima para baixo e monta a parede.
  w.startJob("rita", order("parede", "C", 4, "A"));
  assert.equal(runAll(w, "rita").done, 4);
  const towerLevels = w.blocks.filter((b) => b.quadrant === "A").map((b) => b.level).sort((a, z) => a - z);
  assert.deepEqual(towerLevels, [0, 1, 2, 3, 4, 5]);
  // Levados soltos nao sao estrutura: podem ser usados de novo sem dizer a origem.
  w.startJob("bia", order("levar_bloco", "B", 2, "C"));
  runAll(w, "bia");
  assert.ok(w.blocks.filter((b) => b.quadrant === "B").every((b) => !b.built));
  assert.equal(validateOrder(w, { characterId: "bia", ...order("torre", "D", 5) }).quantity, 2);
  assertConsistent(w);
});

test("resolveReply: o proprio personagem ja ocupado -> recusa", () => {
  const w = new World();
  w.startJob("rita", order("torre", "A", 3));
  const r = resolveReply(modelSays(true, "parede", "B", { quantidade: 2 }), w.snapshot(), rita);
  assert.equal(r.order, null);
  assert.match(r.rejected.reason, /^Rita já está ocupada: vai montar uma torre de 3 blocos/);
});

test("resolveReply: sem aceitar, ou sem acao/destino validos, nao ha ordem nem aviso", () => {
  const w = new World().snapshot();
  for (const reply of [
    modelSays(false, "nenhuma", "nenhum", { fala: "Não vou." }),
    modelSays(false, "torre", "A", { fala: "Hmm, não sei." }),
    modelSays(true, "nenhuma", "A", { fala: "Estou convencida, mas..." }),
    modelSays(true, "parede", "nenhum", { fala: "Onde?" }),
    parseReply("Resposta em texto puro, sem JSON"),
  ]) {
    const r = resolveReply(reply, w, rita);
    assert.equal(r.order, null);
    assert.equal(r.rejected, null);
    assert.deepEqual(r.entries.map((e) => e.role), ["assistant"]);
    assert.equal(r.entries[0].order, null);
  }
});

test("historico guarda o resultado real: ordem recusada volta ao modelo como aceitou=false", () => {
  const w = new World({ start: "D" }).snapshot();
  const { entries } = resolveReply(modelSays(true, "levar_bloco", "D", { fala: "Vou lá!" }), w, rita);
  const sent = buildMessages("S", [{ role: "user", text: "leva pro D" }, ...entries, { role: "user", text: "e agora?" }]);
  assert.equal(sent.length, 4, "a linha de sistema nao vai para o modelo");
  assert.deepEqual(JSON.parse(sent[2].content), { aceitou: false, acao: "nenhuma", quantidade: 0, origem: "qualquer", destino: "nenhum", fala: "Vou lá!" });

  const ok = resolveReply(modelSays(true, "torre", "A", { quantidade: 30, fala: "Já vou!" }), w, rita);
  const sentOk = buildMessages("S", [{ role: "user", text: "torre no A" }, ...ok.entries]);
  assert.deepEqual(JSON.parse(sentOk[2].content), { aceitou: true, acao: "torre", quantidade: 10, origem: "qualquer", destino: "A", fala: "Já vou!" });
});

test("fluxo completo: resposta do modelo -> resolveReply -> World executa; outro pode trabalhar junto", () => {
  const w = new World({ start: "D" });
  const first = resolveReply(modelSays(true, "torre", "A", { quantidade: 5 }), w.snapshot(), rita);
  assert.ok(first.order);
  assert.equal(w.startJob(rita.id, first.order).ok, true);

  // Com a Rita trabalhando, o Juca pode montar uma parede com o resto.
  const second = resolveReply(modelSays(true, "parede", "B", { quantidade: 10 }), w.snapshot(), juca);
  assert.ok(second.order);
  assert.equal(second.order.quantity, 10, "os blocos da Rita ainda nao foram reservados");
  w.startJob(juca.id, second.order);
  runAll(w, rita.id);
  const wall = runAll(w, juca.id);
  assert.equal(wall.done, 5, "a Rita ja tinha usado 5");
  assert.ok(wall.reason);
  assertConsistent(w);
});
