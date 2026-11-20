# Plano — Ferramentas de um clique, página de edição e Wiggle premium (2026-11-19)

Estado: **PROPOSTA — nada implementado**. Prévia interativa publicada como artifact (link na conversa).

## 1. O que o usuário pediu

1. Ferramentas rápidas (Wiggle, Flicker e outras) aplicam **com um clique**, já com um preset padrão premium.
2. Depois de aplicar, aparece **um botão ao lado da busca** da aba Ferramentas que leva a uma **interface de edição** com todos os parâmetros do efeito aplicado. Sem a gaveta lateral.
3. Ferramentas que precisam de escolhas antes (ex.: Gradiente de texto) abrem uma **página própria**, com botão Voltar, mais completa e organizada que a gaveta atual.
4. O Wiggle hoje é "grosseiro, só vai pra direita/esquerda/cima/baixo". Quer movimento **suave em todas as direções**, "como uma onda, só que mais suave", e presets premium.

## 2. Como funciona hoje (lido no código)

- `client/src/main.ts` → `renderToolBrowser`: **toda** ferramenta da grade entra com `interaction: "configure"` (só a Âncora é `direct-control`). Clique = `edit(tool)` → abre `ch-context-inspector` (gaveta deslizante abaixo de 720 px, coluna acima) via `attachInspectorSheet`.
- O tipo `LibraryItem.interaction` já prevê `"quick"` e `LIBRARY_COPY` já tem "Clique para aplicar" — a grade foi pensada para isso, só nunca foi ligada.
- Wiggle rápido (`host/src/quick-effects.jsx`, `kind === "wiggle"`) cria Live Controls e usa `wiggle(f, a, oitavas, mult)` por eixo, com padrão `frequency 2, amplitude 20, octaves 1` (`packages/command-registry/src/tool-starter-presets.ts`).
- Por que parece grosseiro: `wiggle()` com 1 oitava a 2 Hz sorteia um alvo novo a cada meio segundo **em cada eixo separado**. O caminho fica feito de trechos quase retos que mudam de sentido de repente; o olho lê "vai e volta" em X ou em Y. Não há rotação nem entrada suave, e o movimento começa no frame 0 já em velocidade.
- Várias ferramentas já sabem **ler de volta** os controles da camada (`load: refresh…Controls`) — base para a página de edição reabrir o que já foi aplicado.

## 3. Proposta

### 3.1 Três comportamentos de ladrilho

| Comportamento | Clique | Depois | Marca no ladrilho |
|---|---|---|---|
| **Aplicar** (efeito vivo) | aplica o preset padrão premium na seleção | botão **Editar** aparece ao lado da busca | nenhuma (é o normal) |
| **Executar** (operação) | executa na hora | nada a editar; Ctrl+Z desfaz | nenhuma |
| **Abrir** (precisa de escolha) | abre a página da ferramenta | Aplicar dentro da página | chevron `›` pequeno no canto |

Alt+clique em qualquer ladrilho continua abrindo a página antes de aplicar (já é o atalho documentado em `LIBRARY_COPY.keyAdjust`).

**Classificação inicial** (revisável):

- **Aplicar**: Wiggle, Flicker, Smooth, Loop, Inércia, Pulo, Cinético, Pulso vertical, Revelação de palavras, Morph variável, Onda, Glitch, Eco, Neon, Caixa de texto, Trim Path, Órbita, Parallax rápido, Time Controller.
- **Executar**: Inverter ordem, Cortar keyframes, Atraso (2 f), Copiar/Colar keyframes, Quebrar forma, AI → vetor, Texto → vetor, Loop por marcador.
- **Abrir**: Gradiente, Renomear, Parentear, Biblioteca de formas, Transição de câmera, Troca de estilo, Look At, Partículas, Textura, Limpar projeto, Edição rápida, Cilindro, Cubo, Effector, Tile, Beat, Parallax completo.

Critério: abre página só quem **não tem um padrão razoável sem perguntar** (alvo, fonte, cores, arquivo, ação destrutiva no projeto).

### 3.2 Botão Editar ao lado da busca

- Fica na barra da grade: `[🔍 Buscar ferramenta……] [✎ Wiggle]` — botão de 24 px, ícone + nome curto, no padrão dos botões do AE (sem pílula colorida).
- Aparece quando: (a) uma ferramenta acabou de ser aplicada, ou (b) a camada selecionada já tem um efeito Moti.on reconhecido (o contexto de seleção já chega ao painel).
- Se a camada tem mais de um efeito Moti.on, o botão vira `✎ 3 efeitos ▾` e abre um menu curto para escolher.
- Some quando a seleção não tem nenhum efeito Moti.on. Não vira linha de status permanente (retorno de 2026-11-11: nada de linha de seleção).

### 3.3 Página da ferramenta (substitui a gaveta)

Uma única "página" para editar e para configurar, ocupando a área da grade (não desliza por cima):

```
‹ Ferramentas  ·  Wiggle                 ⋯
  Camada: Logo · Posição
────────────────────────────────────────
[prévia pequena animada com os valores atuais]
Presets        Flutuar · Respirar · Câmera na mão · Deriva lenta · Tremor
▾ Movimento    Intensidade · Velocidade · Direções
▾ Balanço      Rotação · Respiração (escala)
▸ Avançado     Detalhe · Entrada suave · Semente · Loop
────────────────────────────────────────
Remover                               Pronto
```

- **Voltar** (botão `‹ Ferramentas` + Esc) devolve a grade na mesma rolagem.
- Em modo **edição**, os controles mexem nos Live Controls da camada ao vivo (a expressão já lê os sliders); o rodapé tem **Remover** e **Pronto**.
- Em modo **configurar** (ferramentas "Abrir"), o rodapé tem **Redefinir** e **Aplicar**.
- `⋯`: Redefinir para o preset, Salvar como meu preset, Copiar para outras camadas.
- 280/360/480: uma coluna. 720+: prévia e presets à esquerda, propriedades à direita.
- Linhas de propriedade compactas (24–28 px) e grupos retráteis, como na Suavização.

### 3.4 Wiggle premium — "Flutuação"

Expressão nova (Position; o mesmo esqueleto vale para 3D e para Rotação):

```js
// Moti.on · Flutuação
var amp = <Intensidade>;  var spd = <Velocidade>;  var s = Math.floor(<Semente>);
var t = (time - inPoint) * spd;
function n(k) { return noise([t + k * 13.17, s * 7.31 + k]); }   // ruído Perlin, -1..1, contínuo
// órbita lenta com razões irracionais: o caminho passa por todas as diagonais e nunca repete
var ox = Math.cos(t * 2.31 + s), oy = Math.sin(t * 1.43 + s * 1.7);
var dx = n(1) * 0.65 + ox * 0.35 + n(3) * 0.12 * <Detalhe>;
var dy = n(2) * 0.65 + oy * 0.35 + n(4) * 0.12 * <Detalhe>;
var ramp = ease(time - inPoint, 0, <Entrada suave>, 0, 1);    // começa parado e ganha corpo
value + [dx, dy] * amp * ramp;
```

Rotação (opcional, ligada por padrão): inclina conforme o deslocamento horizontal, como um barco — `value + <Rotação> * (n(5) * 0.6 + dx * 0.4) * ramp`.

Por que fica suave: `noise()` é contínuo (sem alvos sorteados), as duas senoides com frequências sem relação inteira desenham elipses que derivam em vez de vai-e-vem, e a velocidade padrão cai de 2 Hz para ~0,35 ciclo/s.

**Presets** (padrão em negrito):

| Preset | Intensidade | Velocidade | Rotação | Respiração | Uso |
|---|---|---|---|---|---|
| **Flutuar** | 14 px | 0,35 | 0,6° | 0 | logo, card, título parado |
| Respirar | 6 px | 0,25 | 0,2° | 1,2 % | produto, foto |
| Câmera na mão | 18 px | 0,9 | 1,2° | 0 | cena inteira, nulo de câmera |
| Deriva lenta | 40 px | 0,12 | 1,5° | 0 | fundo, partículas grandes |
| Tremor | 6 px | 6 | 0,4° | 0 | impacto, nervoso (o wiggle antigo, refinado) |

Valores em pixels escalam pela resolução da composição (`scaleQuickPixelsFrom1080`, já usado nos presets rápidos).

**Flicker** ganha a mesma lógica de presets: **Lâmpada falhando** (padrão), Neon instável, Vela suave, Estroboscópio.

**Compatibilidade**: o reconhecimento continua aceitando as expressões Wiggle antigas (`isManagedWiggle`, `isManagedWiggleLive`, `quick-effects` v2) para a página de edição reabrir camadas já animadas; as novas usam cabeçalho próprio (`kind: "drift"`, `version: 3`) e empilham sobre expressão do usuário via `expression-compose.jsx`, como pede [compatibilidade 2026-11-18](COMPATIBILIDADE_FERRAMENTAS_2026-11-18.md).

## 4. Fases de implementação

1. **Wiggle Flutuação + presets** no host (`quick-effects.jsx`, `expression-templates.jsx`), drafts em `tool-starter-presets.ts`, testes de expressão (parse, reconhecimento, empilhamento, 2D/3D/1D/cor).
2. **Classificação e clique rápido**: campo `interaction` real por ferramenta em `main.ts`; ladrilho "Abrir" ganha `›`; feedback de aplicado no ladrilho (já existe `setFeedback`).
3. **Botão Editar** na barra da grade, alimentado por "efeitos Moti.on na seleção" (estender o contexto de seleção com a lista de rigs reconhecidos).
4. **Página da ferramenta** no lugar de `ch-context-inspector` / `attachInspectorSheet`: shell com Voltar, prévia, presets, grupos; modos editar/configurar; layout 720+.
5. Migrar as páginas "Abrir" uma a uma, começando pelo **Gradiente**.
6. Flicker presets; depois os outros "Aplicar".
7. Verificação: suíte + lint + build, `panel-layout-audit.mjs` nas 4 larguras, e conferência no AE via CDP 8091. Até lá: `IMPLEMENTED_NOT_HOST_VERIFIED`.

## 5. Decisões em aberto para o usuário

- A classificação da seção 3.1 (alguma ferramenta muda de grupo?).
- Rotação ligada por padrão no Wiggle (proposta: sim, 0,6°).
- Clique rápido sem propriedade selecionada: aplicar em Posição + Rotação da camada (proposta) ou pedir a propriedade.

## 6. Implementação (2026-11-19) — `IMPLEMENTED_NOT_HOST_VERIFIED`

Aprovado pelo usuário com dois pedidos extras: ícones simples do preview mantendo a luz que segue o
ponteiro no ladrilho, e **Rotação no Wiggle em X, Y e Z**.

- **Wiggle Flutuação (v3)** — `host/src/quick-effects.jsx` (`drift`, `oneD`). Reaproveita os mesmos 7
  controles do Effect Controls da v2 (os grupos são FFX pré-gerados por conjunto de rótulos, então não
  há FFX novo): Frequência = ciclos/s; Detalhe = camadas finas de ruído; Detalhe: amplitude = peso de
  cada camada. Entrada suave fixa de 0,6 s a partir do início da camada. Rigs v2 continuam
  reconhecidos e sem alteração.
- **Camada sem propriedade selecionada** → Posição + Rotação. Camada 3D: Rotação X, Y e Z
  (`rotationAxes`, bits 1/2/4); 2D: só Z. X inclina com o movimento vertical, Y com o horizontal,
  Z balança. Posição com dimensões separadas: cada eixo segue o seu. Args novos opcionais
  `rotation` (0–45°) e `rotationAxes` (0–7) validados em `expression-wiggle.jsx`.
- **Padrões**: Wiggle = Flutuar (0,35 · 14 px em 1080p · 2 camadas · 0,6°); Flicker = Lâmpada falhando
  (9/s, 0,55–1) em `tool-starter-presets.ts`.
- **Presets** na página: `client/src/tool-presets.ts` (5 do Wiggle, 4 do Flicker, linhas de 30 px com
  miniprévia animada). "Respirar" não tem a respiração de escala do preview: ficou só deriva + balanço.
- **Grade**: `client/src/tool-one-click.ts` classifica (aplicar / executar / abrir). Parallax ficou em
  "abrir" (aba própria com prévia da receita). Com QuickProfile o clique usa `applyQuickPreset`; sem,
  volta o editor ao padrão e aplica. Ladrilhos "abrir" mostram `›`; aplicado na seleção mostra ponto azul
  (spans `.ch-tool-mark`; o `::after` do ladrilho continua sendo a luz do ponteiro).
- **Botão Editar** ao lado da busca: `client/src/tool-edit-button.ts`. Lembra por seleção, nesta sessão
  do painel, o que foi aplicado pelo clique; 2+ efeitos viram menu. Não lê a camada no host.
- **Página da ferramenta** no lugar da gaveta (`renderView` em `main.ts`, `.ch-tool-page`): ‹ Ferramentas
  + Esc voltam para a grade na mesma categoria. `inspector-sheet.ts` deixou de ser usado.
- **Ícones**: 24 ferramentas redesenhadas em traço simples (`icon-drawings.ts`); na grade todos ficam em
  uma cor, sem preenchimento colorido.

Verificação: `tsc -b`, lint, build verdes; `home-panel.test.mjs` 40/40 (atualizado ao fluxo novo);
`tool-one-click.test.mjs` novo; `node scripts/one-click-flow-audit.mjs <rótulo>` (capturas em
`artifacts/one-click/`). Os testes de navegador `ae-motion/ae-native/ae-workstation.browser.mjs` ainda
descrevem a gaveta antiga e não foram rodados. Falta: conferir no AE (movimento real do Flutuar, X/Y em
camada 3D, botão Editar) e rodar `Atualizar Moti.on.cmd`.
