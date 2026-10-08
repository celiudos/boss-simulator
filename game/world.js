// Estado do jogo: onde esta cada bloco (casa e nivel da pilha), quem esta carregando o que e as
// tarefas em andamento. A cena (FieldScene) executa as viagens e avisa este estado; as ordens vem
// do chat e passam por validateOrder (game/orders.js). O planejamento (de onde pegar, onde por)
// fica em game/layout.js.
// Modulo puro (sem Phaser/DOM): roda no navegador e nos testes (node --test).
import { game } from "../config/index.js";
import { ANY_ORIGIN, nearestFreeCell, nextTrip, quadrantCells } from "./layout.js";
import { validateOrder } from "./orders.js";

const copyJob = (j) => ({
  ...j,
  cells: j.cells.map((c) => ({ ...c })),
  trip: j.trip ? { ...j.trip, to: { ...j.trip.to } } : null,
});

export class World {
  /**
   * `count` blocos soltos no quadrante `start`, nas casas mais perto do centro.
   * `now`: relogio (trocavel nos testes). `field`/`cfg`: geometria (config/game.js -> field, block).
   */
  constructor({ count = game.block.count, start = game.block.start, now = () => Date.now(), field = game.field, cfg = game.block } = {}) {
    this.now = now;
    this.field = field;
    this.cfg = cfg;
    const cells = quadrantCells(start, field, cfg);
    const spots = [...cells.filter((c) => c.loose), ...cells.filter((c) => !c.loose)].slice(0, count);
    /** Blocos: { id, col, row, level, quadrant, carrierId, reservedBy, built } (ver game/layout.js). */
    this.blocks = spots.map((c, id) => ({ id, col: c.col, row: c.row, level: 0, quadrant: start, carrierId: null, reservedBy: null, built: false }));
    /** Tarefas em andamento, uma por personagem (ver game/layout.js). */
    this.jobs = [];
    /** Tarefas encerradas, da mais antiga para a mais nova (ver finishJob). */
    this.history = [];
  }

  jobOf(characterId) {
    return this.jobs.find((j) => j.characterId === characterId) ?? null;
  }

  blockById(id) {
    return this.blocks.find((b) => b.id === id) ?? null;
  }

  /** Alguem esta trabalhando? Sem `characterId`: qualquer um. */
  busy(characterId) {
    return characterId === undefined ? this.jobs.length > 0 : this.jobOf(characterId) !== null;
  }

  /**
   * Comeca uma tarefa se a ordem for possivel (validateOrder).
   * `order`: { action, quantity, origin, destination }. Retorna { ok: true, job } ou { ok: false, reason }
   * sem mudar nada. A quantidade pode ficar menor que a pedida (so ha N blocos livres).
   */
  startJob(characterId, order) {
    const check = validateOrder(this, { ...order, characterId });
    if (!check.ok) return check;
    const job = {
      characterId,
      action: order.action,
      origin: order.origin ?? ANY_ORIGIN,
      destination: order.destination,
      quantity: check.quantity,
      requested: check.requested,
      done: 0,
      cells: check.cells.map(({ col, row }) => ({ col, row })),
      trip: null,
      startedAt: this.now(),
    };
    this.jobs.push(job);
    return { ok: true, job: copyJob(job) };
  }

  /**
   * Planeja a proxima viagem de quem tem uma tarefa, saindo de `from` (pes no chao), e reserva o
   * bloco e a casa de destino. Retorna { blockId, from: { col, row, level }, to: { col, row, level } }
   * ou null se a tarefa acabou (ou nao ha mais bloco/lugar): ai e so chamar finishJob.
   */
  beginTrip(characterId, from) {
    const job = this.jobOf(characterId);
    if (!job || job.trip) return null;
    const trip = nextTrip(this, job, from, this.field, this.cfg);
    if (!trip) return null;
    const block = this.blockById(trip.blockId);
    block.reservedBy = characterId;
    job.trip = { blockId: block.id, to: trip.to, picked: false };
    return { blockId: block.id, from: { col: block.col, row: block.row, level: block.level }, to: { ...trip.to } };
  }

  /** O personagem chegou e pegou o bloco da viagem (ele sai da pilha). Retorna o bloco ou null. */
  pickUp(characterId) {
    const job = this.jobOf(characterId);
    const block = job?.trip && !job.trip.picked ? this.blockById(job.trip.blockId) : null;
    if (!block) return null;
    // So da para pegar o bloco de cima (as reservas garantem isso; aqui so confere).
    const above = this.blocks.some((b) => !b.carrierId && b.col === block.col && b.row === block.row && b.level > block.level);
    if (above) return null;
    Object.assign(block, { carrierId: characterId, reservedBy: null, col: null, row: null, level: null });
    job.trip.picked = true;
    return { ...block };
  }

  /** Nivel livre (altura da pilha) na casa (col, row). */
  heightAt(col, row) {
    return this.blocks.filter((b) => !b.carrierId && b.col === col && b.row === row).length;
  }

  /**
   * O bloco carregado chegou: vai para o alto da pilha da casa de destino (e passa a fazer parte da
   * estrutura, se a tarefa monta uma). Retorna { blockId, col, row, level } ou null.
   */
  place(characterId) {
    const job = this.jobOf(characterId);
    if (!job?.trip?.picked) return null;
    const { blockId, to } = job.trip;
    const block = this.blockById(blockId);
    const level = this.heightAt(to.col, to.row);
    const built = job.action !== "levar_bloco";
    Object.assign(block, { carrierId: null, col: to.col, row: to.row, level, quadrant: job.destination, built });
    // A base de uma pilha que ja existia (empilhar) tambem vira estrutura.
    if (built) for (const b of this.blocks) if (!b.carrierId && b.col === to.col && b.row === to.row) b.built = true;
    job.done++;
    job.trip = null;
    return { blockId, col: to.col, row: to.row, level };
  }

  /**
   * Encerra a tarefa e registra no historico: { characterId, action, origin, destination, quantity,
   * requested, done, reason, at }. `reason` (por que parou antes) fica null se fez tudo.
   * Uma viagem ainda nao comecada e desfeita; para soltar um bloco carregado, use abortJob.
   */
  finishJob(characterId, reason = null) {
    const job = this.jobOf(characterId);
    if (!job) return null;
    if (job.trip && !job.trip.picked) this.blockById(job.trip.blockId).reservedBy = null;
    job.trip = null;
    this.jobs = this.jobs.filter((j) => j !== job);
    const complete = job.done >= job.quantity;
    const entry = {
      characterId,
      action: job.action,
      origin: job.origin,
      destination: job.destination,
      quantity: job.quantity,
      requested: job.requested,
      done: job.done,
      reason: complete ? null : (reason ?? "não sobrou bloco livre ou lugar para colocar"),
      at: this.now(),
    };
    this.history.push(entry);
    return entry;
  }

  /**
   * A tarefa foi interrompida (sem caminho, cena encerrada...): se havia um bloco na mao, ele cai na
   * casa livre mais perto de (x, y) do chao. Retorna { dropped: { blockId, col, row, level } | null, entry }.
   */
  abortJob(characterId, at = null, reason = "a tarefa foi interrompida") {
    const job = this.jobOf(characterId);
    if (!job) return { dropped: null, entry: null };
    let dropped = null;
    if (job.trip?.picked) {
      const block = this.blockById(job.trip.blockId);
      const p = at ?? { x: this.field.x, y: this.field.y };
      const cell = nearestFreeCell(this, p.x, p.y, this.field, this.cfg);
      // Sem nenhuma casa livre (nao acontece com 10 blocos), volta para o topo do destino.
      const where = cell ?? { ...job.trip.to, quadrant: job.destination };
      const level = this.heightAt(where.col, where.row);
      Object.assign(block, { carrierId: null, col: where.col, row: where.row, level, quadrant: where.quadrant, built: false });
      dropped = { blockId: block.id, col: where.col, row: where.row, level };
      job.trip = null;
    }
    return { dropped, entry: this.finishJob(characterId, reason) };
  }

  /** Copia do estado para o HUD e para o prompt (nada aqui muda o mundo). */
  snapshot() {
    return {
      blocks: this.blocks.map((b) => ({ ...b })),
      jobs: this.jobs.map(copyJob),
      history: this.history.map((h) => ({ ...h })),
    };
  }
}
