import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { characters, game } from "../config/index.js";
import { parsePersona } from "../game/personas.js";

const dir = new URL("../personas/", import.meta.url);

test("cada personagem tem uma persona com dica, corpo e 'Como convencer'", () => {
  assert.equal(characters.length, 3);
  for (const c of characters) {
    const p = parsePersona(readFileSync(new URL(`${c.persona ?? c.id}.md`, dir), "utf8"));
    assert.ok(p.hint.length > 10, `${c.id}: dica`);
    assert.ok(p.body.includes("## Personalidade"), `${c.id}: personalidade`);
    assert.ok(p.body.includes("## Jeito de falar"), `${c.id}: jeito de falar`);
    assert.ok(p.body.includes("## Como convencer"), `${c.id}: como convencer`);
    assert.ok(p.body.startsWith(`# ${c.name}`), `${c.id}: titulo com o nome`);
    assert.ok(!/Cen[aá]rios|palavra secreta/i.test(p.body), `${c.id}: sem resquicios do jogo antigo`);
  }
});

test("nao sobra persona sem personagem", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.deepEqual(files.sort(), characters.map((c) => `${c.persona ?? c.id}.md`).sort());
});

test("persona curta: o prompt inteiro vai em toda mensagem", () => {
  for (const c of characters) {
    const { body } = parsePersona(readFileSync(new URL(`${c.persona ?? c.id}.md`, dir), "utf8"));
    assert.ok(body.length < 1200, `${c.id}: ${body.length} caracteres`);
  }
});

test("parsePersona separa o cabecalho do corpo e aceita CRLF", () => {
  const p = parsePersona("---\r\ndica: Resumo aqui\r\n---\r\n# Fulano\r\n\r\n## Personalidade\r\nCalmo.\r\n");
  assert.equal(p.hint, "Resumo aqui");
  assert.ok(p.body.startsWith("# Fulano"));
  assert.ok(!p.body.includes("\r"));
  assert.equal(parsePersona("# Sem cabecalho").hint, "");
});

test("config: identidade e modelo do boss-simulator", () => {
  assert.equal(game.name, "boss-simulator");
  assert.equal(game.version, "0.1.0");
  assert.equal(game.ollama.model, "gemma4:e2b");
});
