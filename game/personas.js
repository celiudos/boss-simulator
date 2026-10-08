// Personas dos personagens: um arquivo Markdown por personagem em /personas.
//
// A persona descreve a personalidade, o jeito de falar e "Como convencer" (o que faz o personagem
// aceitar ou recusar uma ordem). Profissao e genero vem de config/characters.js.
// Vira o system prompt do chat em game/prompt.js.
//
// Formato (ver personas/README.md):
//   ---
//   dica: resumo publico mostrado no HUD (Equipe)
//   ---
//   # Nome
//   ## Personalidade
//   ## Jeito de falar
//   ## Como convencer
import { game } from "../config/index.js";

/** persona por id do personagem, preenchido por loadPersonas(). */
export const personas = new Map();

/** Separa o cabecalho `chave: valor` (entre linhas ---) do corpo Markdown. Retorna { hint, body }. */
export function parsePersona(markdown) {
  const text = markdown.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta = {};
  let body = text;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    body = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return { hint: meta.dica ?? "", body: body.trim() };
}

/** Persona minima, usada quando o .md nao carrega. */
function fallbackPersona(c) {
  return parsePersona(`# ${c.name}\n\n## Personalidade\n${c.name} é ${c.role} e trabalha com o chefe.`);
}

/** Carrega a persona de cada personagem (config/characters.js -> persona). */
export async function loadPersonas(characters) {
  await Promise.all(
    characters.map(async (c) => {
      const url = `${game.chat.personasPath}/${c.persona ?? c.id}.md`;
      try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        personas.set(c.id, parsePersona(await res.text()));
      } catch (err) {
        console.warn(`[personas] Nao foi possivel carregar ${url}: ${err.message}`);
        personas.set(c.id, fallbackPersona(c));
      }
    }),
  );
  return personas;
}
