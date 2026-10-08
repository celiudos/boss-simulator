// Um bloco do campo: um cubo isometrico (topo e duas laterais sombreadas, contorno escuro) com uma
// sombra no chao. Fica numa casa do chao (ou em cima de outro bloco, numa pilha) ate alguem o pegar;
// carregado, acompanha o personagem acima da cabeca. Quem decide de onde para onde ele vai e a cena
// (FieldScene.runOrder, com o planejamento de game/layout.js); aqui so ficam o desenho e as
// animacoes de pegar e colocar.
//
// A posicao de verdade e a do centro da base no CHAO mais a altura (`state` = { x, y, z }, px
// logicos); a cada frame o cubo e projetado na tela (game/iso.js).
import { game } from "../config/index.js";
import { STANDING_DEPTH, cubeFaces, depthAt, rectToScreen, toScreen } from "./iso.js";

const color = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
/** Sombra: acima do chao (0-1), abaixo de quem fica em pe (a partir de STANDING_DEPTH). */
const SHADOW_DEPTH = STANDING_DEPTH - 1;
/** Carregado: uma fracao acima do personagem (a profundidade dele varia com a posicao). */
const ABOVE_CARRIER = 0.00005;
/**
 * Cada nivel da pilha fica um tiquinho na frente do de baixo. Menor que a diferenca entre casas
 * vizinhas (block.cell / 10000 em depthAt), maior que zero: a pilha inteira desenha na ordem certa.
 */
const LEVEL_DEPTH = 0.00001;

export class Block {
  /** `id` do bloco no World; (x, y) = centro da base no chao (px logicos); `level` = nivel da pilha. */
  constructor(scene, id, x, y, level = 0, cfg = game.block) {
    this.scene = scene;
    this.id = id;
    this.cfg = cfg;
    /** Quem esta carregando (Walker) ou null. */
    this.carrier = null;
    /** true quando o bloco ja subiu e acompanha o carregador a cada frame. */
    this.attached = false;
    /** Centro da base no chao e altura (z): e isso que as animacoes mexem. */
    this.state = { x, y, z: level * cfg.height };
    /** Quem acabou de soltar o bloco (durante a descida) ou null. */
    this.dropper = null;

    this.shadow = this.drawShadow(scene).setDepth(SHADOW_DEPTH).setVisible(level === 0);
    this.cube = this.drawCube(scene);
    this.container = scene.add.container(0, 0, [this.cube]);
    this.update();
  }

  /** Losango escuro no chao, um pouco maior que a base. */
  drawShadow(scene) {
    const s = this.cfg.size * 1.25;
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3);
    g.fillPoints(rectToScreen({ x: -s / 2, y: -s / 2, width: s, height: s }), true);
    return g;
  }

  /** As tres faces visiveis, o contorno e um brilho na aresta de cima, a esquerda. */
  drawCube(scene) {
    const { size, height, topColor, leftColor, rightColor, borderColor } = this.cfg;
    const { top, left, right } = cubeFaces(size, height);
    const g = scene.add.graphics();
    g.fillStyle(color(leftColor), 1).fillPoints(left, true);
    g.fillStyle(color(rightColor), 1).fillPoints(right, true);
    g.fillStyle(color(topColor), 1).fillPoints(top, true);
    g.lineStyle(2, color(borderColor), 1);
    for (const face of [left, right, top]) g.strokePoints(face, true, true);
    // Brilho: aresta esquerda -> topo do losango de cima.
    const [t1, , , l1] = top;
    g.lineStyle(2, 0xffffff, 0.45).lineBetween(l1.x + 2, l1.y, t1.x, t1.y + 1);
    return g;
  }

  /** Centro da base do bloco no chao agora. */
  get position() {
    return { x: this.state.x, y: this.state.y };
  }

  tweenTo(to, duration, ease) {
    return new Promise((resolve) => {
      this.scene.tweens.killTweensOf(this.state);
      this.scene.tweens.add({ targets: this.state, ...to, duration, ease, onComplete: resolve });
    });
  }

  /** O personagem pega o bloco: ele sobe ate acima da cabeca e passa a acompanhar. */
  async attachTo(walker) {
    this.carrier = walker;
    this.attached = false;
    this.shadow.setVisible(false);
    const { x, y } = walker.feet;
    const rise = Math.abs(this.cfg.carryHeight - this.state.z);
    await this.tweenTo({ x, y, z: this.cfg.carryHeight }, 180 + rise, "Sine.easeOut");
    if (this.carrier === walker) this.attached = true;
  }

  /**
   * Coloca o bloco com a base em (x, y) do chao, no nivel `level` da pilha (0 = no chao).
   * No chao ele quica; em cima de outro bloco (ou acima da cabeca) desliza ate o lugar.
   */
  async placeAt(x, y, level = 0) {
    this.attached = false;
    // Enquanto desce, continua na frente de quem soltou (senao some atras da cabeca dele).
    this.dropper = this.carrier;
    this.carrier = null;
    const z = level * this.cfg.height;
    const travel = Math.abs(this.state.z - z);
    await this.tweenTo({ x, y, z }, level === 0 ? 240 : 200 + travel, level === 0 ? "Bounce.easeOut" : "Sine.easeInOut");
    this.dropper = null;
    if (!this.carrier) this.shadow.setVisible(level === 0);
  }

  /** Projeta na tela (chamar a cada frame, depois de atualizar os personagens). */
  update() {
    if (this.attached && this.carrier) {
      const { x, y } = this.carrier.feet;
      this.state.x = x;
      this.state.y = y;
      this.state.z = this.cfg.carryHeight;
    }
    const { x, y, z } = this.state;
    const s = toScreen({ x, y, z });
    this.container.setPosition(s.x, s.y);
    const ground = toScreen({ x, y });
    this.shadow.setPosition(ground.x, ground.y);
    // Carregado (ou descendo da mao): logo acima de quem carrega; parado: pela posicao e pelo nivel.
    const own = depthAt(x, y) + (z / this.cfg.height) * LEVEL_DEPTH;
    const holder = this.carrier ?? this.dropper;
    this.container.setDepth(holder ? Math.max(holder.sprite.depth + ABOVE_CARRIER, own) : own);
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.state);
    this.container.destroy();
    this.shadow.destroy();
  }
}
