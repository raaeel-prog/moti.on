# Compatibilidade entre ferramentas — 2026-11-18

Pedido: nenhuma ferramenta, preset ou efeito do Moti.on deve recusar uma camada
só porque outra ferramenta já foi aplicada nela (ex.: morph de texto recusando
texto com Gradiente — `INVALID_SELECTION_TYPE "Use linhas horizontais com quebras manuais."`).

Estado: `IMPLEMENTED_NOT_HOST_VERIFIED` (testes no DOM simulado; falta conferir no AE).

## Inventário

`node scripts/compat-audit.mjs` lista toda recusa do host com código de
seleção/conflito, classificada por motivo (`--json` para máquina):

| categoria | antes | agora | o que é |
|---|---|---|---|
| coexist | 22 | 15 | recusa porque outra ferramenta/efeito/animador está na camada |
| layout | 21 | 20 | exigência de forma do texto (linhas, estilo uniforme) |
| animated-target | 94 | 94 | propriedade-alvo já tem keyframe/expressão |
| edited-rig | 35 | 35 | rig do próprio Moti.on foi editado à mão |
| structure | 269 | 270 | sem comp, sem seleção, camada travada, tipo errado |

## Feito nesta rodada

- `host/src/layer-look.jsx` (`MotionLayerLook.copyEffects`): copia efeitos de
  uma camada para outra com valores, keyframes (com interpolação e ease) e
  expressões; propriedade que o host recusa é pulada sem derrubar a cópia.
- **Morph de palavras** (`text-word-morph.jsx`) e **Revelação de palavras**
  (`text-word-reveal.jsx`): aceitam texto com efeitos e animadores de outras
  ferramentas. Os efeitos são copiados para cada palavra gerada; o texto
  original fica oculto e volta intacto ao remover. Máscaras não bloqueiam mais
  (o original continua com elas).
- **Checagem de linhas** (causa da mensagem da imagem): linhas vazias no fim que
  o AE não mede não bloqueiam mais; linhas de largura zero são ignoradas.
- **Morph variável** (`text-variable-morph.jsx`): convive com animadores e
  efeitos de outras ferramentas (no modo variável ficam no texto; no contorno,
  os efeitos são copiados para a camada do morph) e com máscaras.
- **Biblioteca de presets** (`preset-library.jsx`): aplicar um preset diferente
  troca o anterior no mesmo Desfazer, em vez de "A camada já tem outro preset".

Testes novos: `text-word-morph.test.mjs` (efeito + animador herdados; linha
vazia final) e `preset-premium-motion.test.mjs` (troca de preset).

## Rodada 2

- **Pulso vertical** (`text-vertical-pulse.jsx`): aceita texto com efeitos,
  animadores, máscaras e Position X/Y separada. Os ecos nascem limpos
  (`MotionLayerLook.clearCopiedLook`), os efeitos do pulso ficam nas primeiras
  posições e os efeitos do usuário vão para o eco `core`. Efeito extra que o
  usuário põe num eco não impede mais Ajustar/Remover.
- **Pulso morph** (`text-pulse-morph.jsx`): aceita efeitos, animadores e
  máscaras; efeitos do usuário vão para a camada `matter` (a visível), sem
  levar controles de rigs antigos.
- **Expressões empilhadas** (`host/src/expression-compose.jsx`,
  `MotionExpressionCompose`): sem `eval` (spec §531). A expressão do usuário
  vira uma função cujo resultado é o `value` da expressão do Moti.on. Ligado nos
  presets (`preset-library.jsx`, função `stacked`): `wiggle` + preset de entrada
  funciona; ao remover, a expressão do usuário volta igual. Só recusa expressão
  cuja última instrução é um bloco (`if/for` no fim), com mensagem de como
  resolver. Expressão desativada não bloqueia (volta ao remover).
- **Position X/Y separada nos presets**: o preset reúne as dimensões e separa de
  novo ao remover (ou se a aplicação falhar). Só recusa se X/Y tiver expressão.

## Rodada 3

- **Empilhamento com memória** (`expression-compose.jsx`): `stack`,
  `unstack`, `toolOf`, `userOf`, `accepts`, `stackFor`. A expressão gravada
  guarda na 2ª linha (`// motion-stack:<usuário>:<ferramenta>`) as duas
  origens; reaplicar a ferramenta preserva a do usuário. Expressão desativada
  do usuário é guardada (`:off`) sem rodar.
- **Reconhecedores** (`expression-templates.jsx`): todo `isManaged*` exportado
  olha `toolOf(...)`, então a ferramenta reconhece a própria expressão mesmo
  empilhada.
- Ligado em **Time Controller**, **Loop por marcador**, **Look At**
  (2D e 3D), **Wave** e **Effector**: só recusam expressão que termina em
  bloco (`if/for`), com a correção na mensagem.
- **Jump** grava keyframes: aceita expressão que lê `value` (continua valendo
  por cima do salto); recusa só a que ignora `value`, porque esconderia o salto.
- **Orbit** ficou de fora de propósito: substitui a Position inteira (gira em
  volta de um nulo), então empilhar esconderia a expressão sem efeito.

## Próximas rodadas (ainda recusam)

1. **Câmera e parallax** (`camera-transition`, `parallax-advanced`), **Kinetic**,
   **Tile**, **Flip**, **Anchor Align** e **Neon**: mesmo empilhamento ou a
   regra do `value` do Jump, caso a caso.
2. **Gradiente não gerenciado/duplicado** e **Particles com efeitos extras**:
   aceitar e preservar o que é do usuário.
3. **edited-rig (35)**: oferecer reconstruir o rig preservando os ajustes.
4. Fases de preset (`preset-phases.jsx`) ainda comparam a expressão
   compartilhada exata; conferir se precisam do empilhamento.

## Como conferir no AE

Texto com Gradiente aplicado → Morph de palavras / Revelação / Morph variável:
deve aplicar sem erro, com o gradiente em cada palavra. Camada com preset A →
aplicar preset B: troca sem erro; Ctrl+Z volta ao A.
