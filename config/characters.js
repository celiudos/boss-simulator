// Definicao dos personagens.
//
// gender:  "male" | "female"
// sprite:  numero da sheet em public/characters/Premade_Character_48x48_<sprite>.png
// home:    quadrante de casa (A, B, C ou D, ver game/field.js): onde o personagem passeia
// persona: nome do arquivo em /personas (sem .md), com personalidade e jeito de falar.

/** Os tres personagens que recebem as ordens do chefe. */
export const characters = [
  {
    id: "bia",
    name: "Bia",
    gender: "female",
    role: "Assistente administrativa",
    sprite: "02",
    home: "A",
    persona: "bia",
  },
  {
    id: "juca",
    name: "Juca",
    gender: "male",
    role: "Auxiliar de logística",
    sprite: "06",
    home: "B",
    persona: "juca",
  },
  {
    id: "rita",
    name: "Rita",
    gender: "female",
    role: "Engenheira de processos",
    sprite: "04",
    home: "C",
    persona: "rita",
  },
];
