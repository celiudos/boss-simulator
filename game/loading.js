// Tela inicial: confere o Ollama e espera o jogador apertar "Comecar".
// O clique tambem libera o audio no navegador (a musica comeca depois dele).
import { game } from "../config/index.js";
import { checkOllama } from "./ollama.js";
import { OLLAMA_STATUS, esc } from "./hud.js";

const TIP = "Clique em um personagem para conversar. Convença-o, pelo chat, a levar, empilhar ou montar uma torre ou parede com os blocos.";

/** Mostra a tela inicial e resolve quando o jogador comeca. */
export async function runLoading() {
  const root = document.getElementById("loading");
  const $ = (id) => document.getElementById(id);
  const subtitle = $("loading-subtitle");
  const ollama = $("loading-ollama");
  const start = $("loading-start");
  $("loading-tip").textContent = TIP;

  const showStatus = (key, detail = "") => {
    const s = OLLAMA_STATUS[key];
    ollama.innerHTML = `<span class="pixel-dot pixel-dot--${s.dot}"></span><span>${esc(s.label)}</span>${detail ? `<small>${detail}</small>` : ""}`;
  };

  subtitle.textContent = "Procurando o Ollama...";
  showStatus("checking");
  const { online, hasModel, error } = await checkOllama();
  if (!online) {
    subtitle.textContent = "Ollama indisponível: abra o Ollama (ou rode \"ollama serve\") para os personagens responderem.";
    showStatus("offline", error ? esc(error) : "");
  } else if (!hasModel) {
    subtitle.textContent = "Modelo não encontrado.";
    showStatus("missing", `Rode <code>ollama pull ${esc(game.ollama.model)}</code>`);
  } else {
    subtitle.textContent = "Tudo pronto!";
    showStatus("online");
  }
  root.dataset.ready = "true";

  start.hidden = false;
  start.focus();
  await new Promise((resolve) => {
    const go = () => {
      window.removeEventListener("keydown", onKey);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === "Enter") go();
    };
    start.addEventListener("click", go, { once: true });
    window.addEventListener("keydown", onKey);
  });

  root.classList.add("loading--out");
  setTimeout(() => root.remove(), 500);
}
