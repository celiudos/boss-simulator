# Personas

Cada personagem de `config/characters.js` aponta para um arquivo desta pasta
(`persona: "bia"` → `personas/bia.md`).

No `boss-simulator` o jogador é o chefe e conversa livremente com Bia, Juca e Rita, tentando
**convencê-los a fazer algo** (hoje: levar o bloco de um quadrante a outro). Cada persona define
**quem a pessoa é** e, principalmente, **o que a convence ou não**: é isso que faz os três
reagirem de jeitos diferentes ao mesmo pedido.

| Personagem | Perfil | Como se convence |
|---|---|---|
| Bia | Prestativa e puxa-saco, quer ser a funcionária do mês | Aceita fácil, mas pede reconhecimento |
| Juca | Preguiçoso e negociador, sempre com uma desculpa | Só aceita com contrapartida (pausa, folga, café) |
| Rita | Questionadora, quer saber o porquê de tudo | Exige uma justificativa que faça sentido |

A parte fixa (profissão, gênero, sprite e quadrante de casa) vem de `config/characters.js`; o
`.md` traz personalidade e jeito de falar. Os dois viram o _system prompt_ do personagem
(`game/prompt.js` → `buildSystemPrompt`), que acrescenta o campo, os quadrantes e o formato da
resposta.

## Formato

```markdown
---
dica: Resumo público e fixo, mostrado no painel Equipe do HUD.
---

# Nome

## Personalidade
## Jeito de falar
## Como convencer
```

- `dica`: uma linha, mostrada no painel **Equipe**.
- `# Nome`: o mesmo `name` de `config/characters.js` (o teste confere).
- **Personalidade**: quem é a pessoa e o que ela quer.
- **Jeito de falar**: tom, vocabulário e cacoetes.
- **Como convencer**: o que a faz aceitar ou recusar uma ordem. O prompt manda o modelo seguir
  esta seção para decidir `aceitou`; escreva em termos concretos (o que o chefe precisa dizer ou
  oferecer) e diga o que acontece sem isso.

Mantenha tudo curto (o teste limita a persona a 1200 caracteres): ela vai inteira em toda
mensagem, e menos texto deixa a resposta mais rápida e o contexto (`num_ctx`) folgado.

## Quem decide

O modelo decide se o personagem **aceita**, olhando a persona. O código só confere se a ação é
**possível** (`game/orders.js`): o destino existe, o bloco não está lá e ninguém o está levando.
Se o modelo aceitar algo impossível, o chat mostra "Pedido não executado: …" e o histórico guarda
que ele **não** aceitou. Detalhes em `CLAUDE.md`.

## Criar ou trocar um personagem

1. Crie `personas/<id>.md` no formato acima.
2. Acrescente (ou troque) a entrada em `config/characters.js`: `id`, `name`, `gender`, `role`,
   `sprite` (número da sheet em `public/characters/`), `home` (quadrante A–D de cada um) e `persona`.
3. Rode `npm test`: o teste de personas confere o formato e se não sobra `.md` sem personagem.

O jogo recarrega sozinho (`npm start`) ao salvar um arquivo desta pasta.
