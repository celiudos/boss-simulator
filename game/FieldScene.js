// Cena principal: o campo verde numa visao isometrica de jogo de estrategia, uma plataforma com
// grade dividida em 4 quadrantes (A no topo, B a direita, C a esquerda e D embaixo).
// Toda a logica usa px do CHAO (game/field.js, NavGrid, World); so o desenho projeta (game/iso.js).
// O chefe (jogador) nao tem sprite: ele clica num personagem (ou na pill do topo) para abrir o chat.
// Cada personagem passeia sozinho dentro do proprio quadrante (game/Walker.js). Quando o chefe
// convence alguem a levar o bloco para outro quadrante, a cena executa a entrega (deliverBlock).
// A cena e o HUD (DOM) se comunicam pelo barramento game/events.js:
//   emite  "crew"               lista dos personagens para a barra do topo
//   emite  "chat:open"          { characterId } quando o jogador clica num personagem
//   emite  "world"              estado do bloco (World.snapshot) a cada mudanca
//   escuta "character:thinking" { id, thinking }  emote "..." enquanto o modelo responde
//   escuta "character:reply"    { id, text }      balao de fala
//   escuta "order:start"        { id, destination }  o personagem leva o bloco
import { game, characters, spriteKey, spriteSheets } from "../config/index.js";
import {
  BODY_SIZE_RATIO_H,
  BODY_SIZE_RATIO_W,
  EMOTE_FRAME_SIZE,
  EMOTE_SHEET_KEY,
  EMOTE_SHEET_PATH,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  PUBLIC_PATH,
} from "./constants.js";
import { Block } from "./Block.js";
import { CameraController } from "./CameraController.js";
import { NavGrid } from "./NavGrid.js";
import { Walker } from "./Walker.js";
import { gameEvents } from "./events.js";
import { inset, quadrantOf, quadrants } from "./field.js";
import { gridCells, gridSegments, platformFaces, quadrantSegments, rectToScreen, screenBounds, toScreen } from "./iso.js";
import { World } from "./world.js";

const color = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export default class FieldScene extends Phaser.Scene {
  constructor() {
    super({ key: "FieldScene" });
    this.walkers = [];
    /** true depois que a cena foi encerrada: entregas em andamento param de mexer nos objetos. */
    this.closing = false;
  }

  preload() {
    for (const s of spriteSheets) this.load.image(s.key, s.path);
    this.load.spritesheet(EMOTE_SHEET_KEY, EMOTE_SHEET_PATH, {
      frameWidth: EMOTE_FRAME_SIZE,
      frameHeight: EMOTE_FRAME_SIZE,
    });
  }

  create() {
    const field = game.field;
    /** Area do chao (px logicos): onde da para andar. */
    const bounds = { x: field.x, y: field.y, width: field.width, height: field.height };
    this.quadrants = new Map(quadrants(field).map((q) => [q.id, q]));
    this.drawField(field);

    // A camera enquadra o losango projetado na tela (com as laterais da plataforma).
    this.cameraController = new CameraController(this, screenBounds(field));
    this.cameraController.init();

    // Grade de navegacao: campo livre (sem obstaculos), corpo do tamanho dos pes do personagem.
    this.grid = new NavGrid({
      rects: [],
      bounds,
      cell: game.crew.navCell,
      body: { width: FRAME_WIDTH * BODY_SIZE_RATIO_W, height: FRAME_HEIGHT * BODY_SIZE_RATIO_H },
    });

    const crew = characters.map((c, i) => {
      const home = this.quadrants.get(c.home);
      const start = this.grid.nearestWalkable(home.center.x, home.center.y) ?? home.center;
      const walker = new Walker(this, start.x, start.y, spriteKey(c.sprite), c, "down", {
        grid: this.grid,
        home: inset(home, game.crew.homeInset),
        config: game.crew,
        crowd: () => this.crowdExcept(walker),
      });
      /** Onde volta (pes) depois de cumprir uma ordem. */
      walker.homeSpot = { x: start.x, y: start.y };
      this.walkers.push(walker);

      // Clique (sem arrastar a camera) abre o chat com o personagem.
      walker.sprite.setInteractive({ useHandCursor: true });
      walker.sprite.on("pointerup", (pointer) => {
        if (pointer.button === 0 && !this.cameraController.dragged) gameEvents.emit("chat:open", { characterId: c.id });
      });

      walker.startWandering(600 + i * 700);
      return {
        id: c.id,
        label: c.name,
        gender: c.gender,
        roleTitle: c.role,
        spritePath: `${PUBLIC_PATH}/characters/Premade_Character_48x48_${c.sprite}.png`,
      };
    });
    gameEvents.emit("crew", crew);

    // O bloco comeca no centro do quadrante inicial (no chao).
    this.world = new World();
    const blockStart = this.quadrants.get(this.world.blockQuadrant).center;
    this.block = new Block(this, blockStart.x, blockStart.y);
    this.emitWorld();

    // `?debug` na URL: __SCENE__ no console (ex.: __SCENE__.deliverBlock("juca", "A")).
    if (new URLSearchParams(location.search).has("debug")) globalThis.__SCENE__ = this;

    const unsubscribe = [
      gameEvents.on("character:thinking", ({ id, thinking }) => this.onThinking(id, thinking)),
      gameEvents.on("character:reply", ({ id, text }) => this.onReply(id, text)),
      gameEvents.on("order:start", ({ id, destination }) => {
        this.deliverBlock(id, destination).catch((err) => console.error("[deliverBlock]", err));
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closing = true;
      unsubscribe.forEach((off) => off());
      this.walkers.forEach((w) => w.destroy());
      this.block.destroy();
    });
  }

  /**
   * Plataforma isometrica: laterais de terra, grama em xadrez, grade fina, borda e divisoes brancas
   * e a letra de cada quadrante em pe. Tudo na profundidade 0-1 (abaixo de quem fica em pe).
   */
  drawField(field) {
    const g = this.add.graphics().setDepth(0);
    const line = ({ from, to }) => {
      const a = toScreen(from);
      const b = toScreen(to);
      g.lineBetween(a.x, a.y, b.x, b.y);
    };

    // Laterais da frente (esquerda mais clara, direita mais escura), com a aresta de baixo marcada.
    const sides = field.sideColors.map(color);
    for (const face of platformFaces(field)) {
      g.fillStyle(face.side === "left" ? sides[0] : sides[1], 1);
      g.fillPoints(face.points, true);
      g.lineStyle(2, 0x000000, 0.35);
      g.lineBetween(face.points[2].x, face.points[2].y, face.points[3].x, face.points[3].y);
    }

    // Grama: o losango inteiro na 1a cor (sem frestas entre celulas) e o xadrez por cima.
    const grass = field.grass.map(color);
    g.fillStyle(grass[0], 1);
    g.fillPoints(rectToScreen(field), true);
    for (const cell of gridCells(field)) {
      const tone = (cell.col + cell.row) % grass.length;
      if (tone === 0) continue;
      g.fillStyle(grass[tone], 1);
      g.fillPoints(rectToScreen(cell), true);
    }

    // Grade fina das celulas.
    g.lineStyle(1, color(field.gridColor), field.gridAlpha);
    gridSegments(field).forEach(line);

    // Borda e divisoes dos quadrantes.
    g.lineStyle(field.lineWidth, color(field.lineColor), 1);
    quadrantSegments(field).forEach(line);

    for (const q of this.quadrants.values()) {
      const at = toScreen(q.center);
      this.add
        .text(at.x, at.y, q.id, {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: `${field.labelSize}px`,
          color: field.lineColor,
        })
        .setOrigin(0.5)
        .setAlpha(field.labelAlpha)
        .setDepth(1);
    }
  }

  walkerById(id) {
    return this.walkers.find((w) => w.character.id === id);
  }

  /** Onde os outros estao (e para onde vao): ninguem escolhe o mesmo lugar para parar. */
  crowdExcept(self) {
    const points = [];
    for (const w of this.walkers) {
      if (w === self) continue;
      points.push(w.feet);
      if (w.target) points.push(w.target);
    }
    return points;
  }

  /** Avisa o HUD (e quem mais ouvir) do estado do bloco. */
  emitWorld() {
    gameEvents.emit("world", this.world.snapshot());
  }

  /** Enquanto o Ollama responde: emote "..." sobre o personagem. */
  onThinking(id, thinking) {
    const w = this.walkerById(id);
    if (!w) return;
    if (thinking) {
      w.pauseActivities();
      w.showEmote("emote:dots");
      w.setStatus("working");
      return;
    }
    if (w.currentEmoteKey === "emote:dots") w.hideEmote();
    if (!w.engaged) {
      w.setStatus("idle");
      w.resumeActivities();
    }
  }

  /** Resposta do personagem: balao de fala sobre ele. */
  onReply(id, text) {
    const w = this.walkerById(id);
    if (!w) return;
    const ttl = Math.max(game.crew.bubbleMs, text.length * game.crew.bubbleMsPerChar);
    w.showBubble(text, ttl, { maxChars: game.crew.bubbleMaxChars });
    if (!w.engaged) {
      w.setStatus("idle");
      w.resumeActivities(ttl);
    }
  }

  // ── Entrega do bloco ─────────────────────────────────────
  /**
   * `characterId` leva o bloco para o quadrante `destination`: anda ate o bloco, pega, carrega ate o
   * centro do destino, solta e volta para casa. A ordem passa por World.startDelivery (game/orders.js);
   * se for impossivel, nada acontece. Resolve com { ok: true } ao fim, ou { ok: false, reason }.
   */
  async deliverBlock(characterId, destination) {
    const walker = this.walkerById(characterId);
    if (!walker) return { ok: false, reason: "Esse personagem não existe." };
    const started = this.world.startDelivery(characterId, destination);
    if (!started.ok) return started;
    this.emitWorld();

    walker.engage();
    walker.setStatus("working");
    const delivered = await this.carryBlock(walker, destination);
    if (this.closing) return { ok: false, reason: "O jogo foi encerrado." };

    if (delivered) this.world.finishDelivery();
    else this.dropBlockHere(walker);
    this.emitWorld();

    // De volta para casa; so passeia de novo quando chegar (ou se nao der para andar).
    await walker.walkTo(walker.homeSpot);
    if (this.closing) return { ok: delivered };
    walker.startWandering();
    return delivered ? { ok: true } : { ok: false, reason: "Não deu para levar o bloco." };
  }

  /** Anda ate o bloco, pega, leva ate o centro do destino e solta. true se chegou ao fim. */
  async carryBlock(walker, destination) {
    const { standOffset } = game.block;
    // Os pes ficam na frente do bloco (a esquerda na tela), para o personagem nao ficar escondido.
    const beside = (p) => this.grid.nearestWalkable(p.x + standOffset.x, p.y + standOffset.y);
    const target = this.quadrants.get(destination).center;
    const at = this.block.position;

    const pickup = beside(at);
    if (!pickup || !(await walker.walkTo(pickup)) || this.closing) return false;
    walker.faceTo(at.x, at.y);
    await this.block.attachTo(walker);
    if (this.closing) return false;

    const drop = beside(target);
    if (!drop || !(await walker.walkTo(drop, { speed: game.crew.carrySpeed })) || this.closing) return false;
    walker.faceTo(target.x, target.y);
    await this.block.dropAt(target.x, target.y);
    return !this.closing;
  }

  /** Entrega interrompida: se o bloco estava na mao, cai na frente do personagem (dentro do campo). */
  dropBlockHere(walker) {
    let where = null;
    if (this.block.carrier === walker) {
      const { x: fx, y: fy, width, height } = game.field;
      const { standOffset } = game.block;
      const feet = walker.feet;
      const x = clamp(feet.x - standOffset.x, fx, fx + width);
      const y = clamp(feet.y - standOffset.y, fy, fy + height);
      where = quadrantOf(x, y, game.field);
      this.block.dropAt(x, y);
    }
    this.world.abortDelivery(where);
  }

  update() {
    this.walkers.forEach((w) => w.update());
    this.block.update();
  }
}
