// Barramento de eventos minimo entre a cena Phaser e o HUD (DOM).
// Eventos (quem emite): "crew" (cena: personagens), "world" (cena: estado do bloco), "chat:open"
// (cena: clique num personagem), "character:thinking" / "character:reply" / "order:start" (HUD).

const target = new EventTarget();
const last = new Map();

export const gameEvents = {
  emit(name, detail) {
    last.set(name, detail);
    target.dispatchEvent(new CustomEvent(name, { detail }));
  },
  /** Assina o evento e, se ele ja ocorreu, entrega o ultimo valor imediatamente. */
  on(name, handler) {
    const listener = (e) => handler(e.detail);
    target.addEventListener(name, listener);
    if (last.has(name)) handler(last.get(name));
    return () => target.removeEventListener(name, listener);
  },
};
