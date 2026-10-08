// Configuracoes principais do jogo.
// Edite aqui nome, versao, autor, mapa, camera, audio e opcoes de interacao.
// (Os personagens ficam em ./characters.js)

export const game = {
  // ── Identidade ──────────────────────────────────────────
  name: "boss-simulator",
  version: "0.1.0",
  description:
    "Simulador pixel-art: o chefe da ordens pelo chat (IA local via Ollama) para tres personagens num campo dividido em quadrantes.",
  author: {
    name: "Marcelo Note",
  },
  license: "UNLICENSED",
  language: "pt-BR",

  // ── Creditos (obrigatorios para o que foi reaproveitado) ─
  credits: [
    {
      what: "Cenario, UI e logica base do jogo",
      by: "Agent Town (geezerrrr)",
      url: "https://github.com/geezerrrr/agent-town",
      license: "MIT",
    },
    {
      what: "Tilesets, personagens, emotes e icones (pixel art)",
      by: "LimeZu - Modern Interiors",
      url: "https://limezu.itch.io/moderninteriors",
      license: "Pacote comercial: verifique a licenca antes de publicar",
    },
  ],

  // ── Tela ────────────────────────────────────────────────
  display: {
    width: 1280,
    height: 720,
    /** Fora do campo (a camera mostra so isso quando a janela e maior que o campo). */
    backgroundColor: "#14281a",
  },

  // ── Camera ──────────────────────────────────────────────
  camera: {
    /** Ajusta o zoom inicial para o campo caber na janela. */
    fitToField: true,
    /** Fracao da janela ocupada pelo campo quando fitToField = true. */
    fitMargin: 0.86,
    zoomMin: 0.5,
    zoomMax: 3,
  },

  // ── Projecao isometrica (visao de jogo de estrategia) ───
  // A logica (campo, grade de navegacao, ordens) usa px do CHAO (x, y) e altura z; so o desenho
  // projeta para a tela (game/iso.js):  sx = (x - y)·scale   sy = (x + y)·scale/2 - z·zScale
  iso: {
    /** Fator do chao para a tela (~1/sqrt(2): o losango tem a mesma area do campo, 2:1). */
    scale: 0.7071,
    /** Quantos px de tela sobe 1 px de altura (z). */
    zScale: 1,
    /** Espessura (px de tela) das laterais da plataforma do campo. */
    thickness: 28,
  },

  // ── Campo (cenario principal) ───────────────────────────
  // Plataforma isometrica dividida em 4 quadrantes por linhas brancas. No chao (px logicos) a
  // geometria e um retangulo 2x2 (game/field.js); na tela ele vira um losango:
  //         A            A = no topo
  //       C   B          B = à direita
  //         D            C = à esquerda      D = embaixo
  // Desenhado pelo Phaser (game/FieldScene.js) com a geometria de game/iso.js.
  field: {
    /** Canto (x, y) e tamanho no chao (px logicos). Use multiplos de crew.navCell e de gridCell. */
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    /** Grama em xadrez (celulas da grade alternando as duas cores). */
    grass: ["#4c9a3c", "#459136"],
    /** Lado (px logicos) de cada celula da grade desenhada no chao. */
    gridCell: 64,
    /** Linhas finas da grade. */
    gridColor: "#ffffff",
    gridAlpha: 0.16,
    /** Laterais da plataforma (terra): esquerda (mais clara) e direita (mais escura). */
    sideColors: ["#7a5230", "#5b3c22"],
    /** Linhas brancas da borda e das divisoes. */
    lineColor: "#ffffff",
    lineWidth: 4,
    /** Letras A-D em pe no centro de cada quadrante. */
    labelSize: 96,
    labelAlpha: 0.22,
    /** Onde cada quadrante aparece na tela, para o texto do chat (ex.: "quadrante A (no topo)"). */
    labels: {
      A: "no topo",
      B: "à direita",
      C: "à esquerda",
      D: "embaixo",
    },
  },

  // ── Personagens andando pelo campo ──────────────────────
  crew: {
    /** Velocidade (px/s) andando. */
    walkSpeed: 70,
    /** Velocidade (px/s) carregando o bloco. */
    carrySpeed: 55,
    /** Lado (px) de cada celula da grade de navegacao. */
    navCell: 20,
    /** Pausa (ms) parado entre uma caminhada e outra: [min, max]. */
    wanderPauseMs: [1200, 4500],
    /** Folga (px) entre o passeio e as linhas do quadrante de casa. */
    homeInset: 40,
    /** Distancia minima (px) que cada um tenta manter dos outros ao escolher onde parar. */
    personalSpace: 72,
    /** Duracao minima (ms) do balao de fala; respostas longas ficam mais tempo (ms por caractere). */
    bubbleMs: 4500,
    bubbleMsPerChar: 60,
    /** O balao corta falas maiores que isso com "..." (o chat mostra a fala inteira). */
    bubbleMaxChars: 200,
  },

  // ── Bloco ───────────────────────────────────────────────
  // Um cubo no campo. Quando o chefe convence alguem, o personagem leva o bloco ate o centro de
  // outro quadrante (game/FieldScene.js -> deliverBlock; as regras ficam em game/orders.js).
  block: {
    /** Quadrante onde o bloco comeca (um que nao seja a casa de ninguem). */
    start: "D",
    /** Lado da base (px logicos do chao) e altura (px de altura z) do cubo. */
    size: 32,
    height: 30,
    /** Faces do cubo: topo (iluminado), esquerda e direita (sombra), e o contorno. */
    topColor: "#f2b84a",
    leftColor: "#e0a030",
    rightColor: "#b07a1c",
    borderColor: "#5c3a0e",
    /** Altura (z) da base do cubo quando carregado: fica acima da cabeca do personagem. */
    carryHeight: 76,
    /**
     * Onde ficam os pes de quem pega/solta o bloco, em relacao ao centro dele (px logicos).
     * +y no chao = mais para a frente e para a esquerda na tela: o personagem nao fica escondido.
     */
    standOffset: { x: 0, y: 40 },
  },

  // ── Audio ───────────────────────────────────────────────
  audio: {
    bgm: "/public/audio/bgm.mp3",
    defaultVolume: 0.45,
    storageKey: "boss-simulator:bgm-volume",
  },

  // ── IA local (Ollama) ───────────────────────────────────
  ollama: {
    /**
     * Ollama desta maquina. Aberto por localhost, o navegador chama a API direto
     * (o Ollama libera CORS para localhost/127.0.0.1).
     */
    baseUrl: "http://127.0.0.1:11434",
    /**
     * Aberto pelo IP da rede (LAN), o navegador usa o proxy que o `npm start` sobe nesta porta
     * (scripts/serve.mjs), que repassa as chamadas para o `baseUrl`.
     */
    lanProxyPort: 3005,
    model: "gemma4:e2b",
    /**
     * Quantas instancias do modelo usar (cada uma ocupa ~3 GB de VRAM: 6 GB = 2). A 1a e o Ollama
     * padrao (`baseUrl`); as demais sao `ollama serve` extras que o `npm start` sobe nas portas
     * `extraInstanceBasePort`, +1, +2... Os pedidos vao sempre para a instancia menos ocupada.
     * Se alguma nao subir ou nao couber na VRAM, o jogo segue com as que carregaram.
     */
    instances: 1,
    extraInstanceBasePort: 11435,
    /** Mantem o modelo carregado entre as mensagens (o 1o carregamento leva alguns segundos). */
    keepAlive: "30m",
    /** Desliga o modo "thinking" do Gemma 4: a resposta comeca na hora. */
    think: false,
    /**
     * Opcoes do modelo. Contexto pequeno e limite de tokens deixam a resposta rapida.
     * O aquecimento usa as mesmas opcoes, assim o modelo nao e recarregado na 1a mensagem.
     */
    options: {
      num_ctx: 4096,
      /** ~1000 caracteres em portugues + o JSON da resposta. */
      num_predict: 340,
      temperature: 0.6,
      top_k: 40,
      top_p: 0.9,
    },
    /** Carrega o modelo na memoria assim que o jogo abre. */
    warmUp: true,
  },

  // ── Chat com os personagens ─────────────────────────────
  chat: {
    /** Pasta com uma persona (Markdown) por personagem: <personasPath>/<persona>.md */
    personasPath: "/personas",
    maxQuestionChars: 1000,
    maxAnswerChars: 1000,
    /** Quantas mensagens anteriores vao para o modelo junto com a persona (menos = mais rapido). */
    historyMessages: 8,
    /**
     * Opcoes prontas do chat. `label` e o texto do botao; `text` e o que o chefe diz ao clicar.
     * Com `always: true` o botao fica sempre disponivel; sem isso, so aparece para iniciar a conversa.
     */
    quickReplies: [
      {
        id: "block",
        label: "Leva o bloco?",
        text: "Você pode levar o bloco para outro quadrante?",
        always: true,
      },
      {
        id: "status",
        label: "Tudo certo aí?",
        text: "Oi! Tudo certo por aí? Como está o dia?",
        always: true,
      },
    ],
  },
};
