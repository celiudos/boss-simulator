# Projeto

`boss-simulator`: jogo pixel-art 2D (Phaser 3.90, ES modules, sem bundler/TypeScript).

O jogador é o chefe e ele vai dar ordens, via chat livre e textual, para os personagens do jogo.
O jogo ainda não vai ter objetivo.
Serão 3 personagens, cada uma com personalidade diferente.
O jogador vai poder conversar com eles e tentar convencê-los a fazer algo, como carregar um bloco de um ponto a outro do mapa.

# Descrição

O jogo vai ter uma visão aérea, com o jogador vendo os personagens de cima.
O cenário será simples, como um campo verde com delimitações de quadrantes e os personagens serão representados por sprites pixel-art.
Os quadrantes serão delimitados por linhas brancas, e os personagens vão se movimentar dentro desses quadrantes.

# Arquitetura

As respostas vêm de um modelo local no Ollama (`gemma4:e2b`; instale com `ollama pull gemma4:e2b`). Textos, comentários e commits são em português (pt-BR).
O projeto pode ser rodado com `npm start`, que sobe o jogo com live-reload em `http://localhost:3000`, e os testes com `npm test`.
Veja o `CLAUDE.md` para a arquitetura e o `personas/README.md` para criar personagens.
