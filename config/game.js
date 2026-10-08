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

  // ── Campo (cenario principal) ───────────────────────────
  // Visto de cima, dividido em 4 quadrantes por linhas brancas:
  //   A (cima, esquerda)  B (cima, direita)
  //   C (baixo, esquerda) D (baixo, direita)
  // Desenhado pelo Phaser (game/FieldScene.js); a geometria fica em game/field.js.
  field: {
    /** Canto superior esquerdo e tamanho (px do mundo). Use multiplos de crew.navCell. */
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    /** Faixas de grama alternadas. */
    grass: ["#4c9a3c", "#459136"],
    stripeHeight: 64,
    /** Linhas brancas da borda e das divisoes. */
    lineColor: "#ffffff",
    lineWidth: 4,
    /** Letras A-D no centro de cada quadrante. */
    labelSize: 140,
    labelAlpha: 0.2,
    /** Nome de cada quadrante, para o texto do chat (ex.: "quadrante A (cima, à esquerda)"). */
    labels: {
      A: "cima, à esquerda",
      B: "cima, à direita",
      C: "baixo, à esquerda",
      D: "baixo, à direita",
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
  // Um bloco no campo. Quando o chefe convence alguem, o personagem leva o bloco ate o centro de
  // outro quadrante (game/FieldScene.js -> deliverBlock; as regras ficam em game/orders.js).
  block: {
    /** Quadrante onde o bloco comeca (um que nao seja a casa de ninguem). */
    start: "D",
    /** Lado (px) do quadrado. */
    size: 28,
    color: "#e0a030",
    borderColor: "#5c3a0e",
    /** Distancia (px) do centro do personagem ate o centro do bloco quando ele carrega. */
    carryHeight: 46,
    /** Distancia (px) entre os pes de quem pega/solta o bloco e o centro dele. */
    standGap: 36,
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
