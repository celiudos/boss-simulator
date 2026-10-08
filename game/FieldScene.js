// Cena principal: o campo verde numa visao isometrica de jogo de estrategia, uma plataforma com
// grade dividida em 4 quadrantes (A no topo, B a direita, C a esquerda e D embaixo).
// Toda a logica usa px do CHAO (game/field.js, game/layout.js, NavGrid, World); so o desenho
// projeta (game/iso.js).
// O chefe (jogador) nao tem sprite: ele clica num personagem (ou na pill do topo) para abrir o chat.
// Cada personagem passeia sozinho dentro do proprio quadrante (game/Walker.js). Quando o chefe
// convence alguem a fazer uma tarefa com os blocos (levar, empilhar, torre, parede), a cena executa
// a tarefa, uma viagem por bloco (runOrder). Varios personagens podem trabalhar ao mesmo tempo.
// A cena e o HUD (DOM) se comunicam pelo barramento game/events.js:
//   emite  "crew"               lista dos personagens para a barra do topo
//   emite  "chat:open"          { characterId } quando o jogador clica num personagem
//   emite  "world"              estado dos blocos e das tarefas (World.snapshot) a cada mudanca
//   escuta "character:thinking" { id, thinking }  emote "..." enquanto o modelo responde
//   escuta "character:reply"    { id, text }      balao de fala
//   escuta "order:start"        { id, order }     o personagem executa a tarefa
//                               (order = { action, quantity, origin, destination })
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
import { inset, quadrants } from "./field.js";
import { gridCells, gridSegments, platformFaces, quadrantSegments, rectToScreen, screenBounds, toScreen } from "./iso.js";
import { cellCenter } from "./layout.js";
import { World } from "./world.js";

const color = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;

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

    // Os blocos comecam soltos no quadrante inicial (no chao), um por casa (game/layout.js).
    this.world = new World();
    /** id do bloco no World -> Block (desenho). */
    this.blocks = new Map(
      this.world.blocks.map((b) => {
        const p = cellCenter(b);
        return [b.id, new Block(this, b.id, p.x, p.y, b.level)];
      }),
    );
    this.emitWorld();

    // `?debug` na URL: __SCENE__ no console (ex.: __SCENE__.runOrder("juca", { action: "torre", quantity: 5, destination: "A" })).
    if (new URLSearchParams(location.search).has("debug")) globalThis.__SCENE__ = this;

    const unsubscribe = [
      gameEvents.on("character:thinking", ({ id, thinking }) => this.onThinking(id, thinking)),
      gameEvents.on("character:reply", ({ id, text }) => this.onReply(id, text)),
      gameEvents.on("order:start", ({ id, order }) => {
        this.runOrder(id, order).catch((err) => console.error("[runOrder]", err));
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.closing = true;
      unsubscribe.forEach((off) => off());
      this.walkers.forEach((w) => w.destroy());
      this.blocks.forEach((b) => b.destroy());
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

  /**
   * Onde os outros estao (e para onde vao) e onde ha blocos: ninguem escolhe o mesmo lugar para
   * parar, nem para dentro de uma torre ou parede (os blocos nao bloqueiam a caminhada).
   */
  crowdExcept(self) {
    const points = [];
    for (const w of this.walkers) {
      if (w === self) continue;
      points.push(w.feet);
      if (w.target) points.push(w.target);
    }
    for (const b of this.blocks?.values() ?? []) if (!b.carrier) points.push(b.position);
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

  // ── Tarefas com os blocos ────────────────────────────────
  /**
   * `characterId` executa a tarefa `order` = { action, quantity, origin, destination } (ver
   * game/layout.js): uma viagem por bloco (anda ate o bloco, pega, leva ate a casa planejada e
   * coloca no chao ou no alto da pilha) e, no fim, volta para o seu quadrante. A ordem passa por
   * World.startJob (game/orders.js); se for impossivel, nada acontece.
   * Resolve com { ok: true, entry } ao fim (entry = registro do historico), ou { ok: false, reason }.
   */
  async runOrder(characterId, order) {
    const walker = this.walkerById(characterId);
    if (!walker) return { ok: false, reason: "Esse personagem não existe." };
    const started = this.world.startJob(characterId, order);
    if (!started.ok) return started;
    this.emitWorld();

    walker.engage();
    walker.setStatus("working");
    let interrupted = false;
    for (;;) {
      const trip = this.world.beginTrip(characterId, walker.feet);
      if (!trip) break;
      this.emitWorld();
      const done = await this.runTrip(walker, trip);
      if (this.closing) return { ok: false, reason: "O jogo foi encerrado." };
      if (!done) {
        interrupted = true;
        break;
      }
      this.emitWorld();
    }

    const entry = interrupted ? this.dropBlockHere(walker) : this.world.finishJob(characterId);
    this.emitWorld();

    // De volta para o quadrante de casa (num lugar sem blocos); so passeia de novo quando chegar.
    await walker.walkTo(walker.pickWanderTarget() ?? walker.homeSpot);
    if (this.closing) return { ok: false, reason: "O jogo foi encerrado." };
    walker.startWandering();
    return entry.reason ? { ok: false, reason: entry.reason, entry } : { ok: true, entry };
  }

  /** Atalho para o console (?debug): leva `quantity` blocos para `destination`. */
  deliverBlock(characterId, destination, quantity = 1) {
    return this.runOrder(characterId, { action: "levar_bloco", quantity, destination });
  }

  /**
   * Uma viagem: anda ate o bloco, pega, leva ate a casa `trip.to` e coloca no nivel certo da pilha.
   * true se chegou ao fim.
   */
  async runTrip(walker, trip) {
    const id = walker.character.id;
    const { standOffset } = game.block;
    // Os pes ficam na frente do bloco (a esquerda na tela), para o personagem nao ficar escondido.
    const beside = (p) => this.grid.nearestWalkable(p.x + standOffset.x, p.y + standOffset.y);
    const block = this.blocks.get(trip.blockId);
    const at = block.position;

    const pickup = beside(at);
    if (!pickup || !(await walker.walkTo(pickup)) || this.closing) return false;
    walker.faceTo(at.x, at.y);
    if (!this.world.pickUp(id)) return false;
    this.emitWorld();
    await block.attachTo(walker);
    if (this.closing) return false;

    const target = cellCenter(trip.to);
    const drop = beside(target);
    if (!drop || !(await walker.walkTo(drop, { speed: game.crew.carrySpeed })) || this.closing) return false;
    walker.faceTo(target.x, target.y);
    const placed = this.world.place(id);
    if (!placed) return false;
    await block.placeAt(target.x, target.y, placed.level);
    return !this.closing;
  }

  /**
   * Tarefa interrompida: se havia um bloco na mao, ele cai na casa livre mais perto da frente do
   * personagem. Encerra a tarefa no World e devolve o registro do historico.
   */
  dropBlockHere(walker) {
    const { standOffset } = game.block;
    const feet = walker.feet;
    const { dropped, entry } = this.world.abortJob(walker.character.id, { x: feet.x - standOffset.x, y: feet.y - standOffset.y });
    if (dropped) {
      const p = cellCenter(dropped);
      this.blocks.get(dropped.blockId)?.placeAt(p.x, p.y, dropped.level);
    }
    return entry;
  }

  update() {
    this.walkers.forEach((w) => w.update());
    this.blocks.forEach((b) => b.update());
  }
}
