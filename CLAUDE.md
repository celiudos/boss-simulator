# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projeto

`boss-simulator`: jogo pixel-art 2D (Phaser 3.90, ES modules, sem bundler/TypeScript), adaptado do antigo `chamar-para-tomar-cafe-simulator` e baseado no [Agent Town](https://github.com/geezerrrr/agent-town). O jogador é o **chefe** e não tem sprite: vê de cima um campo verde dividido em 4 quadrantes (A cima-esquerda, B cima-direita, C baixo-esquerda, D baixo-direita) onde passeiam 3 personagens com personalidades diferentes (Bia, Juca e Rita). Ele conversa com cada um por **chat livre** e tenta convencê-lo a fazer algo; por enquanto a única ação é **levar o bloco** de um quadrante a outro. Não há objetivo nem vitória. As respostas vêm de um modelo local no Ollama (`gemma4:e2b`). Textos, comentários e commits são em português (pt-BR). O `README.md` resume a ideia do jogo; o `TODO.md` guarda os pedidos/requisitos históricos.

## Comandos

- `npm start` (ou `npm run dev`): `scripts/serve.mjs` sobe o jogo com live-reload em `http://localhost:3000` (também na LAN) e um proxy do Ollama na porta 3005. Aceita `--no-browser`.
- `npm test`: `node --test` roda os testes de `test/`. O Phaser é carregado via `<script>` de `node_modules` no `index.html` e o resto roda direto como módulos no navegador; não há build nem linter.
- Requer o Ollama rodando localmente com o modelo `gemma4:e2b` instalado (`ollama pull gemma4:e2b`).
- `?debug` na URL expõe a cena em `__SCENE__` (ex.: `__SCENE__.deliverBlock("juca", "A")` no console, que pula o chat e executa a entrega). `__GAME__` é o `Phaser.Game`.

## Arquitetura

**Configuração central (`config/`)**: `config/game.js` concentra tudo ajustável (identidade, tela, câmera, `field`, `crew`, `block`, áudio, Ollama, limites do chat, respostas prontas); `config/characters.js` define os personagens (nome, gênero, cargo, sprite, quadrante de casa `home`, arquivo de persona). Tudo é importado via `config/index.js`. Prefira mudar valores aqui a espalhar constantes.

**Fluxo de boot (`game/main.js`)**: carrega fontes e personas em paralelo → cria o `Phaser.Game` com a `FieldScene` por trás → `runLoading()` (`game/loading.js`, card com o status do Ollama) só libera o jogo no clique em "Começar" (que também libera o áudio) → `initHud()` (`game/hud.js`, DOM puro).

**Cena e entidades**: `FieldScene` desenha o campo com `Graphics` (sem Tiled), cria uma `NavGrid` sem obstáculos, o `Block` e um `Walker` por personagem. Cada `Walker` (`extends Worker`: nome, ponto de status, emotes e balão; sem física) anda sozinho com A* **só dentro do quadrante de casa** (`field.js` → `inset`, `NavGrid.randomWalkableIn`). Clicar no sprite (sem arrastar a câmera) emite `chat:open`; `CameraController` mostra o campo inteiro, arrasta com o botão esquerdo, dá zoom na roda e expõe `dragged` para separar clique de arrasto. A cena e o HUD se comunicam pelo barramento `game/events.js` (`gameEvents.emit/on`; `on` reentrega o último valor emitido):

| Evento | Quem emite | Conteúdo |
|---|---|---|
| `crew` | cena | personagens para a barra do topo |
| `world` | cena | `World.snapshot()` (bloco, carregador, histórico) a cada mudança |
| `chat:open` | cena | `{ characterId }` ao clicar num personagem |
| `character:thinking` / `character:reply` | HUD | emote "..." enquanto o modelo responde / balão de fala |
| `order:start` | HUD | `{ id, destination }`: a cena executa `deliverBlock` |

**Módulos puros (testáveis em Node)**: `field.js` (geometria dos quadrantes), `world.js` (estado: onde está o bloco, quem o carrega, histórico), `orders.js` (`validateOrder`, `resolveReply`), `prompt.js` (prompt, formato, `parseReply`, `toOrder`, `buildStateNote`), `personas.js` (`parsePersona`), `NavGrid.js` (A*). Mantenha a lógica nova do jogo nesses módulos, só com import de `config/`. `ollama.js` lê `location` ao carregar e **não roda no Node**; por isso `conversation.js`, `hud.js` e as cenas ficam sem teste unitário.

**Personas** (leia `personas/README.md` antes de mexer): `personas/<id>.md` (front-matter `dica`, Personalidade, Jeito de falar, **Como convencer**) + `config/characters.js`, parseadas por `game/personas.js`. Viram o system prompt em `game/prompt.js` (`buildSystemPrompt`), que acrescenta o campo, os quadrantes e a casa do personagem. Mantenha tudo curto: o prompt inteiro vai em toda mensagem.

**Chat e ordens**: `game/ollama.js` é um cliente mínimo (`checkOllama`, `chatStream`, `generateJson`). O modelo responde JSON estruturado `{aceitou, acao, destino, fala}` (`REPLY_FORMAT`), com `acao` ∈ {`nenhuma`, `levar_bloco`} e `destino` ∈ {`A`,`B`,`C`,`D`,`nenhum`} como enums; a ordem das chaves importa (`aceitou` antes de `fala`, melhor coerência no gemma4:e2b).
- **Quem decide se o personagem aceita é o modelo** (pela persona). **O código só confere se a ação é possível**: `validateOrder` recusa destino inexistente, bloco que já está no destino e bloco que alguém já está levando, com o motivo em pt-BR.
- `conversation.send(pergunta, onText, getWorld)` devolve `{ text, order, rejected, stats }`. A ordem só existe se `aceitou && acao === "levar_bloco" && destino ∈ A–D` (`toOrder`) **e** passa na validação (`resolveReply`). O HUD então emite `order:start`; se foi recusada, mostra a linha de sistema "Pedido não executado: …" no chat.
- O histórico guarda o **resultado real** no mesmo JSON (ordem recusada volta ao modelo como `aceitou: false`). Linhas de sistema do chat (`role: "system"`) nunca vão para o modelo.
- A cada mensagem, a última fala do chefe leva a "Nota do jogo" (`buildStateNote`: onde está o bloco e quem o carrega), e a fala do chefe vai citada (`Chefe: "…"`) para não ser confundida com instrução.
- Limites de 1000 caracteres por pergunta/resposta e janela de histórico em `game.chat`. Modelo, `keep_alive`, `num_ctx` e demais opções são os mesmos em todas as chamadas: mudar `num_ctx` recarrega o modelo. `game.ollama.instances` define quantas cópias do modelo usar (cada uma ~3 GB de VRAM): a 1ª é o Ollama padrão e as outras são `ollama serve` extras que o `serve.mjs` sobe em `extraInstanceBasePort`+; `ollama.js` manda cada pedido para a instância menos ocupada e ignora as que não responderem.

**Entrega do bloco** (`FieldScene.deliverBlock`): `World.startDelivery` valida de novo (fonte única da verdade) → o personagem para de passear (`engage`) → anda até o bloco, pega (`Block.attachTo`, acima da cabeça) → leva até o centro do destino na velocidade `crew.carrySpeed` e solta (`Block.dropAt`) → `World.finishDelivery` → volta para casa e retoma o passeio. Se algo interrompe, `dropBlockHere` solta o bloco onde o personagem está e `World.abortDelivery` libera a próxima ordem.

**Para criar uma nova ação**: acrescente o valor em `ACTIONS` (`prompt.js`) e explique-a no `buildSystemPrompt`; trate-a em `toOrder`/`validateOrder`/`resolveReply`; adicione o handler na cena (como `deliverBlock`) e o evento no HUD; escreva os testes em `test/`.

**HUD (`game/hud.js`)**: topo com as pills dos personagens (clique abre o chat) e as ferramentas (música, Ollama, **Ordens** com o histórico de entregas, Equipe); base com o status do Ollama, modelo, pill do bloco (`Bloco: D` / `Bloco: Juca → A`), ocupados e o medidor de contexto (CTX); dock do chat à direita.

**Servidor (`scripts/serve.mjs`)**: live-server (observa `index.html`, `style.css`, `game`, `config`, `personas`) + proxy HTTP que só libera `GET /api/tags` e `POST /api/chat` e remove `Origin`/`Referer`, porque o Ollama só escuta em `127.0.0.1:11434` e recusa origens externas (instâncias extras via `/i/<n>/api/...`). Quando o jogo é aberto por um IP da rede, `ollama.js` usa automaticamente esse proxy (`viaLanProxy`).

## Testes

`npm test` cobre `field`, `NavGrid`, `world`/`orders`/`resolveReply`, `prompt` (formato, nota de estado, `parseReply` em stream, `toOrder` em todas as combinações) e `personas` (cada `.md` tem os blocos esperados). Os testes usam respostas do modelo simuladas (`parseReply` de um JSON montado à mão); o comportamento com o modelo real (se Bia/Juca/Rita aceitam e recusam de acordo com a personalidade) precisa ser conferido jogando.

## Assets

Personagens, emotes e ícones (LimeZu Modern Interiors) e a base do jogo (Agent Town, MIT) têm créditos em `config/game.js` → `credits`; mantenha-os ao reaproveitar código/assets. Em `public/characters/` ficam todas as sheets do pacote, mas só as dos personagens de `config/characters.js` são carregadas.
