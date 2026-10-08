// Regras das ordens do chefe. Quem decide se o personagem ACEITA e o modelo (pela persona); o codigo
// so confere se a acao e POSSIVEL no estado atual do campo.
// Modulo puro (sem Phaser/DOM): roda no navegador e nos testes (node --test).
import { characters } from "../config/index.js";
import { QUADRANT_IDS } from "./field.js";
import { describeQuadrant, toOrder } from "./prompt.js";

const nameOf = (id) => characters.find((c) => c.id === id)?.name ?? id;

/**
 * A ordem "`characterId` leva o bloco para `destination`" e possivel agora?
 * `world`: qualquer objeto com { blockQuadrant, carrierId, destination } (ver game/world.js).
 * Retorna { ok: true } ou { ok: false, reason } com o motivo em portugues para mostrar no chat.
 */
export function validateOrder(world, { characterId, destination } = {}) {
  if (!characters.some((c) => c.id === characterId)) return { ok: false, reason: "Esse personagem não existe." };
  if (!QUADRANT_IDS.includes(destination)) {
    return { ok: false, reason: `O quadrante "${destination ?? ""}" não existe (use ${QUADRANT_IDS.join(", ")}).` };
  }
  if (world.carrierId) {
    const to = world.destination ? ` para o quadrante ${world.destination}` : "";
    return { ok: false, reason: `${nameOf(world.carrierId)} já está levando o bloco${to}.` };
  }
  if (world.blockQuadrant === destination) {
    return { ok: false, reason: `O bloco já está no quadrante ${destination}.` };
  }
  return { ok: true };
}

/**
 * Da resposta lida do modelo (parseReply) ao que o jogo faz:
 *  - order: { action, destination } se ele aceitou e a ordem e possivel agora (o HUD a executa)
 *  - rejected: { reason } se ele aceitou mas a ordem e impossivel
 *  - entries: o que entra no historico do chat: a fala do personagem (com a ordem executada, se houve)
 *    e, quando ha ordem ou recusa, uma linha de sistema avisando.
 */
export function resolveReply(reply, world, character) {
  let order = toOrder(reply);
  let rejected = null;
  if (order) {
    const check = validateOrder(world, { characterId: character.id, destination: order.destination });
    if (!check.ok) {
      rejected = { reason: check.reason };
      order = null;
    }
  }
  const entries = [{ role: "assistant", text: reply.text, order }];
  if (order) {
    entries.push({ role: "system", kind: "order", text: `${character.name} vai levar o bloco para o ${describeQuadrant(order.destination)}.` });
  } else if (rejected) {
    entries.push({ role: "system", kind: "rejected", text: `Pedido não executado: ${rejected.reason}` });
  }
  return { order, rejected, entries };
}
