// Conversa do chefe com os personagens usando o modelo local do Ollama.
// Cada personagem tem a propria persona (system prompt, ver /personas e game/prompt.js) e o proprio historico.
//
// O modelo responde { aceitou, acao, destino, fala }. Quem decide se aceita e o modelo; o codigo so
// confere se a ordem e possivel no estado atual do campo (game/orders.js -> resolveReply). O que
// aparece no historico e o resultado REAL: ordem executada ou "Pedido nao executado: <motivo>".
import { game } from "../config/index.js";
import { chatStream } from "./ollama.js";
import { resolveReply } from "./orders.js";
import { personas } from "./personas.js";
import { REPLY_FORMAT, buildMessages, buildStateNote, buildSystemPrompt, parseReply } from "./prompt.js";

const { maxQuestionChars, maxAnswerChars } = game.chat;

export class Conversation {
  constructor(character, persona) {
    this.character = character;
    this.persona = persona;
    this.system = buildSystemPrompt(character, persona);
    /**
     * Historico exibido no chat:
     *  - { role: "user", text }
     *  - { role: "assistant", text, order }  order = { action, destination } se a ordem foi executada
     *  - { role: "system", kind: "order" | "rejected", text }  avisos do jogo (nao vao para o modelo)
     */
    this.entries = [];
    this.pending = false;
    /** Ultimas estatisticas do Ollama (tokens/tempos), usadas no medidor CTX do HUD. */
    this.lastStats = null;
  }

  /** System prompt + ultimas mensagens (as do personagem no mesmo JSON que o modelo deve gerar) + nota do campo. */
  messages(world) {
    return buildMessages(this.system, this.entries, { note: buildStateNote(world, this.character) });
  }

  /** Quantas falas o chefe ja fez (contando a atual). */
  get bossMessages() {
    return this.entries.filter((e) => e.role === "user").length;
  }

  /**
   * Envia a fala do chefe (ate maxQuestionChars) e devolve a resposta do personagem:
   * { text, order, rejected, stats }
   *  - order: { action, destination } se o personagem aceitou e a ordem e possivel (o HUD a executa)
   *  - rejected: { reason } se ele aceitou mas a ordem e impossivel agora
   * `onText` recebe a resposta parcial. `getWorld()` devolve o estado do campo (World.snapshot): e
   * lido antes de perguntar (nota do jogo) e de novo ao receber a resposta (validacao).
   * Em caso de erro a fala sai do historico, para poder ser reenviada.
   */
  async send(question, onText, getWorld) {
    const text = question.trim().slice(0, maxQuestionChars);
    if (!text || this.pending) return null;
    this.entries.push({ role: "user", text });
    this.pending = true;
    try {
      const { content, stats } = await chatStream({
        messages: this.messages(getWorld()),
        format: REPLY_FORMAT,
        onText: (raw) => {
          const partial = parseReply(raw);
          onText?.({ ...partial, text: partial.text.slice(0, maxAnswerChars) });
          return partial.text.length < maxAnswerChars; // chegou no limite: para a geracao
        },
      });
      const reply = parseReply(content);
      reply.text = reply.text.slice(0, maxAnswerChars).trim() || "...";

      const { order, rejected, entries } = resolveReply(reply, getWorld(), this.character);
      this.entries.push(...entries);
      this.lastStats = stats;
      return { text: reply.text, order, rejected, stats };
    } catch (err) {
      this.entries.pop();
      throw err;
    } finally {
      this.pending = false;
    }
  }
}

const conversations = new Map();

/** Conversa (unica) com o personagem; criada na 1a vez com a persona carregada. */
export function conversationFor(character) {
  let conv = conversations.get(character.id);
  if (!conv) {
    conv = new Conversation(character, personas.get(character.id) ?? { body: "" });
    conversations.set(character.id, conv);
  }
  return conv;
}
