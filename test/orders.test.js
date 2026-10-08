import { test } from "node:test";
import assert from "node:assert/strict";
import { characters, game } from "../config/index.js";
import { resolveReply, validateOrder } from "../game/orders.js";
import { buildMessages, parseReply } from "../game/prompt.js";
import { World } from "../game/world.js";

const idle = (blockQuadrant = "D") => ({ blockQuadrant, carrierId: null, destination: null });
const rita = characters.find((c) => c.id === "rita");
/** Resposta do modelo (JSON) ja lida, como a conversa a recebe. */
const modelSays = (aceitou, acao, destino, fala = "Ok.") => parseReply(JSON.stringify({ aceitou, acao, destino, fala }));

test("ordem possivel: personagem existente, destino valido e diferente de onde o bloco esta", () => {
  assert.deepEqual(validateOrder(idle("D"), { characterId: "juca", destination: "A" }), { ok: true });
  for (const c of characters) {
    for (const dest of ["A", "B", "C"]) assert.equal(validateOrder(idle("D"), { characterId: c.id, destination: dest }).ok, true);
  }
});

test("destino inexistente e recusado com o motivo", () => {
  for (const destination of ["E", "a", "", "AB", null, undefined, 3]) {
    const r = validateOrder(idle(), { characterId: "bia", destination });
    assert.equal(r.ok, false, String(destination));
    assert.match(r.reason, /não existe/);
  }
  assert.match(validateOrder(idle(), { characterId: "bia", destination: "Z" }).reason, /A, B, C, D/);
});

test("bloco ja no destino: recusa", () => {
  const r = validateOrder(idle("B"), { characterId: "rita", destination: "B" });
  assert.deepEqual(r, { ok: false, reason: "O bloco já está no quadrante B." });
});

test("alguem ja carregando: recusa, citando quem e para onde", () => {
  const busy = { blockQuadrant: "D", carrierId: "juca", destination: "A" };
  const r = validateOrder(busy, { characterId: "rita", destination: "B" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "Juca já está levando o bloco para o quadrante A.");
  // Sem destino conhecido, a frase continua correta.
  assert.equal(validateOrder({ ...busy, destination: null }, { characterId: "rita", destination: "B" }).reason, "Juca já está levando o bloco.");
  // O proprio carregador tambem nao pode receber outra ordem.
  assert.equal(validateOrder(busy, { characterId: "juca", destination: "C" }).ok, false);
});

test("personagem desconhecido: recusa", () => {
  const r = validateOrder(idle(), { characterId: "fulano", destination: "A" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /personagem não existe/);
});

test("ordem de checagem: destino invalido vence 'alguem carregando'", () => {
  const busy = { blockQuadrant: "D", carrierId: "bia", destination: "A" };
  assert.match(validateOrder(busy, { characterId: "rita", destination: "Z" }).reason, /não existe/);
});

test("mundo comeca com o bloco no quadrante do config e ninguem carregando", () => {
  const w = new World();
  assert.equal(w.blockQuadrant, game.block.start);
  assert.equal(w.busy, false);
  assert.deepEqual(w.snapshot(), { blockQuadrant: game.block.start, carrierId: null, destination: null, deliveries: [] });
  assert.equal(new World({ start: "B" }).blockQuadrant, "B");
});

test("o quadrante inicial do bloco nao e a casa de ninguem", () => {
  assert.ok(!characters.some((c) => c.home === game.block.start));
});

test("entrega: comeca, fica ocupado, termina e o bloco muda de quadrante", () => {
  let t = 1000;
  const w = new World({ start: "D", now: () => t++ });
  const started = w.startDelivery("juca", "A");
  assert.deepEqual(started, { ok: true, from: "D", to: "A" });
  assert.equal(w.busy, true);
  assert.deepEqual(w.snapshot(), { blockQuadrant: "D", carrierId: "juca", destination: "A", deliveries: [] }, "durante a entrega o bloco ainda esta na origem");

  const entry = w.finishDelivery();
  assert.deepEqual(entry, { characterId: "juca", from: "D", to: "A", at: 1000 });
  assert.equal(w.blockQuadrant, "A");
  assert.equal(w.busy, false);
  assert.deepEqual(w.deliveries, [entry]);
});

test("recusa durante uma entrega e nao mexe no estado", () => {
  const w = new World();
  w.startDelivery("juca", "A");
  const before = JSON.stringify(w.snapshot());
  const r = w.startDelivery("rita", "B");
  assert.equal(r.ok, false);
  assert.match(r.reason, /Juca já está levando/);
  assert.equal(JSON.stringify(w.snapshot()), before);
});

test("recusa destino igual ao atual, sem mudar nada", () => {
  const w = new World({ start: "D" });
  const r = w.startDelivery("bia", "D");
  assert.deepEqual(r, { ok: false, reason: "O bloco já está no quadrante D." });
  assert.equal(w.busy, false);
});

test("varias entregas seguidas entram no historico, na ordem", () => {
  const w = new World({ start: "D" });
  for (const [who, to] of [["juca", "A"], ["rita", "B"], ["bia", "C"]]) {
    assert.equal(w.startDelivery(who, to).ok, true);
    w.finishDelivery();
  }
  assert.deepEqual(w.deliveries.map((d) => [d.characterId, d.from, d.to]), [["juca", "D", "A"], ["rita", "A", "B"], ["bia", "B", "C"]]);
  assert.equal(w.blockQuadrant, "C");
  // Depois de entregue, pedir o mesmo destino de novo e recusado.
  assert.equal(w.startDelivery("juca", "C").ok, false);
});

test("finishDelivery sem entrega em andamento nao faz nada", () => {
  const w = new World();
  assert.equal(w.finishDelivery(), null);
  assert.deepEqual(w.deliveries, []);
});

test("abortDelivery: o bloco fica onde caiu (ou na origem) e nada entra no historico", () => {
  const w = new World({ start: "D" });
  w.startDelivery("juca", "A");
  w.abortDelivery("B");
  assert.equal(w.blockQuadrant, "B");
  assert.equal(w.busy, false);
  assert.deepEqual(w.deliveries, []);

  w.startDelivery("rita", "C");
  w.abortDelivery();
  assert.equal(w.blockQuadrant, "B", "sem 'where' o bloco fica na origem");
  assert.equal(w.startDelivery("bia", "C").ok, true, "libera para uma nova ordem");
});

test("snapshot e uma copia: mexer nele nao altera o mundo", () => {
  const w = new World();
  w.startDelivery("juca", "A");
  w.finishDelivery();
  const snap = w.snapshot();
  snap.deliveries[0].to = "Z";
  snap.deliveries.push({ x: 1 });
  snap.blockQuadrant = "Z";
  assert.equal(w.deliveries[0].to, "A");
  assert.equal(w.deliveries.length, 1);
  assert.equal(w.blockQuadrant, "A");
});

test("resolveReply: aceitou + ordem possivel -> executa e avisa no chat", () => {
  const r = resolveReply(modelSays(true, "levar_bloco", "B", "Pode deixar, chefe!"), idle("D"), rita);
  assert.deepEqual(r.order, { action: "levar_bloco", destination: "B" });
  assert.equal(r.rejected, null);
  assert.deepEqual(r.entries.map((e) => e.role), ["assistant", "system"]);
  assert.deepEqual(r.entries[0], { role: "assistant", text: "Pode deixar, chefe!", order: r.order });
  assert.equal(r.entries[1].kind, "order");
  assert.equal(r.entries[1].text, "Rita vai levar o bloco para o quadrante B (à direita).");
});

test("resolveReply: aceitou mas o bloco ja esta no destino -> recusa com o motivo", () => {
  const r = resolveReply(modelSays(true, "levar_bloco", "D", "Vou lá!"), idle("D"), rita);
  assert.equal(r.order, null);
  assert.deepEqual(r.rejected, { reason: "O bloco já está no quadrante D." });
  assert.deepEqual(r.entries.map((e) => e.role), ["assistant", "system"]);
  assert.equal(r.entries[0].order, null);
  assert.deepEqual(r.entries[1], { role: "system", kind: "rejected", text: "Pedido não executado: O bloco já está no quadrante D." });
});

test("resolveReply: aceitou mas outro personagem ja esta carregando -> recusa", () => {
  const busy = { blockQuadrant: "D", carrierId: "juca", destination: "A" };
  const r = resolveReply(modelSays(true, "levar_bloco", "B"), busy, rita);
  assert.equal(r.order, null);
  assert.equal(r.rejected.reason, "Juca já está levando o bloco para o quadrante A.");
});

test("resolveReply: sem aceitar, ou sem acao/destino validos, nao ha ordem nem aviso", () => {
  for (const reply of [
    modelSays(false, "nenhuma", "nenhum", "Não vou."),
    modelSays(false, "levar_bloco", "A", "Hmm, não sei."),
    modelSays(true, "nenhuma", "A", "Estou convencida, mas..."),
    modelSays(true, "levar_bloco", "nenhum", "Para onde?"),
    parseReply("Resposta em texto puro, sem JSON"),
  ]) {
    const r = resolveReply(reply, idle("D"), rita);
    assert.equal(r.order, null);
    assert.equal(r.rejected, null);
    assert.deepEqual(r.entries.map((e) => e.role), ["assistant"]);
    assert.equal(r.entries[0].order, null);
  }
});

test("historico guarda o resultado real: ordem recusada volta ao modelo como aceitou=false", () => {
  const { entries } = resolveReply(modelSays(true, "levar_bloco", "D", "Vou lá!"), idle("D"), rita);
  const sent = buildMessages("S", [{ role: "user", text: "leva pro D" }, ...entries, { role: "user", text: "e agora?" }]);
  assert.equal(sent.length, 4, "a linha de sistema nao vai para o modelo");
  assert.deepEqual(JSON.parse(sent[2].content), { aceitou: false, acao: "nenhuma", destino: "nenhum", fala: "Vou lá!" });

  const ok = resolveReply(modelSays(true, "levar_bloco", "A", "Já vou!"), idle("D"), rita);
  const sentOk = buildMessages("S", [{ role: "user", text: "leva pro A" }, ...ok.entries]);
  assert.deepEqual(JSON.parse(sentOk[2].content), { aceitou: true, acao: "levar_bloco", destino: "A", fala: "Já vou!" });
});

test("fluxo completo: resposta do modelo -> resolveReply -> World executa e bloqueia a proxima ordem", () => {
  const w = new World({ start: "D" });
  const first = resolveReply(modelSays(true, "levar_bloco", "A"), w.snapshot(), rita);
  assert.ok(first.order);
  assert.equal(w.startDelivery(rita.id, first.order.destination).ok, true);

  // Com a entrega em andamento, outro personagem aceitando a mesma tarefa e recusado pelo jogo.
  const juca = characters.find((c) => c.id === "juca");
  const second = resolveReply(modelSays(true, "levar_bloco", "B"), w.snapshot(), juca);
  assert.equal(second.order, null);
  assert.match(second.rejected.reason, /Rita já está levando o bloco para o quadrante A/);

  w.finishDelivery();
  // Depois da entrega, pedir o mesmo destino recusa; outro destino passa.
  assert.ok(resolveReply(modelSays(true, "levar_bloco", "A"), w.snapshot(), juca).rejected);
  assert.ok(resolveReply(modelSays(true, "levar_bloco", "B"), w.snapshot(), juca).order);
});
