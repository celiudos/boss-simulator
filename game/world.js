// Estado do jogo: onde esta o bloco e quem o esta carregando. A cena (FieldScene) executa as
// entregas e avisa este estado; as ordens vem do chat e passam por validateOrder (game/orders.js).
// Modulo puro (sem Phaser/DOM): roda no navegador e nos testes (node --test).
import { game } from "../config/index.js";
import { validateOrder } from "./orders.js";

export class World {
  /** `start`: quadrante inicial do bloco. `now`: relogio (trocavel nos testes). */
  constructor({ start = game.block.start, now = () => Date.now() } = {}) {
    this.now = now;
    /** Quadrante onde o bloco esta (durante uma entrega, de onde ele saiu). */
    this.blockQuadrant = start;
    /** Quem esta levando o bloco agora (id) ou null. */
    this.carrierId = null;
    /** Para onde o bloco esta indo (so durante uma entrega). */
    this.destination = null;
    /** Entregas concluidas, da mais antiga para a mais nova: { characterId, from, to, at }. */
    this.deliveries = [];
  }

  /** Alguem esta levando o bloco? */
  get busy() {
    return this.carrierId !== null;
  }

  /**
   * Comeca uma entrega se a ordem for possivel (validateOrder). Retorna { ok: true, from, to }
   * ou { ok: false, reason } sem mudar nada.
   */
  startDelivery(characterId, destination) {
    const check = validateOrder(this, { characterId, destination });
    if (!check.ok) return check;
    this.carrierId = characterId;
    this.destination = destination;
    return { ok: true, from: this.blockQuadrant, to: destination };
  }

  /** O bloco chegou: registra a entrega e libera o carregador. Retorna a entrega (ou null). */
  finishDelivery() {
    if (!this.busy) return null;
    const entry = { characterId: this.carrierId, from: this.blockQuadrant, to: this.destination, at: this.now() };
    this.blockQuadrant = this.destination;
    this.carrierId = null;
    this.destination = null;
    this.deliveries.push(entry);
    return entry;
  }

  /**
   * A entrega nao foi concluida (sem caminho, cena encerrada...): o bloco fica em `where`
   * (quadrante onde caiu; sem ele, volta ao de origem). Nao entra no historico.
   */
  abortDelivery(where) {
    if (!this.busy) return;
    if (where) this.blockQuadrant = where;
    this.carrierId = null;
    this.destination = null;
  }

  /** Copia do estado para o HUD e para o prompt (nada aqui muda o mundo). */
  snapshot() {
    return {
      blockQuadrant: this.blockQuadrant,
      carrierId: this.carrierId,
      destination: this.destination,
      deliveries: this.deliveries.map((d) => ({ ...d })),
    };
  }
}
