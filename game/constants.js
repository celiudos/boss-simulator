// Constantes do motor, portadas de geezerrrr/agent-town (MIT):
// lib/constants.ts, components/game/config/{animations,emotes}.ts
// Valores do jogo (nome, campo, camera, audio, personagens) ficam em /config.

/** Os assets ficam em /public (o servidor serve a raiz do projeto). */
export const PUBLIC_PATH = "/public";

// ── Sprites de personagem (48x96, 56 colunas) ─────────────
// Linha 1: idle  - right(6) up(6) left(6) down(6)
// Linha 2: walk  - right(6) up(6) left(6) down(6)
export const FRAME_WIDTH = 48;
export const FRAME_HEIGHT = 96;
export const SHEET_COLUMNS = 56;
export const FRAMES_PER_DIR = 6;
export const PORTRAIT_FRAME_INDEX = SHEET_COLUMNS + 18; // idle-down, 1o frame

/** Corpo nos pes do personagem (fracao do frame): a grade de navegacao usa esse retangulo. */
export const BODY_SIZE_RATIO_W = 0.5;
export const BODY_SIZE_RATIO_H = 0.2;
export const BODY_OFFSET_RATIO_X = 0.25;
export const BODY_OFFSET_RATIO_Y = 0.75;

export const DIRECTIONS = ["right", "up", "left", "down"];

/** Distancia (px de tela) que o mouse precisa andar com o botao apertado para virar arrasto da camera. */
export const CAMERA_DRAG_THRESHOLD = 4;
export const ZOOM_SENSITIVITY = 0.001;

/** Anima "idle"/"walk" de uma linha da sheet: chaves "<spriteKey>:idle-down", "<spriteKey>:walk-left"... */
export function makeAnims(spriteKey, prefix, row, frameRate) {
  return DIRECTIONS.map((dir, i) => ({
    key: `${spriteKey}:${prefix}-${dir}`,
    start: row * SHEET_COLUMNS + i * FRAMES_PER_DIR,
    end: row * SHEET_COLUMNS + i * FRAMES_PER_DIR + FRAMES_PER_DIR - 1,
    frameRate,
    repeat: -1,
  }));
}

// ── Emotes (sheet 480x480, 10x10 de 48x48) ────────────────
export const EMOTE_SHEET_KEY = "emotes";
export const EMOTE_SHEET_PATH = `${PUBLIC_PATH}/sprites/emotes_48x48.png`;
export const EMOTE_FRAME_SIZE = 48;
export const EMOTE_Y_OFFSET = 0.55;
export const BUBBLE_Y_OFFSET = 0.45;

export const EMOTE_ANIMS = [
  { key: "emote:sleep", frames: [56, 57], frameRate: 2, repeat: -1 },
  { key: "emote:thinking", frames: [52, 53], frameRate: 2, repeat: -1 },
  { key: "emote:alert", frames: [40, 41], frameRate: 4, repeat: 3 },
  { key: "emote:fail", frames: [50, 51], frameRate: 4, repeat: 3 },
  { key: "emote:heart", frames: [54, 55], frameRate: 2, repeat: 3 },
  { key: "emote:star", frames: [64, 65], frameRate: 3, repeat: 3 },
  { key: "emote:music", frames: [66, 67], frameRate: 3, repeat: -1 },
  { key: "emote:confused", frames: [62, 63], frameRate: 2, repeat: -1 },
  { key: "emote:angry", frames: [70, 71], frameRate: 3, repeat: 3 },
  { key: "emote:wrench", frames: [74, 75], frameRate: 2, repeat: -1 },
  { key: "emote:device", frames: [58, 59], frameRate: 2, repeat: -1 },
  { key: "emote:dots", frames: [92, 93], frameRate: 2, repeat: -1 },
];

// ── Emotes aleatorios enquanto o personagem esta a toa ────
export const WANDER_MIN_DELAY = 3000;
export const WANDER_MAX_DELAY = 10000;
export const WANDER_INITIAL_MIN = 500;
export const WANDER_INITIAL_MAX = 4000;

export const ACTIVITIES = [
  { emote: "emote:music", minDuration: 2500, maxDuration: 5000 },
  { emote: "emote:thinking", minDuration: 3000, maxDuration: 6000 },
  { emote: "emote:device", minDuration: 3000, maxDuration: 6000 },
  { emote: "emote:star", minDuration: 2000, maxDuration: 3500 },
  { emote: "emote:confused", minDuration: 2500, maxDuration: 4500 },
  { emote: "emote:heart", minDuration: 2000, maxDuration: 3500 },
];
