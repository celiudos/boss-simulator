// O bloco do campo: um quadrado pixel-art com sombra. Fica no chao ate alguem o pegar; carregado,
// acompanha o personagem, acima da cabeca. Quem manda ele de um lugar a outro e a cena
// (FieldScene.deliverBlock); aqui so ficam o desenho e a animacao de pegar e soltar.
import { game } from "../config/index.js";

const color = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
/** No chao: acima do campo, abaixo dos personagens (que ficam a partir de 11). */
const GROUND_DEPTH = 5;
/** Carregado: uma fracao acima do personagem (a profundidade dele varia com o y). */
const ABOVE_CARRIER = 0.00005;

export class Block {
  /** (x, y) = centro do quadrado no chao. */
  constructor(scene, x, y, cfg = game.block) {
    this.scene = scene;
    this.cfg = cfg;
    /** Quem esta carregando (Walker) ou null. */
    this.carrier = null;
    /** true quando o bloco ja subiu e acompanha o carregador a cada frame. */
    this.attached = false;

    const s = cfg.size;
    this.shadow = scene.add.ellipse(0, s / 2, s * 1.15, s * 0.4, 0x000000, 0.3);
    this.square = scene.add.rectangle(0, 0, s, s, color(cfg.color)).setStrokeStyle(3, color(cfg.borderColor));
    // Brilho no canto de cima, para parecer um bloco.
    this.shine = scene.add.rectangle(-s / 4, -s / 4, s / 3, s / 6, 0xffffff, 0.35);
    this.container = scene.add.container(x, y, [this.shadow, this.square, this.shine]).setDepth(GROUND_DEPTH);
  }

  /** Centro do bloco agora. */
  get position() {
    return { x: this.container.x, y: this.container.y };
  }

  tweenTo(x, y, duration, ease) {
    return new Promise((resolve) => {
      this.scene.tweens.add({ targets: this.container, x, y, duration, ease, onComplete: resolve });
    });
  }

  /** O personagem pega o bloco: ele sobe ate acima da cabeca e passa a acompanhar. */
  async attachTo(walker) {
    this.carrier = walker;
    this.attached = false;
    this.shadow.setVisible(false);
    this.container.setDepth(walker.sprite.depth + ABOVE_CARRIER);
    await this.tweenTo(walker.sprite.x, walker.sprite.y - this.cfg.carryHeight, 180, "Sine.easeOut");
    if (this.carrier === walker) this.attached = true;
  }

  /** Solta o bloco no chao em (x, y) (centro do quadrado). */
  async dropAt(x, y) {
    this.attached = false;
    this.carrier = null;
    await this.tweenTo(x, y, 240, "Bounce.easeOut");
    this.shadow.setVisible(true);
    this.container.setDepth(GROUND_DEPTH);
  }

  /** Acompanha o carregador (chamar a cada frame, depois de atualizar os personagens). */
  update() {
    if (!this.attached || !this.carrier) return;
    const { sprite } = this.carrier;
    this.container.setPosition(sprite.x, sprite.y - this.cfg.carryHeight);
    this.container.setDepth(sprite.depth + ABOVE_CARRIER);
  }

  destroy() {
    this.scene.tweens.killTweensOf(this.container);
    this.container.destroy();
  }
}
