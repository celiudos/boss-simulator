<!-- Implemente as instruções de `TODO.md` -->

# Contexto

Jogo simples com Ollama.

Leia o `README.md` para entender o projeto.

# Implementado

- Adaptação do `chamar-para-tomar-cafe-simulator` para o `boss-simulator` (v0.1.0, modelo `gemma4:e2b`).
- Modo único, sem escolha de modo, palavra secreta ou vitória; tela inicial simples com o status do Ollama.
- Campo verde 2x2 visto de cima (quadrantes A, B, C e D, linhas brancas), desenhado pelo Phaser.
- Três personagens novos, cada um com um jeito de ser convencido: Bia (puxa-saco, quer reconhecimento), Juca (preguiçoso, só aceita com contrapartida) e Rita (questionadora, exige justificativa). Cada um passeia só no próprio quadrante.
- Chefe sem sprite: clique no personagem (no campo ou na barra do topo) abre o chat livre com o Ollama.
- Um bloco que começa em D: o modelo responde `{aceitou, acao, destino, fala}`; se aceitar, o personagem busca o bloco, carrega acima da cabeça até o centro do destino, solta e volta para casa. O código só valida se a ordem é possível (destino existe, bloco não está lá, ninguém está levando) e mostra o motivo no chat quando recusa.
- HUD: pill do bloco, painel Ordens (histórico de entregas), status "carregando" e respostas prontas no chat.
- Removidos o escritório (mapa Tiled, tilesets, portas, "Press E"), os dois modos antigos e as personas antigas.
- Testes unitários (`npm test`) para campo, grade de navegação, mundo/ordens, prompt e personas.

# Instrução

Os códigos atuais deste repositório eram referentes a um jogo anterior chamado `chamar-para-tomar-cafe-simulator`.
Leia o `CLAUDE.md` para entender este repositório.

Aproveite todo o código existente, mas adapte-o para o novo jogo `boss-simulator`.

Apague o que for necessário, mas não apague nada que seja útil para o novo jogo.
