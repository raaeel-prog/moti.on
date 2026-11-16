# ADR 0005 — Fases v3: efeito contínuo empilhado com Entrada e Saída

- **Status:** aceita; implementada em 14/10/2026
- **Data:** 2026-10-14
- **Escopo:** `ae.presets.apply`, `ae.presets.phase-apply`, `ae.presets.phase-adjust`, `ae.presets.phase-action` e `ae.presets.phase-timing` da §13.1 do `MASTER_BUILD_SPEC.md`

## Situação

As fases v2 (`[Moti.on.library.v2]`) guardam até dois slots, Entrada e Saída, numa raiz no comentário da camada. As contribuições de cada slot são combinadas numa só expressão por propriedade: Position e rotações somam, Scale e Opacity multiplicam.

Um preset contínuo (loop) ou estático (look) era sempre uma instância v1 isolada. Por isso, `preset-phases.jsx` recusava aplicar Entrada ou Saída sobre ele ("Remova o efeito contínuo…"), e `preset-library.jsx` recusava um loop sobre uma camada com outro preset.

O estudo do Animation Composer 4 com REA (T1 em `docs/research/2026-10-12-ac4-badfx-rea.md`) mostrou o fluxo que os motion designers esperam:
- Entrada, Saída e Efeito convivem na mesma camada.
- Cada um é cronometrado por um marcador; o Efeito usa um marcador com duração.

## Decisão

1. **Raiz versão 3.** A tag passa a ser `[Moti.on.library.v3]`. A raiz ganha um terceiro slot, `effect`, com instância `<raiz>-3`, ao lado de `in` (`-1`) e `out` (`-2`).
   - Os slots `in`/`out` só aceitam receitas `transition`; o slot `effect` só aceita `continuous` ou `static`.
   - O prefixo das expressões compartilhadas inclui a versão (`// Moti.on phases v3:`).
   - Raízes v2 continuam legíveis com o prefixo antigo. São regravadas como v3 na próxima edição, e o rollback de uma edição devolve a raiz v2 intacta.
   - Uma versão anterior do painel não reconhece a tag v3. Ela trata a camada como sem preset em vez de editar parcialmente uma raiz que não entende.
2. **Janela do Efeito.** Um marcador gerenciado `Moti.on Efeito` (`Moti.on Effect` em inglês) traz `Moti.on.instance` da raiz e `Moti.on.phase = "effect"`. Ele tem `MarkerValue.duration`.
   - Padrão: a camada inteira. O início avança um frame por vez, até 10 frames, quando um marcador do usuário ou outro cue ocupa o primeiro frame.
   - Arrastar o marcador ou a duração no After Effects reprograma a janela ao vivo.
   - Ajustar e trocar a receita conservam a janela posicionada à mão, mantida dentro da camada. Restaurar volta à camada inteira.
   - Colisões com marcadores do usuário ou com o cue de Entrada/Saída são recusadas antes de mutar.
3. **Sem estalo nas bordas.** A função compartilhada `libraryEffectWindow(time, start, end, ramp)` devolve `[envelope, idade]`:
   - rampas smoothstep de até 6 frames nas duas bordas;
   - a idade integra o envelope, então o loop acelera e desacelera;
   - antes da janela o efeito é nulo; depois dela a idade fica parada.

   A Intensidade é multiplicada pelo envelope. A exceção é a rotação contínua (`spin`), que desacelera até parar e mantém o último ângulo, em vez de desenrolar centenas de graus em poucos frames.
4. **Comandos.**
   - Os comandos de fase aceitam `phase: "effect"` (schema `presetPhaseAdjustArgs`, `presetPhaseActionArgs`, `presetPhaseTimingArgs`). No slot `effect`, `options.phase` mantém o valor que a receita contínua sempre teve.
   - `ae.presets.apply` de um loop/look continua criando a instância v1 isolada numa camada limpa, o que preserva Converter em keyframes. Ele passa a delegar às fases quando alguma camada selecionada já tem uma raiz de fases ou uma transição v1.
   - Aplicar Entrada/Saída sobre um loop v1 migra o loop para o slot `effect`, em vez de recusar.
5. **Sem sistema paralelo (§31).** O render reusa `applyLayer`, `combine()`/`contribution()`, `removeLayer`, `liveValues` e o mesmo rollback transacional de fases.

## Consequências

- O editor de fases mostra a linha "Efeito" com Intensidade, Direção, Velocidade, Variação e texto, sem Duração nem Curva. Ele indica a janela em frames e desloca o cue com `phase-timing`.
- O arraste nativo de parâmetros (`plugin/gesture`) valida só `in`/`out` e seis parâmetros. O painel não oferece arraste ao vivo no Efeito nem nos campos de Ricochete/Quique; a digitação continua disponível.
- Converter em keyframes segue sem suporte a camadas com fases (limitação anterior).
- Camadas limpas que entram num lote delegado às fases recebem uma raiz só com o Efeito.
- Evidência: `docs/implementation/2026-10-14-stacked-effects.md`.
