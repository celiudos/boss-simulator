// Portado de agent-town (MIT): components/game/systems/CameraController.ts
// Adaptado: sem personagem para seguir (o chefe nao tem sprite): a camera mostra o campo inteiro,
// o jogador arrasta (botao esquerdo) e da zoom com a roda. `dragged` diferencia um clique de um arrasto.
import { game } from "../config/index.js";
import { CAMERA_DRAG_THRESHOLD, ZOOM_SENSITIVITY } from "./constants.js";

export class CameraController {
  /** `area` = { x, y, width, height } do campo (em px do mundo). */
  constructor(scene, area) {
    this.scene = scene;
    this.area = area;
    this.mapWidth = area.width;
    this.mapHeight = area.height;
    this.cameraDragging = false;
    /**
     * true se o botao esquerdo atual (ou o ultimo) andou mais que CAMERA_DRAG_THRESHOLD: quem trata
     * cliques deve ignora-lo. Volta a false no proximo pointerdown.
     */
    this.dragged = false;
    /** true depois que o jogador mexe no zoom ou arrasta a camera. */
    this.userMoved = false;
  }

  /** Zoom em que o campo inteiro cabe na janela (com margem para o HUD). */
  fitZoom() {
    const { fitMargin, zoomMin, zoomMax } = game.camera;
    const cam = this.scene.cameras.main;
    const z = Math.min(cam.width / this.mapWidth, cam.height / this.mapHeight) * fitMargin;
    return Phaser.Math.Clamp(z, zoomMin, zoomMax);
  }

  /** Centro do campo. */
  get center() {
    return { x: this.area.x + this.area.width / 2, y: this.area.y + this.area.height / 2 };
  }

  init() {
    const cam = this.scene.cameras.main;
    cam.setBackgroundColor(game.display.backgroundColor);
    cam.setRoundPixels(true);
    cam.setZoom(game.camera.fitToField ? this.fitZoom() : 0.82);
    this.updateCameraBounds();
    cam.centerOn(this.center.x, this.center.y);

    this.scene.scale.on("resize", () => {
      if (this.userMoved) {
        this.updateCameraBounds();
        return;
      }
      if (game.camera.fitToField) cam.setZoom(this.fitZoom());
      this.updateCameraBounds();
      cam.centerOn(this.center.x, this.center.y);
    });
    this.initWheel(cam);
    this.initCameraDrag(cam);
  }

  initWheel(cam) {
    const canvas = this.scene.game.canvas;
    const { zoomMin, zoomMax } = game.camera;
    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      const oldZoom = cam.zoom;
      const newZoom = Phaser.Math.Clamp(oldZoom - delta * ZOOM_SENSITIVITY, zoomMin, zoomMax);
      if (newZoom === oldZoom) return;
      this.userMoved = true;

      // O zoom segue o ponteiro: o ponto do campo sob o mouse continua sob o mouse.
      const sx = e.offsetX / cam.scaleManager.displayScale.x;
      const sy = e.offsetY / cam.scaleManager.displayScale.y;
      const before = cam.getWorldPoint(sx, sy);
      cam.setZoom(newZoom);
      this.updateCameraBounds();
      const after = cam.getWorldPoint(sx, sy);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    this.scene.events.once("shutdown", () => canvas.removeEventListener("wheel", onWheel));
  }

  initCameraDrag(cam) {
    let downX = 0;
    let downY = 0;
    let lastX = 0;
    let lastY = 0;
    this.scene.input.on("pointerdown", (pointer) => {
      if (!pointer.leftButtonDown()) return;
      this.cameraDragging = true;
      this.dragged = false;
      downX = lastX = pointer.x;
      downY = lastY = pointer.y;
    });
    this.scene.input.on("pointermove", (pointer) => {
      if (!this.cameraDragging || !pointer.leftButtonDown()) return;
      if (!this.dragged && Math.hypot(pointer.x - downX, pointer.y - downY) <= CAMERA_DRAG_THRESHOLD) return;
      this.dragged = true;
      this.userMoved = true;
      cam.scrollX += (lastX - pointer.x) / cam.zoom;
      cam.scrollY += (lastY - pointer.y) / cam.zoom;
      lastX = pointer.x;
      lastY = pointer.y;
    });
    this.scene.input.on("pointerup", () => {
      this.cameraDragging = false;
    });
  }

  /** Centraliza o campo quando o viewport e maior que ele no zoom atual. */
  updateCameraBounds() {
    const cam = this.scene.cameras.main;
    const viewW = cam.width / cam.zoom;
    const viewH = cam.height / cam.zoom;
    const { x, y } = this.area;
    const bx = viewW > this.mapWidth ? x - (viewW - this.mapWidth) / 2 : x;
    const by = viewH > this.mapHeight ? y - (viewH - this.mapHeight) / 2 : y;
    const bw = viewW > this.mapWidth ? viewW : this.mapWidth;
    const bh = viewH > this.mapHeight ? viewH : this.mapHeight;
    cam.setBounds(bx, by, bw, bh);
  }
}
