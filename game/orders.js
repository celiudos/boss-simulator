// Regras das ordens do chefe. Quem decide se o personagem ACEITA e o modelo (pela persona); o codigo
// so confere se a tarefa e POSSIVEL no estado atual do campo.
// Modulo puro (sem Phaser/DOM): roda no navegador e nos testes (node --test).
import { characters, game } from "../config/index.js";
import { QUADRANT_IDS } from "./field.js";
import { ANY_ORIGIN, BLOCK_ACTIONS, normalizeQuantity, planCells, sourceBlocks } from "./layout.js";
import { describeTask, toOrder } from "./prompt.js";

const characterOf = (id) => characters.find((c) => c.id === id);
const fail = (reason) => ({ ok: false, reason });

/** Por que nao ha bloco para a tarefa (mensagem do chat). */
function noBlocksReason(world, { action, origin, destination }) {
  if (origin !== ANY_ORIGIN) return `Não há blocos livres no quadrante ${origin}.`;
  const base = action === "levar_bloco" ? `Não há blocos soltos fora do quadrante ${destination}.` : "Não há blocos soltos para isso.";
  // Sem origem, torres e paredes ficam de pe; da para desmonta-las dizendo de onde pegar.
  const inStructures = world.blocks.some((b) => b.built && !b.carrierId && (action !== "levar_bloco" || b.quadrant !== destination));
  return inStructures ? `${base} Os outros estão em estruturas: diga de qual quadrante pegar.` : base;
}

/**
 * A ordem "`characterId` faz `action` com `quantity` blocos (de `origin`) no quadrante `destination`"
 * e possivel agora? `world`: { blocks, jobs } (World ou World.snapshot, ver game/layout.js).
 * Retorna { ok: true, quantity, requested, cells } (quantity <= requested quando faltam blocos
 * livres; cells = casas da estrutura) ou { ok: false, reason } com o motivo em portugues.
 */
export function validateOrder(world, { characterId, action, quantity, origin = ANY_ORIGIN, destination } = {}) {
  const character = characterOf(characterId);
  if (!character) return fail("Esse personagem não existe.");
  if (!BLOCK_ACTIONS.includes(action)) return fail(`A tarefa "${action ?? ""}" não existe.`);
  if (!QUADRANT_IDS.includes(destination)) {
    return fail(`O quadrante "${destination ?? ""}" não existe (use ${QUADRANT_IDS.join(", ")}).`);
  }
  if (origin !== ANY_ORIGIN && !QUADRANT_IDS.includes(origin)) return fail(`O quadrante de origem "${origin ?? ""}" não existe.`);
  const job = world.jobs.find((j) => j.characterId === characterId);
  if (job) {
    const busy = character.gender === "female" ? "ocupada" : "ocupado";
    return fail(`${character.name} já está ${busy}: vai ${describeTask(job)} (${job.done} de ${job.quantity}).`);
  }
  if (action === "levar_bloco" && origin === destination) return fail(`A origem e o destino são o mesmo quadrante (${destination}).`);

  const order = { characterId, action, origin, destination };
  const requested = normalizeQuantity(action, quantity, world.blocks.length || game.block.count);
  let available = sourceBlocks(world, order).length;
  if (!available) return fail(noBlocksReason(world, order));
  const plan = planCells(world, order, Math.min(requested, available));
  if (!plan.ok) return plan;
  // A pilha escolhida para "empilhar" nao conta como fonte (os blocos dela ficam onde estao).
  if (plan.cells.length) available = sourceBlocks(world, { ...order, cells: plan.cells }).length;
  if (!available) return fail(noBlocksReason(world, order));
  return { ok: true, quantity: Math.min(requested, available), requested, cells: plan.cells };
}

/**
 * Da resposta lida do modelo (parseReply) ao que o jogo faz:
 *  - order: { action, quantity, origin, destination } se ele aceitou e a tarefa e possivel agora
 *    (com a quantidade que da para fazer); o HUD a executa
 *  - rejected: { reason } se ele aceitou mas a tarefa e impossivel
 *  - entries: o que entra no historico do chat: a fala do personagem (com a ordem executada, se houve)
 *    e, quando ha ordem ou recusa, uma linha de sistema avisando.
 */
export function resolveReply(reply, world, character) {
  let order = toOrder(reply);
  let rejected = null;
  let note = "";
  if (order) {
    const check = validateOrder(world, { ...order, characterId: character.id });
    if (!check.ok) {
      rejected = { reason: check.reason };
      order = null;
    } else {
      if (check.quantity < check.requested) note = ` (só há ${check.quantity} ${check.quantity === 1 ? "bloco livre" : "blocos livres"})`;
      order = { ...order, quantity: check.quantity };
    }
  }
  const entries = [{ role: "assistant", text: reply.text, order }];
  if (order) {
    entries.push({ role: "system", kind: "order", text: `${character.name} vai ${describeTask(order)}${note}.` });
  } else if (rejected) {
    entries.push({ role: "system", kind: "rejected", text: `Pedido não executado: ${rejected.reason}` });
  }
  return { order, rejected, entries };
}
