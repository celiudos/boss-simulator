// Personagem em pe que anda sozinho pelo campo: grade de navegacao com A* (game/NavGrid.js), passeia
// so dentro do quadrante de casa e mostra baloes com as falas.
// Reaproveita o Worker (nome, ponto de status, emotes e balao).
import { BODY_OFFSET_RATIO_Y, BODY_SIZE_RATIO_H, FRAME_HEIGHT } from "./constants.js";
import { ChatBubble } from "./ChatBubble.js";
import { Worker } from "./Worker.js";

/** Do centro do sprite ate o centro do corpo fisico (os pes): a grade de navegacao usa os pes. */
export const FEET_OFFSET_Y = FRAME_HEIGHT * (BODY_OFFSET_RATIO_Y + BODY_SIZE_RATIO_H / 2) - FRAME_HEIGHT / 2;

/** Acima do campo; a fracao ordena pelo y (quem esta mais embaixo fica na frente). */
export const STANDING_DEPTH = 11;
export const depthFor = (y) => STANDING_DEPTH + y / 10000;

/** Direcao dominante de um deslocamento. */
export const dirOf = (dx, dy) => (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");

export class Walker extends Worker {
  /**
   * @param {object} opts
   * @param {import("./NavGrid.js").NavGrid} opts.grid
   * @param {{x:number,y:number,width:number,height:number}} opts.home  area (pes) onde passeia
   * @param {() => {x:number,y:number}[]} opts.crowd  pontos (pes) a evitar ao escolher destino
   * @param {object} opts.config  config/game.js -> crew
   */
  constructor(scene, x, y, spriteKey, character, facing, { grid, home, crowd, config }) {
    super(scene, x, y, spriteKey, character, facing);
    this.grid = grid;
    this.home = home;
    this.crowd = crowd;
    this.cfg = config;
    /** Cumprindo uma ordem (ou outra tarefa): nao sai andando a toa. */
    this.engaged = false;
    this.moving = false;
    /** Destino da caminhada atual (pes), para os outros nao escolherem o mesmo lugar. */
    this.target = null;
    this.walkId = 0;
    this.walkDone = null;
    this.wanderTimer = null;
    this.destroyed = false;

    this.sprite.setDepth(depthFor(y));
    // Balao um pouco mais estreito que o padrao.
    this.bubble.destroy();
    this.bubble = new ChatBubble(scene, { maxWidth: 250 });
  }

  /** Posicao dos pes (coordenadas da grade de navegacao). */
  get feet() {
    return { x: this.sprite.x, y: this.sprite.y + FEET_OFFSET_Y };
  }

  playIdle() {
    this.sprite.anims.play(`${this.spriteKey}:idle-${this.facing}`, true);
  }

  face(dir) {
    this.facing = dir;
    if (!this.moving) this.playIdle();
  }

  faceTo(x, y) {
    this.face(dirOf(x - this.sprite.x, y - this.sprite.y));
  }

  /**
   * Anda ate `to` (pes) pela grade. Resolve true ao chegar, false se nao houver caminho ou se a
   * caminhada for interrompida. `exact`: termina exatamente em `to`, mesmo fora da grade.
   */
  walkTo(to, { speed = this.cfg.walkSpeed, exact = false } = {}) {
    this.stopWalking();
    const path = this.grid.findPath(this.feet, to);
    if (!path) return Promise.resolve(false);
    const last = path.at(-1);
    if (exact && (!last || Math.hypot(last.x - to.x, last.y - to.y) > 1)) path.push({ x: to.x, y: to.y });
    const id = ++this.walkId;
    this.target = path.at(-1) ?? to;
    this.moving = true;

    return new Promise((resolve) => {
      this.walkDone = resolve;
      const finish = (arrived) => {
        if (id !== this.walkId) return;
        this.walkDone = null;
        this.moving = false;
        this.target = null;
        if (!this.destroyed) this.playIdle();
        resolve(arrived);
      };
      const step = (i) => {
        if (id !== this.walkId || this.destroyed) return;
        if (i >= path.length) return finish(true);
        const tx = path[i].x;
        const ty = path[i].y - FEET_OFFSET_Y;
        const dx = tx - this.sprite.x;
        const dy = ty - this.sprite.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1) return step(i + 1);
        this.facing = dirOf(dx, dy);
        this.sprite.anims.play(`${this.spriteKey}:walk-${this.facing}`, true);
        this.scene.tweens.add({
          targets: this.sprite,
          x: tx,
          y: ty,
          duration: (dist / speed) * 1000,
          onComplete: () => step(i + 1),
        });
      };
      step(0);
    });
  }

  /** Para onde estiver (a promessa da caminhada resolve false). */
  stopWalking() {
    this.walkId++;
    this.scene.tweens.killTweensOf(this.sprite);
    const done = this.walkDone;
    this.walkDone = null;
    this.target = null;
    if (this.moving) {
      this.moving = false;
      if (!this.destroyed) this.playIdle();
    }
    done?.(false);
  }

  // ── Andar a toa ──────────────────────────────────────────
  /** Comeca (ou retoma) o passeio aleatorio pelo quadrante de casa depois de `delay` ms. */
  startWandering(delay = this.randomPause()) {
    this.engaged = false;
    this.setStatus("idle");
    this.scheduleWander(delay);
    this.resumeActivities();
  }

  /** Para de passear e de mostrar emotes (vai cumprir uma ordem...). */
  engage() {
    this.engaged = true;
    this.wanderTimer?.remove(false);
    this.wanderTimer = null;
    this.stopWalking();
    this.pauseActivities();
    this.hideEmote();
  }

  randomPause() {
    const [min, max] = this.cfg.wanderPauseMs;
    return Phaser.Math.Between(min, max);
  }

  scheduleWander(delay) {
    this.wanderTimer?.remove(false);
    this.wanderTimer = this.scene.time.delayedCall(delay, () => this.wanderOnce());
  }

  async wanderOnce() {
    this.wanderTimer = null;
    if (this.engaged || this.destroyed) return;
    const target = this.pickWanderTarget();
    if (target) await this.walkTo(target);
    if (!this.engaged && !this.destroyed) this.scheduleWander(this.randomPause());
  }

  /** Destino aleatorio dentro do quadrante de casa, longe de onde os outros estao ou vao estar. */
  pickWanderTarget() {
    const others = this.crowd();
    const minGap = this.cfg.personalSpace;
    let best = null;
    for (let i = 0; i < 8; i++) {
      const p = this.grid.randomWalkableIn(this.home);
      if (!p) continue;
      const gap = Math.min(Infinity, ...others.map((o) => Math.hypot(o.x - p.x, o.y - p.y)));
      if (gap >= minGap) return p;
      if (!best || gap > best.gap) best = { ...p, gap };
    }
    return best;
  }

  /** Emotes aleatorios so quando esta livre e sem balao na tela (o emote esconderia a fala). */
  nextActivity() {
    if (this.engaged) return;
    if (this.bubble.visible) {
      this.timer = this.scene.time.delayedCall(1500, () => this.nextActivity());
      return;
    }
    super.nextActivity();
  }

  update() {
    super.update();
    this.sprite.setDepth(depthFor(this.sprite.y));
  }

  destroy() {
    this.destroyed = true;
    this.wanderTimer?.remove(false);
    this.stopWalking();
    super.destroy();
  }
}
