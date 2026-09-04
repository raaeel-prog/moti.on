---
title: "Addendum A — Quick Layer, Live Controls e Sistema de Interface"
document_version: "1.0.0"
status: "Implementation-ready"
parent_document: "docs/MASTER_BUILD_SPEC.md"
last_verified: "2026-09-01"
language: "pt-BR"
target_agents:
  - "Claude Code"
  - "OpenAI Codex"
supersedes: "MASTER_BUILD_SPEC.md §22.3, §22.4"
extends: "MASTER_BUILD_SPEC.md §8, §11, §13, §23, §27, §32, §33"
---

# Addendum A — Quick Layer, Live Controls e Sistema de Interface

> **Documento normativo.** Complementa o `MASTER_BUILD_SPEC.md`. Onde houver conflito com §22.3 e §22.4 do documento-mãe, **este arquivo prevalece**. Todo o restante do MASTER continua valendo integralmente: proibição de mock, capability detection, Undo coerente, erro tipado, ExtendScript ES3 e ausência de API privada.
>
> Este addendum não adiciona features novas ao catálogo. Ele define **como cada uma das features já especificadas é operada**. Nenhum comando do §13 entra em release sem cumprir as seções A1, A2, A3 e A7 deste documento.

---

## A0. Princípio de produto

O editor não abre o plugin para configurar. Ele abre para **resolver e voltar para a timeline**. A interface tem três leis, nesta ordem de prioridade:

### Lei 1 — Um clique entrega resultado

Todo comando não destrutivo tem um caminho **Quick**: um clique, zero diálogo, zero campo obrigatório, resultado visível no host. Os parâmetros são derivados do contexto real (comp, fps, resolução, seleção, duração), não de constantes cegas.

### Lei 2 — Nada do que foi aplicado fica congelado

Todo parâmetro contínuo de um comando Quick nasce como **controle deslizante no host** — na layer ou num controller da composição. Ajustar não exige reaplicar, reabrir o painel ou desfazer. O plugin entrega o rig e sai da frente.

### Lei 3 — Nada precisa ser lido para ser entendido

Cada ferramenta se explica sozinha: nome, uma linha do que faz, requisito, e **prévia em vídeo ao repousar o ponteiro por 2 segundos**. O modo avançado existe sempre, mas nunca é o caminho obrigatório.

### Corolário — Avançado nunca desaparece

O modo avançado do MASTER continua completo. Ele deixa de ser a porta de entrada e passa a ser a gaveta. Nenhum parâmetro especificado no §13 é removido da UI; ele apenas para de ser exigido antes do primeiro resultado.

### Exceção única

Comandos marcados `destructive: true` **não têm caminho de um clique**. Neles, o clique primário abre o preview com confirmação. Esta é a única quebra permitida da Lei 1 e deve estar declarada no registry, não improvisada na UI.

---

## A1. Modelo de dois níveis — Quick e Advanced

### A1.1 Extensão do contrato

Estende `CommandRequest` e a definição de comando do §8. O dispatcher passa a exigir estes campos.

```ts
export type CommandMode = "quick" | "advanced";

export interface CommandRequestOptions {
  dryRun?: boolean;
  allowDestructive?: boolean;
  preserveSelection?: boolean;
  /** Novo. Default: "quick". */
  mode?: CommandMode;
  /** Novo. Default: true em quick, opcional em advanced. */
  emitLiveControls?: boolean;
  /** Novo. Identidade do rig alvo quando a intenção é ajustar, não criar. */
  targetRigId?: string;
}

export interface QuickProfile<TArgs = unknown> {
  /** Preset de fábrica usado quando não há histórico. Obrigatório. */
  factoryPresetId: string;
  /** Deriva parâmetros do contexto real. Puro, testável, sem I/O. */
  derive?(ctx: QuickContext): Partial<TArgs>;
  /** Controles que serão materializados no host. Obrigatório se houver parâmetro contínuo. */
  liveControls: LiveControlBinding[];
  /** Asset de prévia. Obrigatório. Ver A3.3. */
  previewAssetId: string;
  /** Uma linha, no imperativo, sem jargão de API. */
  oneLine: Record<"pt-BR" | "en-US", string>;
  /** Requisito em linguagem humana, exibido quando o botão está desabilitado. */
  needs: Record<"pt-BR" | "en-US", string>;
  /** Tempo-alvo do caminho quick, do clique ao resultado visível no host. */
  budgetMs: number;
}

export interface QuickContext {
  host: HostId;
  hostVersion: string;
  fps: number;
  compWidth: number;
  compHeight: number;
  compDurationSeconds: number;
  currentTimeSeconds: number;
  workAreaStart: number;
  workAreaDuration: number;
  selectionCount: number;
  selectionKinds: Array<"text" | "shape" | "av" | "camera" | "light" | "null" | "adjustment" | "solid" | "precomp">;
  selectionHasKeyframes: boolean;
  selectionHasExpressions: boolean;
  selectionIs3D: boolean;
  averageLayerDurationSeconds: number;
  existingRigIdsInSelection: string[];
  lastUsedPresetId?: string;
}
```

### A1.2 Regras invioláveis do Quick

- não abre modal;
- não pede confirmação, salvo `destructive: true`;
- não retorna `ok: true` sem alteração real no host — regra do §8 mantida;
- cabe em **um único Undo Group** com `undoLabel` legível em pt-BR e en-US;
- respeita `budgetMs`; se estourar, exibe progresso conforme §27 em ≤ 500 ms;
- é **idempotente por rigId**: se a seleção já contém rig do mesmo tipo, o Quick entra em modo **Adjust**, conforme §11, e nunca duplica;
- nunca substitui expressão, keyframe, efeito ou parent existente. Em conflito, aplica `conflictMode` default `wrap-when-safe` e devolve `CommandWarning`, jamais falha em silêncio;
- **sempre** emite Live Controls quando existe parâmetro contínuo (A2). Um Quick sem Live Controls é considerado incompleto e não passa na Definition of Done.

### A1.3 Derivação de defaults pelo contexto

Constante fixa em preset é proibida onde houver sinal de contexto disponível. Tabela normativa mínima:

| Sinal do contexto | Deriva | Regra |
|---|---|---|
| `fps` | frequência, hold frames, delay em frames | Converter sempre de segundos para frames no fps real. Nunca assumir 24 ou 30. |
| `min(compWidth, compHeight)` | amplitudes em px, raio de glow, padding, offset | Base 1080. Escalar linearmente: `valor = base * (min(w,h) / 1080)`. |
| `compDurationSeconds` e `currentTimeSeconds` | duração de trim, órbita, transição | Default: início no CTI, duração 1 s ou até o fim da layer, o que for menor. |
| `selectionCount` | passo de delay, distribuição de profundidade, seed por índice | Passo decresce quando a seleção cresce, para o efeito total caber na duração. |
| `selectionKinds` | propriedade alvo do efeito | Texto → Source Text/Scale; Shape → Path/Trim; AV → Position/Opacity. |
| `selectionHasKeyframes` | modo do comando | Com keys: modifica os keys. Sem keys: cria expressão. Nunca o contrário. |
| `selectionIs3D` | eixos afetados | 2D não recebe parâmetro Z. Converter para 3D só com aviso explícito. |
| `lastUsedPresetId` | preset aplicado | Último preset **bem-sucedido** do usuário para aquela ferramenta, no projeto atual. |

Toda função `derive` é pura e recebe teste unitário com fixtures em 24, 25, 29,97 e 60 fps, e em 1080×1920, 1920×1080 e 3840×2160.

### A1.4 Memória de último uso

- Escopo: por usuário, por ferramenta, por projeto (`projectFingerprint` do §8).
- Só grava após `ok: true` sem warning bloqueante.
- Fallback em cascata: último uso no projeto → último uso global do usuário → `factoryPresetId`.
- O tile mostra qual preset será aplicado. Nunca aplicar um valor que o usuário não consiga ver antes de clicar.
- Reset explícito em **Settings → Restaurar padrões**, por ferramenta e global.

### A1.5 Gestos e equivalências

| Intenção | Mouse | Teclado | Toque/caneta |
|---|---|---|---|
| Aplicar Quick | clique | `Enter` no tile focado | toque curto |
| Abrir Advanced | `Alt` + clique, ou clique no canto ⌄ do tile | `Alt`+`Enter` ou `→` | pressão longa 400 ms |
| Ver prévia | repouso de 2 s | `?` ou foco por 2 s | pressão longa 400 ms |
| Ajustar o que acabou de ser aplicado | clique em **Ajustar** no toast | `Ctrl/Cmd`+`Shift`+`A` | toque em **Ajustar** |
| Repetir na nova seleção | duplo clique no tile | `Ctrl/Cmd`+`Shift`+`R` | duplo toque |
| Remover o rig | menu contextual → Remover | `Delete` no tile ativo | pressão longa → Remover |

`Alt`+clique não pode ser o **único** caminho para o avançado: o canto ⌄ visível no tile é obrigatório, pela regra de paridade de A7.3.

### A1.6 Códigos de erro adicionais

Somam-se aos do §8. Mesmo formato: `code`, `message`, `recoverable`, `action`.

```text
QUICK_UNAVAILABLE_DESTRUCTIVE
QUICK_CONTEXT_INSUFFICIENT
CONTROLS_MISSING
CONTROLS_ORPHANED
CONTROLS_LIMIT_EXCEEDED
CONTROLS_HOST_UNSUPPORTED
PREVIEW_ASSET_MISSING
RIG_ALREADY_PRESENT
```

`CONTROLS_HOST_UNSUPPORTED` nunca pode ser silencioso: o comando informa, no resultado e na UI, que os parâmetros não puderam virar controles naquele host e qual é o caminho alternativo.

### A1.7 Aceite

- Cada comando não destrutivo do §13 possui `QuickProfile` registrado, com `derive` testado e `budgetMs` medido em host real.
- Clicar um tile em uma comp válida produz alteração visível sem qualquer entrada adicional.
- Um `Ctrl/Cmd`+`Z` desfaz integralmente o Quick, incluindo os Live Controls criados.
- Aplicar o mesmo Quick duas vezes na mesma seleção não duplica rig; a segunda execução retorna `RIG_ALREADY_PRESENT` como warning e entra em Adjust.
- Nenhum comando Quick abre modal em fluxo normal.

---

## A2. Live Controls — parâmetros deslizantes na composição e na layer

Esta é a seção que sustenta a Lei 2. Ela é a diferença entre um plugin que aplica e um plugin que entrega um rig editável.

### A2.0 Definição — o que é um Live Control

**Live Control é o efeito de Expression Control aplicado à layer no host.** No After Effects é o efeito **Controle Deslizante** (`Efeito → Expression Controls → Slider Control`, matchName `ADBE Slider Control`) e seus irmãos: Controle de Ângulo, Controle de Cor, Controle de Caixa de Seleção, Controle de Ponto, Controle de Menu Suspenso e Controle de Camada.

Ele não é um componente da interface do plugin. Ele é:

- uma **propriedade real do projeto**, que vive no painel Efeitos do After Effects;
- **numérica e digitável**, além de arrastável no valor;
- **animável**: o editor pode colocar keyframe na Amplitude, aplicar ease, ou até colocar outra expressão dentro dela;
- **linkável por pick-whip**: o editor pode conectar aquele mesmo controle a qualquer outra propriedade de qualquer outra layer, por conta própria;
- **persistente**: continua funcionando com o plugin fechado, desinstalado, ou em outra máquina.

> Um slider que só existe no painel do plugin morre quando o painel fecha. Isso é explicitamente proibido aqui e no §2 do MASTER. Quando este documento diz "slider do painel" (A4.4, A7.6), está falando do **espelho remoto** desse efeito — a fonte da verdade é sempre a propriedade no host, conforme A2.6.

Consequência de projeto: o valor de entregar o parâmetro como efeito não é economizar um clique no painel. É que o parâmetro entra no fluxo normal do After Effects — keyframe, gráfico de velocidade, pick-whip, cópia entre layers, Essential Graphics. O plugin devolve controle ao editor em vez de reter controle.

### A2.1 Regra fundamental

> **Nenhuma expressão gerada pela suíte pode conter valor numérico literal para um parâmetro exposto.** Todo parâmetro exposto é lido de um efeito de controle no host.

Errado:

```js
// CHMS_EXPRESSION v1 | ae.animate.wiggle
wiggle(2, 30);
```

Correto:

```js
// CHMS_EXPRESSION v1 | ae.animate.wiggle
var ctl = thisLayer;                                  // ou o controller resolvido por A2.2
var f = ctl.effect("CHMS · Wiggle · Frequência")(1);  // Controle Deslizante
var a = ctl.effect("CHMS · Wiggle · Amplitude")(1);
var s = ctl.effect("CHMS · Wiggle · Seed")(1);
seedRandom(s, true);
wiggle(f, a);
```

#### Estratégia de resolução — nome do efeito + índice da propriedade

| Parte | Como resolver | Por quê |
|---|---|---|
| **O efeito** | por **nome customizado** que a suíte definiu (`CHMS · Wiggle · Amplitude`) | O nome é escrito por nós, então não é traduzido pela instalação. Resolver por índice quebra assim que o usuário adiciona, remove ou reordena um efeito na layer — o que acontece o tempo todo. |
| **A propriedade interna** | por **índice `(1)`** | O nome interno (`"Slider"`, `"Curseur"`, `"Regler"`) **é** traduzido em instalações localizadas. `effect("...")("Slider")` quebra em After Effects não-inglês. |

Esta é uma correção sobre a redação anterior deste addendum, que mandava resolver o efeito por índice: índice de efeito é frágil a reordenação. Nome customizado + índice de propriedade é a única combinação que sobrevive tanto à tradução quanto à edição da pilha de efeitos.

#### Obrigações do writer

1. **Unicidade**: o After Effects permite dois efeitos com o mesmo nome na mesma layer. O writer verifica colisão antes de nomear e sufixa com o `rigId` curto quando necessário.
2. **Metadata dupla**: gravar em `RigMetadata` o `name`, o `matchName` e o índice no momento da escrita. O Adjust resolve por nome; se falhar, tenta índice + `matchName`; se ainda falhar, devolve `CONTROLS_MISSING` e oferece **Religar**.
3. **Renomeação pelo usuário é esperada, não erro.** Ao religar, o plugin regrava o nome novo na metadata e reescreve a expressão. Nunca renomeia de volta sem consentimento.
4. **Clamp na expressão, não no controle**: o Controle Deslizante não tem limite duro nem faixa configurável por script (ver A2.3). Todo limite de segurança vive na expressão gerada, com `Math.max`/`Math.min`, e o motivo do clamp é documentado em comentário.

### A2.2 Onde o controle nasce

| Situação | Alvo | Regra |
|---|---|---|
| 1 layer, parâmetros só dela | a própria layer | Efeitos de controle na layer. |
| 2 a 8 layers, mesmo rig | **controller null** | Um null `CHMS · <Tool>` com todos os controles; as layers leem dele. |
| 9+ layers, ou rig de composição | **comp controller** | Uma layer de ajuste travada e guiada `CHMS · Control Room`, no topo, guide layer, `enabled = false` se puramente de controle. |
| Rig com câmera (Parallax, Orbit, transições) | controller do rig | O null do rig já existente recebe os controles; não criar um segundo. |

Limite: **máximo de 12 controles por layer** e 24 por controller. Ao exceder, agrupar por dropdown de modo ou promover para comp controller e devolver `CONTROLS_LIMIT_EXCEEDED` como warning, nunca como falha.

O comp controller é único por composição, criado sob demanda, identificado por metadata (`rigType: "chms.control-room"`), e nunca renomeado pelo plugin depois de criado — o usuário pode renomear à vontade, porque a identidade é a metadata e não o nome (§11).

### A2.3 Mapa de tipos

| Tipo do parâmetro | Efeito no After Effects | matchName | Valor lido em `(1)` | Premiere (UXP) |
|---|---|---|---|---|
| numérico contínuo | Controle Deslizante | `ADBE Slider Control` | `Number` | Param numérico do MOGRT / `ComponentParam` |
| ângulo | Controle de Ângulo | `ADBE Angle Control` | `Number` em graus, acumula voltas | Param numérico com unidade grau |
| cor | Controle de Cor | `ADBE Color Control` | `[r,g,b,a]` 0–1 | Param de cor do MOGRT |
| booleano | Controle de Caixa de Seleção | `ADBE Checkbox Control` | `0` ou `1` | Checkbox do MOGRT |
| ponto 2D | Controle de Ponto | `ADBE Point Control` | `[x,y]` em px da comp | Dois params numéricos |
| enumeração | Controle de Menu Suspenso | `ADBE Dropdown Control` | índice inteiro a partir de 1 | Dropdown do MOGRT |
| referência de layer | Controle de Camada | `ADBE Layer Control` | referência de layer | **Sem equivalente** — ver A2.8 |

#### Comportamento real que o writer precisa respeitar

- **Controle Deslizante não tem faixa configurável por script.** A barra que aparece ao expandir o triângulo é apenas visual e não é ajustável via ExtendScript. O valor digitado pode ultrapassá-la livremente. Portanto: `min`/`max` do `LiveControlBinding` são **contratos da expressão**, aplicados com clamp no código gerado, e `softMin`/`softMax` servem só para o espelho do painel. Nunca prometer ao usuário um limite que o efeito não impõe.
- **Parâmetros cuja faixa útil é muito distante de 0–100 devem ser normalizados.** Exemplo: em vez de expor `Escala do Ruído` de 0,0001 a 0,01, expor `Detalhe` de 0 a 100 e converter na expressão. O editor arrasta uma faixa legível; a matemática fica na expressão, comentada.
- **Unidade vai no nome, não em campo separado.** O efeito não carrega unidade. `CHMS · Wiggle · Amplitude (px)` e `CHMS · Delay · Atraso (frames)`.
- **Controle de Menu Suspenso** exige After Effects 17.1 ou posterior, e os itens são definidos por `setPropertyParameters([...])` na propriedade do menu. Sob capability detection: se indisponível, cair para Controle Deslizante inteiro com os valores documentados no nome (`Modo (1 Ciclo · 2 Pingpong · 3 Offset)`), nunca falhar.
- **Controle de Ângulo acumula voltas** — 370° não é 10°. Quando o parâmetro for cíclico, normalizar na expressão com `%360`.
- **Controle de Cor devolve 0–1**, não 0–255. Converter na expressão quando alimentar efeitos que esperam outra escala.
- **Todo controle é keyframeável.** A expressão nunca pode assumir valor constante no tempo: ler sempre com `.value` no tempo corrente, e usar `valueAtTime()` quando o rig precisar amostrar outro instante.

```ts
export interface LiveControlBinding {
  paramId: string;
  label: Record<"pt-BR" | "en-US", string>;
  control: "slider" | "angle" | "color" | "checkbox" | "point" | "dropdown";
  target: "layer" | "controller" | "comp-controller";
  order: number;
  unit?: "px" | "%" | "°" | "fps" | "frames" | "s" | "x" | "none";
  /** Limites duros da propriedade. Fora deles a expressão clampa. */
  min?: number;
  max?: number;
  /** Faixa recomendada mostrada no painel; o host permite exceder. */
  softMin?: number;
  softMax?: number;
  step?: number;
  options?: Array<{ value: number; label: Record<string, string> }>;
  /** Texto lido por leitor de tela e exibido no tooltip do slider do painel. */
  help: Record<"pt-BR" | "en-US", string>;
}
```

### A2.4 Nomenclatura

Formato obrigatório, com separador `·` (U+00B7):

```text
CHMS · Wiggle · Amplitude
CHMS · Parallax · Profundidade
CHMS · Control Room
```

- O prefixo `CHMS` é substituído pela marca definitiva antes do release, junto com namespace e ícones (§0 do MASTER).
- **O nome do efeito é a chave de resolução da expressão** (A2.1). Ele precisa ser único dentro da layer: o writer verifica colisão e sufixa com o `rigId` curto quando necessário — `CHMS · Wiggle · Amplitude #7f3a`.
- **A unidade entra no nome**, entre parênteses, porque o efeito não carrega unidade: `CHMS · Wiggle · Amplitude (px)`, `CHMS · Delay · Atraso (frames)`, `CHMS · Trim · Duração (s)`.
- Nome do controle localizado no idioma da UI do plugin no momento da criação; o idioma escolhido é gravado na metadata para que o Adjust reencontre o controle mesmo se a UI mudar de idioma depois. Trocar o idioma da UI **não** renomeia efeitos já criados — isso quebraria expressões em projetos entregues.
- Ordem visual segue `order`, do mais usado para o menos usado. Nunca ordem alfabética.
- Agrupar com um `ADBE Dropdown Control` chamado `CHMS · <Tool> · Modo` quando houver mais de um comportamento.

### A2.5 Idempotência e Adjust

Estende o §11 do MASTER:

1. Antes de criar qualquer controle, resolver `rigId` a partir da metadata da seleção.
2. Se existe rig do mesmo `rigType`: **atualizar valores**, não recriar efeitos.
3. Se existe rig mas faltam controles (usuário apagou um efeito): recriar apenas o que falta e devolver `CONTROLS_MISSING` como warning, preservando os valores dos que sobreviveram.
4. Se existem controles órfãos (expressão apagada, controle sobrou): oferecer **Religar** ou **Limpar**, devolver `CONTROLS_ORPHANED`, nunca apagar sozinho.
5. Guardar em `RigMetadata.userOverrides` todo valor que o usuário alterou no host, para que um novo Quick **não sobrescreva** ajuste manual sem consentimento.

### A2.6 Sincronização painel ↔ host

O painel do plugin é um controle remoto dos mesmos parâmetros, não uma segunda fonte da verdade.

- **Fonte da verdade é o host.** O painel lê e escreve; nunca guarda um valor divergente.
- **Leitura**: uma única chamada de dispatch retorna o vetor de valores do rig selecionado, com fingerprint. Custo alvo ≤ 40 ms.
- **Polling governado**: intervalo de 500 ms, **somente** quando as três condições forem verdadeiras — painel visível, Inspector aberto, rig alvo selecionado. Fora disso, zero polling. Revalidar também ao recuperar foco da janela.
- No Premiere, usar eventos documentados de projeto/seleção quando a capability detection confirmar disponibilidade; cair para o mesmo polling apenas quando não houver evento.
- **Escrita**: arrastar o slider no painel envia com debounce de 60 ms e commit final no `pointerup`, dentro de um único Undo Group rotulado `Ajustar <Tool>`. Arrastar não pode gerar 200 entradas de Undo.
- **Divergência**: se o fingerprint mudou fora do painel, o painel atualiza e mostra um marcador discreto `editado no projeto` por 4 s. Nunca sobrescrever silenciosamente.

### A2.7 Bake & Detach

Todo rig com Live Controls expõe três operações no menu contextual, obrigatórias:

| Operação | O que faz | Reversível |
|---|---|---|
| **Congelar (Bake)** | Converte expressões em keyframes no fps da comp, mantém os controles como referência desligada. | Sim, por Undo. |
| **Desacoplar (Detach)** | Remove expressões e controles, mantém o resultado atual como valor estático ou keys. | Sim, por Undo. |
| **Limpar controles** | Remove apenas os efeitos de controle órfãos criados pela suíte. | Sim, por Undo. |

Bake é obrigatório para entrega de projeto a terceiros e para render farms sem o plugin instalado. Um projeto congelado deve abrir e renderizar corretamente **sem a suíte instalada** — esse é um teste de aceite, não uma promessa.

### A2.8 Premiere Pro — limitação real e fallback honesto

O UXP do Premiere não possui equivalente de Expression Controls. Portanto:

- Em Premiere, Live Controls existem **apenas** onde há MOGRT ou efeito com parâmetros expostos (`ComponentParam`, §4.2 e §18 do MASTER).
- Quando o comando não puder expor parâmetros, o resultado devolve `CONTROLS_HOST_UNSUPPORTED` e a UI mostra, no lugar dos sliders, a frase: *"Neste host os parâmetros ficam no Essential Graphics do item aplicado."* com botão que revela o item.
- É **proibido** simular controles no painel que não existam no projeto: um slider que só vive no painel quebra assim que o usuário fecha o plugin, e isso viola a definição de 100% funcional do §2.
- Todo MOGRT gerado pela suíte expõe os mesmos `paramId` do binding, com o mesmo rótulo e a mesma ordem, para que a experiência seja reconhecível entre hosts.

### A2.9 Performance

| Operação | Meta |
|---|---|
| Criar controles de um rig de até 8 layers | ≤ 300 ms |
| Ler vetor de valores do rig | ≤ 40 ms |
| Commit de arraste no painel | ≤ 120 ms até refletir no host |
| Polling | 1 dispatch por 500 ms, apenas com Inspector aberto |
| Expressão gerada | leitura de controle resolvida por índice, sem `thisComp.layer("nome")` em loop |

Proibido: criar controles dentro de laço por layer quando um controller único resolve; ler o mesmo controle mais de uma vez por frame na expressão; usar `eval`.

### A2.10 Aceite

- Aplicar Wiggle Quick em 3 layers, fechar o plugin, arrastar o slider `Amplitude` no Effect Controls: o movimento muda em tempo real, sem o plugin aberto.
- Reabrir o projeto em outra máquina com a suíte instalada: o Adjust reencontra o rig pela metadata, mesmo com layers renomeadas.
- Reabrir o projeto **sem** a suíte instalada: expressões continuam funcionando; nada quebra; nada some.
- Apagar um controle manualmente e reaplicar o Quick: apenas o controle apagado é recriado, os demais mantêm os valores do usuário.
- **Reordenar os efeitos da layer não quebra nenhuma expressão** — validado com um efeito nativo inserido acima e abaixo dos controles da suíte.
- **Renomear um controle** quebra a expressão de forma detectável: o Adjust devolve `CONTROLS_MISSING` e o botão **Religar** restaura o vínculo sem recriar o rig.
- **Colocar keyframe no Controle Deslizante** funciona: a Amplitude animada no tempo altera o resultado sem qualquer intervenção do plugin.
- **Pick-whip do usuário** a partir de um controle da suíte para outra propriedade continua válido depois de um Adjust.
- Instalação do After Effects em idioma não-inglês: todas as expressões geradas funcionam sem alteração.
- Congelar um rig e renderizar em máquina sem o plugin: resultado idêntico ao preview dentro da tolerância de amostragem.
- No Premiere, um comando sem suporte a controles informa a limitação com texto claro e caminho alternativo, e nunca exibe um slider fantasma.

---

## A3. Descoberta, prévia e ensino embutido

### A3.1 Escada de informação

A informação chega em camadas, por tempo de intenção. Nenhuma camada bloqueia a anterior.

| Tempo | Camada | Conteúdo | Custo |
|---|---|---|---|
| 0 ms | **Tile** | Ícone, nome, badge do preset atual, ponto de estado | sempre visível |
| 120 ms de repouso | **Realce** | Elevação do tile, `⌄` do avançado aparece, atalho aparece no rodapé | sem rede, sem host |
| 600 ms de repouso | **Tooltip** | Nome + uma linha (`oneLine`) + atalho | texto puro |
| **2000 ms de repouso** | **Cartão de prévia** | Vídeo em loop do efeito real + o que faz + o que precisa + resultado + botão *Abrir avançado* | asset local |
| clique | **Resultado** | Aplica e mostra toast com Undo / Ajustar | host |

O tempo de 2000 ms é fixo e configurável em **Settings → Interface → Tempo da prévia** entre 0 ms (imediato), 1000, 2000 (padrão) e desligado.

### A3.2 Anatomia do cartão de prévia

```text
┌───────────────────────────────────────────────┐
│ ┌───────────────────────────────────────────┐ │
│ │                                           │ │
│ │        loop 3 s · silencioso · 16:9       │ │
│ │        [ ⏸ ]              [ 1× 0.5× ]     │ │
│ └───────────────────────────────────────────┘ │
│                                               │
│  Wiggle                             ⌘⇧W       │
│  Movimento contínuo e reprodutível, sem key.  │
│                                               │
│  Precisa de  ·  1+ layer selecionada          │
│  Vai criar   ·  3 controles na layer          │
│  Preset      ·  Suave · 2 Hz · 12 px          │
│                                               │
│  [ Aplicar ]              [ Abrir avançado ]  │
└───────────────────────────────────────────────┘
```

Regras de conteúdo:

- **Uma linha** para o que faz, no imperativo, sem nome de API. Proibido: "aplica expressão wiggle na propriedade Position". Correto: "Movimento contínuo e reprodutível, sem keyframe".
- **Vai criar** lista o efeito colateral estrutural em português: quantos controles, se cria null, se cria câmera, se converte para 3D. O usuário nunca é surpreendido por uma câmera nova na comp.
- **Precisa de** repete `needs` e fica em destaque quando o requisito não está satisfeito.
- Quando o comando é `destructive: true`, o botão primário do cartão é **Ver prévia**, nunca **Aplicar**.

### A3.3 Como o asset de prévia é produzido

Vale a mesma regra do MASTER: **é proibido mockup**.

- Cada prévia é gerada por render real do comando sobre uma fixture versionada, no CI, pela tarefa `previews:render`.
- Formato: WebP animado ou MP4 sem áudio, 480×270, ≤ 3 s, **≤ 400 KB**, primeiro frame idêntico ao poster estático.
- O asset entra no bundle assinado do preset (§23), com `checksum`. Preview divergente do preset é falha de build.
- Se o asset não existir, o comando não é publicado: `PREVIEW_ASSET_MISSING` bloqueia a Definition of Done.
- Nenhuma prévia usa material de plugin de referência, footage licenciada de terceiros ou marca alheia. Fixtures próprias, geométricas e neutras.

### A3.4 Paridade sem mouse

Informação disponível apenas no hover é falha de acessibilidade (A7). Portanto:

- `?` com o tile focado abre o mesmo cartão;
- foco por teclado mantido por 2 s abre o mesmo cartão;
- pressão longa de 400 ms abre o mesmo cartão em toque e caneta;
- o cartão é **descartável** (`Esc`), **navegável com o ponteiro dentro dele** e **persistente** até que o foco ou o ponteiro saiam — os três requisitos do critério WCAG 2.2 §1.4.13;
- o conteúdo do cartão também existe como texto acessível na página de ajuda da ferramenta, sem depender de vídeo.

### A3.5 Estados vazios, desabilitados e "por que não posso"

Nenhum botão desabilitado sem explicação. Estende o §9 do MASTER:

| Estado | O que a UI mostra | Ação oferecida |
|---|---|---|
| Sem comp ativa | "Abra uma composição para usar as ferramentas de animação." | Botão *Criar composição* |
| Sem seleção | "Selecione ao menos 1 layer." | Botão *Selecionar todas as layers* |
| Tipo errado | "Wiggle precisa de propriedade numérica. A seleção tem só uma câmera." | Botão *Ver o que é aceito* |
| Versão insuficiente | "Este recurso precisa do Premiere 26.3. Você está no 25.6." | Link para a matriz de suporte |
| Permissão ausente | "Ative *Allow Scripts To Write Files And Access Network*." | Botão *Como ativar* com passo a passo |
| Licença | "Recurso do plano Suite." | Botão *Ver plano* |
| Offline | "Assets precisam de conexão. As ferramentas de animação continuam funcionando." | — |

O tile desabilitado mantém contraste de texto de no mínimo 4,5:1 — desabilitado não é ilegível.

### A3.6 Progressão do usuário

Ensino discreto, nunca modal, nunca gamificação:

- **Primeira sessão**: 4 coach marks no máximo, dispensáveis, um por área (rail, grid, quick, inspector). Nunca reaparecem.
- **Depois do 3º uso** de uma ferramenta: uma dica única, inline no toast, sobre o parâmetro que mais muda o resultado. Exemplo: *"Amplitude é o que mais muda o Wiggle. Está no Effect Controls da layer."* Aparece uma vez e nunca mais.
- **Depois do 10º uso**: oferecer salvar o ajuste atual como preset próprio, com um clique.
- Sem badges, sem barra de progresso de aprendizado, sem confete, sem som.
- Tudo isso é desligável em **Settings → Interface → Dicas**.

### A3.7 Aceite

- Repousar 2 s sobre qualquer tile abre um cartão com vídeo real da ferramenta.
- O mesmo cartão abre por teclado e por pressão longa.
- `Esc` fecha o cartão e devolve o foco ao tile.
- Todo tile desabilitado, ao receber foco ou hover, informa o requisito exato e oferece uma ação corretiva.
- Nenhum asset de prévia excede 400 KB nem diverge do preset que representa.

---

## A4. Arquitetura de interface

### A4.1 Anatomia do painel

```text
┌────────────────────────────────────────────────────────┐
│ ▸ CONTEXT STRIP                             28 px      │  host · comp · seleção · alerta
├────┬───────────────────────────────────────────────────┤
│ R  │ ▸ SEARCH / COMMAND FIELD              36 px       │
│ A  ├───────────────────────────────────────────────────┤
│ I  │                                                   │
│ L  │   ▸ TOOL GRID                                     │
│    │     tiles 88×72 · 2 a 5 colunas                   │
│ 48 │     agrupado por seção, com cabeçalho fixo        │
│ px │                                                   │
│    │                                                   │
│    ├───────────────────────────────────────────────────┤
│    │ ▸ RECENT DOCK              44 px  · 6 últimos     │
├────┴───────────────────────────────────────────────────┤
│ ▸ STATUS BAR                                20 px      │  licença · native · update
└────────────────────────────────────────────────────────┘

        ▸ INSPECTOR  — gaveta lateral ou inferior, sob demanda
        ▸ TOAST      — canto inferior, sobre o dock
        ▸ PREVIEW    — popover ancorado ao tile
```

### A4.2 Breakpoints

O MASTER exige mínimo de 280 px. Quatro faixas normativas:

| Faixa | Largura | Layout |
|---|---|---|
| **Compact** | 280–339 px | Rail vira barra inferior de 44 px. Grid de 2 colunas. Inspector ocupa o painel inteiro, com botão ← voltar. Dock de recentes vira 3 itens. |
| **Default** | 340–479 px | Rail lateral 48 px. Grid de 3 colunas. Inspector como gaveta sobreposta, 88 % da largura. |
| **Comfort** | 480–719 px | Grid de 4 colunas. Inspector como gaveta de 320 px sobreposta com dimming de 40 %. |
| **Wide** | 720 px+ | Duas colunas reais: grid à esquerda, Inspector fixo à direita, 360 px, sem sobreposição. Prévia abre ao lado, não sobre o grid. |

Em Compact, nenhuma funcionalidade é removida — apenas reorganizada. Remover função por falta de espaço é proibido.

### A4.3 Tile de ferramenta

```text
┌──────────────────────┐
│  ◇                ⌄  │   ◇ ícone 20px monocromático
│                      │   ⌄ abre avançado (aparece no hover/foco)
│  Wiggle              │   nome 12px/600
│  Suave · 2 Hz     ●  │   preset atual 10px + ponto de estado
└──────────────────────┘
```

Ponto de estado, sempre acompanhado de forma ou texto, nunca só cor:

| Estado | Marca | Cor |
|---|---|---|
| Disponível | sem marca | — |
| Rig aplicado na seleção | ponto cheio ● | accent |
| Requisito ausente | traço — | neutro txt-3 |
| Precisa de licença | cadeado | neutro txt-2 |
| Aviso ativo (conflito) | triângulo ▲ | warning |

Estados de interação do tile: `default`, `hover`, `focus-visible`, `active/pressed`, `applying` (spinner de 12 px substituindo o ícone), `applied` (marca de confirmação por 700 ms), `disabled`.

### A4.4 Inspector — a gaveta do avançado

Ordem interna fixa, de cima para baixo:

1. **Cabeçalho**: nome da ferramenta, botão fechar, botão de ajuda `?`.
2. **Alvo**: o que será afetado, com contagem real. *"3 layers · 1 rig existente"*.
3. **Live Controls**: os mesmos parâmetros que existem no host, com o mesmo rótulo e a mesma ordem. Esta é a primeira coisa que o usuário vê, porque é o que ele mais usa.
4. **Presets**: chips horizontais roláveis, com o atual marcado; botão `+` salva o estado atual.
5. **Avançado**: acordeão fechado por padrão, com os parâmetros do §13 que não viraram Live Controls.
6. **Conflito**: seletor `skip` / `substituir com backup` / `envolver quando seguro`, com a explicação em uma linha.
7. **Rodapé fixo**: `Aplicar` · `Ajustar` · `Remover`. Nunca um botão só chamado "OK".

Cada slider do Inspector tem: rótulo, campo numérico editável, unidade, faixa recomendada visível e faixa dura respeitada. Duplo clique no rótulo restaura o valor do preset.

### A4.5 Dock de recentes e favoritos

- Seis últimas ferramentas usadas, em ordem de uso, com o preset aplicado.
- Fixar por menu contextual transforma em favorito, que não sai da lista.
- Clique no item do dock = Quick imediato com o mesmo preset. É o caminho mais rápido do produto e deve custar um único clique a partir de qualquer aba.
- Atalhos `Ctrl/Cmd`+`1..6` disparam os seis itens do dock.

### A4.6 Context strip

Uma linha de 28 px, sempre presente, que responde à pergunta "onde eu estou e o que está selecionado".

```text
AE 25.4 · Comp 01 · 1920×1080 · 30 fps · 3 layers        ⟳
```

Quando um requisito quebra, a mesma faixa vira alerta, mantendo altura — sem salto de layout:

```text
▲ Sem composição ativa · abra uma comp para usar Animate    [ Criar ]
```

### A4.7 Toast de resultado

```text
┌─────────────────────────────────────────────┐
│ ✓ Wiggle aplicado em 3 layers               │
│   3 controles criados na layer              │
│   [ Desfazer ]  [ Ajustar ]  [ Salvar ]     │
└─────────────────────────────────────────────┘
```

- Permanece **8 s** quando tem ação; 3 s quando é apenas confirmação; indefinido quando é erro recuperável.
- Empilha no máximo 3; o quarto substitui o mais antigo.
- Nunca cobre o dock nem o botão primário do Inspector.
- **Ajustar** abre o Inspector já apontado para o rig recém-criado — é o atalho que evita reaplicar.
- Warning aparece dentro do toast de sucesso, não como segundo toast.

### A4.8 Command palette

- `Ctrl/Cmd`+`K` abre; abre também pelo campo de busca do topo.
- Busca por nome, por sinônimo em pt-BR e en-US, por ID de comando e por preset.
- `Enter` aplica Quick. `Alt`+`Enter` abre o avançado. `Tab` percorre resultados.
- Cada resultado mostra a `oneLine` e o requisito, e fica esmaecido com o motivo quando indisponível — resultado indisponível não é escondido, porque esconder impede a descoberta.
- Máximo de 8 resultados visíveis, com rolagem virtualizada.

### A4.9 Navegação — revisão de §22.1

Mantém as abas do MASTER, com duas mudanças:

```text
Home        ← dock, favoritos, contexto, status  (default de abertura)
Animate
Keyframes
Anchor
Parallax
Camera
Shapes
Layers
Assets
Captions
Settings
```

1. **Home é a tela inicial real**, não uma aba decorativa: ela concentra dock, favoritos e busca. Um editor recorrente resolve 80 % das tarefas sem sair dela.
2. **Toda aba tem o mesmo esqueleto**: grid de tiles + inspector. Nenhuma aba inventa um layout próprio. Assets e Captions herdam o mesmo cabeçalho e o mesmo rodapé, mudando apenas o conteúdo central.

---

## A5. Design tokens — tema neutro com cor no lugar certo

### A5.1 Filosofia da cor

Três regras, verificáveis:

1. **Orçamento de cor**: em qualquer tela em repouso, no máximo **10 % dos pixels** carregam cor cromática. O resto é neutro. O conteúdo do usuário — thumbnails, prévias, cores de layer — não entra nesse orçamento.
2. **Cor é significado, nunca decoração.** O accent só pode aparecer em: ação primária, anel de foco, item ativo, indicador de rig aplicado, e badge Quick. Qualquer outro uso de accent é bug de UI.
3. **Cor nunca é o único portador de informação** (A7.2). Todo estado tem ícone ou texto.

### A5.2 Escala neutra — tema escuro, padrão

| Token | Hex | Uso |
|---|---|---|
| `--bg-0` | `#0E1013` | fundo mais profundo, trilho, áreas fora do conteúdo |
| `--bg-1` | `#141619` | fundo do painel |
| `--bg-2` | `#1A1D21` | superfície de tile, card, linha de lista |
| `--bg-3` | `#22262B` | hover de superfície, campo de entrada |
| `--bg-4` | `#2A2F35` | elevado: popover, gaveta, menu |
| `--line-hairline` | `#2C3137` | divisória decorativa |
| `--line-strong` | `#707880` | borda de componente interativo (3,78:1 sobre `--bg-2`) |
| `--txt-1` | `#E9ECEF` | texto primário (14,3:1 sobre `--bg-2`) |
| `--txt-2` | `#AAB2BB` | texto secundário (7,9:1) |
| `--txt-3` | `#7C858E` | texto terciário e desabilitado (4,5:1) |

### A5.3 Accent e semânticos — tema escuro

| Token | Hex | Contraste sobre `--bg-2` | Uso |
|---|---|---|---|
| `--accent` | `#7C8CFF` | 5,68:1 | ação primária, item ativo, indicador de rig |
| `--accent-hover` | `#9AA6FF` | 7,47:1 | hover e texto de link |
| `--accent-press` | `#6472F0` | 4,19:1 | estado pressionado |
| `--accent-on` | `#0E1013` | 6,40:1 sobre `--accent` | rótulo sobre preenchimento accent |
| `--ok` | `#43B77A` | 6,68:1 | sucesso |
| `--warn` | `#D9A441` | 7,52:1 | aviso, conflito de expressão |
| `--danger` | `#F0563E` | 4,92:1 | destrutivo, erro |
| `--info` | `#4CC2E0` | 8,13:1 | informação neutra, uso raro |

O accent é violeta-azulado deliberadamente distante do azul de seleção nativo do After Effects e do Premiere, para que o usuário nunca confunda "selecionado pelo host" com "aplicado pelo plugin".

### A5.4 Tema claro

Ativado quando o host está em UI clara. Mesma estrutura, mesmos nomes de token.

| Token | Hex | Contraste |
|---|---|---|
| `--bg-0` | `#FFFFFF` | — |
| `--bg-1` | `#F7F8F9` | — |
| `--bg-2` | `#F1F2F4` | — |
| `--bg-3` | `#E7E9EC` | — |
| `--bg-4` | `#FFFFFF` + sombra | — |
| `--line-hairline` | `#DCDFE3` | — |
| `--line-strong` | `#767E86` | 3,68:1 sobre `--bg-2` |
| `--txt-1` | `#16181B` | 15,9:1 sobre `--bg-2` |
| `--txt-2` | `#4E555C` | 6,8:1 |
| `--txt-3` | `#767E86` | 3,7:1 — apenas para texto desabilitado |
| `--accent` | `#4A57D8` | 5,1:1 · branco sobre ele: 5,8:1 |
| `--ok` | `#146C43` | 5,8:1 |
| `--warn` | `#8A5A00` | — |
| `--danger` | `#C0392B` | — |

### A5.5 Espaço, raio, elevação, tipo

```text
Espaçamento — base 4
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40

Raio
2  chip, badge
6  botão, campo, slider track
10 tile, card
14 popover, gaveta
999 pill

Elevação — apenas 3 níveis
e0  nenhum. superfícies de conteúdo
e1  0 1px 2px rgba(0,0,0,.24) + 0 0 0 1px var(--line-hairline)     tile hover, dropdown
e2  0 8px 24px rgba(0,0,0,.36) + 0 0 0 1px var(--line-hairline)    popover, toast
e3  0 16px 48px rgba(0,0,0,.48) + 0 0 0 1px var(--line-hairline)   gaveta, modal raro

Tipografia — pilha do sistema, sem webfont proprietária
UI:      -apple-system, "Segoe UI Variable Text", "Segoe UI", Inter, system-ui, sans-serif
Número:  mesma pilha com font-variant-numeric: tabular-nums
Mono:    ui-monospace, "Cascadia Mono", "SF Mono", Menlo, monospace   (só para IDs e logs)

11/16  micro     rótulo de unidade, badge
12/18  corpo     padrão da interface
13/20  ênfase    rótulo de tile, cabeçalho de campo
15/22  título    cabeçalho de gaveta
20/26  display   apenas em estado vazio e onboarding

Pesos: 400, 500, 600. Nunca 700+ na interface.
Letter-spacing: 0 em corpo; -0.01em em título; +0.04em em micro caixa-alta.
```

Números em sliders e campos sempre com `tabular-nums`, para que o valor não trema durante o arraste.

### A5.6 Folha de tokens

```css
:root {
  /* ——— neutros ——— */
  --bg-0:#0E1013; --bg-1:#141619; --bg-2:#1A1D21; --bg-3:#22262B; --bg-4:#2A2F35;
  --line-hairline:#2C3137; --line-strong:#707880;
  --txt-1:#E9ECEF; --txt-2:#AAB2BB; --txt-3:#7C858E;

  /* ——— cor, só onde significa ——— */
  --accent:#7C8CFF; --accent-hover:#9AA6FF; --accent-press:#6472F0; --accent-on:#0E1013;
  --accent-wash:rgba(124,140,255,.12); --accent-glow:rgba(124,140,255,.28);
  --ok:#43B77A; --warn:#D9A441; --danger:#F0563E; --info:#4CC2E0;

  /* ——— espaço e forma ——— */
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s7:32px; --s8:40px;
  --r-chip:2px; --r-ctl:6px; --r-tile:10px; --r-pop:14px; --r-pill:999px;
  --e1:0 1px 2px rgba(0,0,0,.24), 0 0 0 1px var(--line-hairline);
  --e2:0 8px 24px rgba(0,0,0,.36), 0 0 0 1px var(--line-hairline);
  --e3:0 16px 48px rgba(0,0,0,.48), 0 0 0 1px var(--line-hairline);

  /* ——— movimento ——— */
  --dur-1:90ms;   /* estado: hover, press */
  --dur-2:140ms;  /* revelação pequena: tooltip, chip, toast */
  --dur-3:200ms;  /* pop-up, cartão de prévia */
  --dur-4:280ms;  /* gaveta, troca de aba */
  --dur-5:420ms;  /* confirmação desenhada, uma vez por ação */
  --ease-out:cubic-bezier(.16,1,.3,1);      /* entrada, desaceleração longa */
  --ease-in:cubic-bezier(.4,0,1,1);         /* saída */
  --ease-std:cubic-bezier(.2,0,0,1);        /* movimento entre dois estados */
  --ease-pop:cubic-bezier(.34,1.4,.64,1);   /* overshoot curto, só pop-up */
  --stagger:22ms;

  /* ——— foco ——— */
  --focus-ring:2px solid var(--txt-1);
  --focus-offset:2px;
}

[data-theme="light"] {
  --bg-0:#FFFFFF; --bg-1:#F7F8F9; --bg-2:#F1F2F4; --bg-3:#E7E9EC; --bg-4:#FFFFFF;
  --line-hairline:#DCDFE3; --line-strong:#767E86;
  --txt-1:#16181B; --txt-2:#4E555C; --txt-3:#767E86;
  --accent:#4A57D8; --accent-hover:#3A46C4; --accent-press:#2F3AAC; --accent-on:#FFFFFF;
  --accent-wash:rgba(74,87,216,.10); --accent-glow:rgba(74,87,216,.22);
  --ok:#146C43; --warn:#8A5A00; --danger:#C0392B; --info:#0F6E8C;
  --e1:0 1px 2px rgba(16,24,40,.06), 0 0 0 1px var(--line-hairline);
  --e2:0 8px 24px rgba(16,24,40,.10), 0 0 0 1px var(--line-hairline);
  --e3:0 16px 48px rgba(16,24,40,.14), 0 0 0 1px var(--line-hairline);
}
```

### A5.7 Proibições

- gradiente decorativo em fundo de painel;
- accent em ícone que não representa ação nem estado;
- mais de um accent no produto;
- `backdrop-filter` sem fundo sólido de fallback e sem medição de custo em painel estreito;
- sombra colorida;
- ícone com duas cores;
- emoji como ícone de interface;
- texto dentro de imagem rasterizada;
- opacidade abaixo de 0,64 em texto — use o token de cor correto em vez de opacidade.

---

## A6. Sistema de movimento — microanimações premium

### A6.1 Princípios

1. **Movimento é resposta, não enfeite.** Toda animação existe para explicar de onde algo veio, para onde foi, ou que algo aconteceu.
2. **Entrada desacelera, saída acelera.** Entrada usa `--ease-out` com escala inicial de 0,96. Saída usa `--ease-in`, com **60 % da duração** da entrada e sem overshoot.
3. **Só `transform` e `opacity`.** São as únicas propriedades animáveis no compositor. Animar `width`, `height`, `top`, `left`, `margin`, `box-shadow` ou `filter` em transição é proibido — o Chromium do CEP não perdoa.
4. **Origem coerente.** O pop-up cresce a partir do ponto que o originou (`transform-origin` no tile), nunca do centro da tela.
5. **Teto de 2 propriedades por elemento**, e no máximo uma animação com overshoot por tela.
6. **Nada bloqueia.** O resultado do host nunca espera o fim de uma animação. A animação acompanha, não segura.

### A6.2 Catálogo normativo

| # | Elemento | Gatilho | Propriedade | Duração | Easing | `prefers-reduced-motion` |
|---|---|---|---|---|---|---|
| 01 | Tile | hover | `translateY(-1px)` + `background` | `--dur-1` | `--ease-std` | só `background` |
| 02 | Tile | press | `scale(.975)` | 60 ms | `--ease-in` | mantido (feedback tátil essencial) |
| 03 | Tile ⌄ avançado | hover/foco | `opacity 0→1` + `translateX(-2px→0)` | `--dur-1` | `--ease-out` | só `opacity` |
| 04 | Tooltip | repouso 600 ms | `opacity` + `translateY(4px→0)` | `--dur-2` | `--ease-out` | só `opacity` |
| 05 | **Cartão de prévia** | repouso 2000 ms | `opacity` + `scale(.94→1)` a partir da origem do tile | `--dur-3` | `--ease-pop` | `opacity`, sem escala; vídeo vira frame estático |
| 06 | Cartão de prévia | saída | `opacity` + `scale(1→.97)` | 120 ms | `--ease-in` | só `opacity` |
| 07 | Gaveta Inspector | abrir | `translateX(16px→0)` + `opacity` | `--dur-4` | `--ease-out` | só `opacity`, 120 ms |
| 08 | Gaveta Inspector | fechar | `translateX(0→12px)` + `opacity` | 170 ms | `--ease-in` | só `opacity` |
| 09 | Dimming atrás da gaveta | abrir/fechar | `opacity 0→.4` | `--dur-4` / 170 ms | `--ease-std` | mantido |
| 10 | Conteúdo da gaveta | após abrir | stagger de `--stagger` por bloco, máx. 6 blocos | `--dur-2` cada | `--ease-out` | sem stagger |
| 11 | Aba ativa (sublinhado) | troca | `translateX` + `scaleX` via FLIP | `--dur-3` | `--ease-std` | corte seco |
| 12 | Conteúdo da aba | troca | `opacity` + `translateY(6px→0)` | `--dur-2` | `--ease-out` | só `opacity` |
| 13 | Toast | entrada | `translateY(12px→0)` + `opacity` + `scale(.98→1)` | `--dur-3` | `--ease-pop` | só `opacity` |
| 14 | Toast | saída | `opacity` + `translateY(0→8px)` | 140 ms | `--ease-in` | só `opacity` |
| 15 | Marca de confirmação ✓ | sucesso | `stroke-dashoffset` desenhando o traço | `--dur-5` | `--ease-out` | ícone aparece pronto |
| 16 | Ripple no tile | aplicar | `scale(0→1)` + `opacity .18→0`, cor `--accent-wash` | 380 ms | `--ease-out` | suprimido |
| 17 | Pulso do Live Control | valor alterado no host | `box-shadow` accent-glow em 2 passos, 1 ciclo | 600 ms | `--ease-std` | borda estática por 1,2 s |
| 18 | Slider knob | arraste | `scale(1→1.12)` no grab | 90 ms | `--ease-out` | mantido |
| 19 | Trilho do slider | valor | `scaleX` do preenchimento | 0 ms durante arraste, `--dur-1` em salto | `--ease-std` | mantido |
| 20 | Skeleton de assets | carregando | translação de gradiente, 1,2 s em loop | loop | linear | barra estática pulsando opacidade |
| 21 | Barra de progresso | tarefa longa | `scaleX` determinístico | contínuo | linear | mantida |
| 22 | Chips de preset | seleção | `background` + `scale(.96→1)` | `--dur-1` | `--ease-pop` | só `background` |
| 23 | Command palette | abrir | `opacity` + `scale(.98→1)` + `translateY(-4px→0)` | `--dur-3` | `--ease-out` | só `opacity` |
| 24 | Context strip → alerta | requisito quebrou | crossfade de cor de fundo, **sem** mudança de altura | `--dur-2` | `--ease-std` | mantido |
| 25 | Estado vazio | entrada | `opacity` + `translateY(8px→0)`, stagger de 2 blocos | `--dur-3` | `--ease-out` | só `opacity` |

Duração máxima de qualquer transição de interface: **420 ms**. Acima disso, é sinalização de progresso, não transição.

### A6.3 Sequência do pop-up

O cartão de prévia é a assinatura visual do produto. Sequência exata:

```text
t=0        repouso completa 2000 ms
t=0        card monta invisível, transform-origin no ponto de ancoragem do tile
t=0→200ms  opacity 0→1 · scale .94→1 · ease-pop
t=60ms     poster estático já visível (primeiro frame do loop)
t=200ms    vídeo começa a tocar, silencioso, loop
t=+120ms   atalho e botões entram com opacity, stagger 22ms
```

Regras: o cartão nunca cobre o tile de origem; ele desloca para o lado disponível. Se não houver espaço em nenhum lado, ancora no rodapé do painel com uma seta apontando o tile. Reposicionamento nunca é animado — apenas a entrada é.

### A6.4 Feedback de aplicação — a corrente completa

Uma aplicação Quick produz exatamente esta sequência, em três atos:

```text
1. clique      → tile: scale .975 (60ms) + ripple accent-wash (380ms)
2. execução    → ícone vira spinner após 180ms, apenas se o comando ainda não retornou
3. retorno ok  → ícone vira ✓ desenhado (420ms) → volta ao ícone após 700ms
                 toast sobe (200ms)
                 tile ganha ponto de estado ● accent (fade 140ms)
                 se Live Controls foram criados: pulso 17 no primeiro controle
```

O spinner só aparece a partir de 180 ms. Comandos rápidos não devem piscar spinner — isso faz o produto parecer lento.

### A6.5 Regras técnicas obrigatórias

- `will-change: transform, opacity` aplicado **no início** da interação e **removido** ao fim. Nunca permanente em elemento de lista.
- `contain: layout paint` em cada tile, para isolar o custo de repaint no grid.
- Grid de assets virtualizado (§27), com no máximo 40 nós animáveis simultâneos.
- Nenhuma animação em elemento fora da viewport.
- `transition` declarado por propriedade explícita. `transition: all` é proibido.
- Toda animação declarada via tokens; valor de duração ou easing escrito direto no componente é falha de revisão.
- Animação nunca é usada para mascarar latência do host. Se o host demora, a interface mostra progresso real, com etapa e cancelamento (§2).
- O `prefers-reduced-motion` do sistema pode não chegar ao CEP de forma confiável: é obrigatório um **toggle próprio** em Settings → Interface → Reduzir movimento, e a preferência efetiva é `OR` entre as duas fontes.

### A6.6 Base CSS

```css
@media (prefers-reduced-motion: reduce), (--chms-reduced-motion: 1) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }
  /* exceções: feedback que carrega significado permanece, apenas encurtado */
  .tile:active { transition-duration: 60ms !important; transform: scale(.975); }
  .progress__fill { transition-duration: 200ms !important; }
}

.tile {
  contain: layout paint;
  border-radius: var(--r-tile);
  background: var(--bg-2);
  transition: transform var(--dur-1) var(--ease-std),
              background-color var(--dur-1) var(--ease-std);
}
.tile:hover { transform: translateY(-1px); background: var(--bg-3); }
.tile:active { transform: scale(.975); transition-duration: 60ms; }
.tile:focus-visible { outline: var(--focus-ring); outline-offset: var(--focus-offset); }

.popover {
  transform-origin: var(--origin-x, 50%) var(--origin-y, 100%);
  box-shadow: var(--e2);
  border-radius: var(--r-pop);
  background: var(--bg-4);
  animation: pop-in var(--dur-3) var(--ease-pop) both;
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(.94); }
  to   { opacity: 1; transform: scale(1); }
}
.popover[data-closing] { animation: pop-out 120ms var(--ease-in) both; }
@keyframes pop-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(.97); }
}

.drawer { animation: drawer-in var(--dur-4) var(--ease-out) both; box-shadow: var(--e3); }
@keyframes drawer-in {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}

.live-pulse { animation: live-pulse 600ms var(--ease-std) 1; }
@keyframes live-pulse {
  0%   { box-shadow: 0 0 0 0 var(--accent-glow); }
  60%  { box-shadow: 0 0 0 4px var(--accent-glow); }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
}

.stagger > * { animation: rise var(--dur-2) var(--ease-out) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: 22ms; }
.stagger > *:nth-child(3) { animation-delay: 44ms; }
.stagger > *:nth-child(4) { animation-delay: 66ms; }
.stagger > *:nth-child(5) { animation-delay: 88ms; }
.stagger > *:nth-child(n+6) { animation-delay: 110ms; }
@keyframes rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
```

### A6.7 Aceite

- Nenhuma transição da interface anima propriedade que dispare layout. Verificado por lint de CSS no CI.
- Interação de UI sem host responde em ≤ 100 ms (§27), medido com o painel em 280 px na máquina de referência.
- O grid mantém 60 fps em rolagem com 200 ferramentas registradas.
- Com movimento reduzido ativo, nenhuma informação é perdida: todo estado continua legível e todo feedback continua perceptível.
- O toggle interno de movimento reduzido funciona mesmo quando o sistema não propaga a preferência ao CEP.

---

## A7. Acessibilidade — substitui §22.4

### A7.1 Alvo de conformidade

**WCAG 2.2 nível AA** como piso, dentro dos limites do runtime de cada host. Onde o runtime impedir o cumprimento, registrar a limitação em `docs/QA_MATRIX.md` com a causa técnica e a alternativa oferecida. Limitação documentada é aceitável; limitação silenciosa não é.

### A7.2 Contraste e cor

| Regra | Valor | Critério |
|---|---|---|
| Texto normal | ≥ 4,5:1 | 1.4.3 |
| Texto ≥ 18,66 px 600 | ≥ 3:1 | 1.4.3 |
| Borda de componente interativo, ícone que carrega significado, estado | ≥ 3:1 | 1.4.11 |
| Indicador de foco contra o entorno | ≥ 3:1 | 1.4.11 |
| Texto desabilitado | ≥ 4,5:1 mesmo sendo isento | política interna |

- Todos os pares da tabela de tokens (A5.2, A5.3, A5.4) foram calculados e devem ser **testados no CI**: a tarefa `a11y:contrast` reprova o build se qualquer par cair abaixo do alvo.
- **Nunca só cor**: cada estado do tile tem forma (●, —, ▲, cadeado) além de cor; cada mensagem tem ícone e texto; gráficos de curva usam traço distinto além de cor.
- Teste obrigatório em simulação de deuteranopia, protanopia e tritanopia sobre as capturas do painel.

### A7.3 Foco e teclado

Operação **completa** por teclado é requisito de release, não item de melhoria.

```text
Tab / Shift+Tab   percorre as regiões: context strip → busca → grid → dock → status
↑ ↓ ← →           navegam dentro do grid (roving tabindex, uma única parada de Tab)
Home / End        primeiro / último tile da seção
Enter             aplica Quick
Alt + Enter       abre Advanced
?                 abre o cartão de prévia do tile focado
Esc               fecha popover/gaveta e devolve o foco ao elemento de origem
Ctrl/Cmd + K      command palette
Ctrl/Cmd + 1..6   dispara os seis itens do dock
Ctrl/Cmd+Shift+A  Ajustar o último rig aplicado
Ctrl/Cmd+Shift+R  Repetir o último comando na seleção atual
Espaço            alterna checkbox / expande acordeão
```

- **Anel de foco**: `2px solid var(--txt-1)` com `outline-offset: 2px`. Sobre preenchimento accent, o deslocamento garante que o anel encoste na superfície de fundo, mantendo ≥ 3:1 dos dois lados. Nunca remover `outline` sem substituir por indicador equivalente.
- **Foco não obscurecido** (2.4.11): gaveta e toast nunca cobrem o elemento focado; o grid rola para manter o foco visível com 8 px de folga.
- **Sem armadilha de foco**: a gaveta prende o foco enquanto aberta como sobreposição, e o libera ao fechar, devolvendo ao tile de origem.
- **Ordem de leitura** igual à ordem visual em todos os quatro breakpoints. Reordenação por CSS que quebre a ordem do DOM é proibida.
- Todos os atalhos são **remapeáveis** e é possível desligar os de tecla única (`?`), conforme 2.1.4.

### A7.4 Alvos de toque e ponteiro

| Contexto | Mínimo | Recomendado |
|---|---|---|
| Alvo interativo geral | 24×24 px (2.5.8 AA) | 32×32 px |
| Tile de ferramenta | 88×72 px | — |
| Knob de slider | 20 px visual | 32 px de área |
| Ícone-botão no cabeçalho | 28×28 px | 32×32 px |
| Espaçamento entre alvos | ≥ 4 px | 8 px |

**Sem gesto obrigatório de arraste** (2.5.7): a curva Bézier, os sliders e o reordenamento têm sempre alternativa por clique, campo numérico ou teclado.

### A7.5 Leitor de tela

- Todo componente próprio expõe papel, nome e estado. Nada de `div` clicável sem `role` e sem nome acessível.
- Tile: `role="button"`, nome = nome da ferramenta, `aria-describedby` apontando para a `oneLine`, `aria-disabled` com `aria-describedby` do motivo quando indisponível.
- Grid: `role="grid"` com navegação por setas e `aria-rowcount`/`aria-colcount` reais.
- **Regiões vivas**: resultado e progresso em `aria-live="polite"`; apenas erro de operação destrutiva usa `assertive`.
- Progresso longo anuncia etapa e percentual a cada 10 %, não a cada frame.
- O texto do anúncio de resultado é o mesmo do toast, em uma frase: *"Wiggle aplicado em 3 layers. 3 controles criados."*
- No CEP, validar com NVDA e Narrator no Windows e VoiceOver no macOS. No UXP, testar o que o runtime expõe e **documentar honestamente** o que não expõe, em vez de declarar suporte inexistente.

### A7.6 Sliders e o editor de curva Bézier

Sliders:

- `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` e **`aria-valuetext` com unidade** — *"12 pixels"*, não *"12"*;
- setas movem 1 passo; `Shift`+seta move 10 passos; `Page Up/Down` move 10 %; `Home`/`End` vão aos limites;
- campo numérico sempre presente ao lado, com a mesma faixa e a mesma unidade;
- duplo clique no rótulo restaura o valor do preset.

Editor de curva (§15 do MASTER):

- `Tab` alterna entre os dois pontos de controle;
- setas movem 0,01; `Shift`+setas movem 0,10;
- quatro campos numéricos `x1 y1 x2 y2` sempre visíveis, editáveis;
- presets acessíveis por `1`..`9`;
- `aria-valuetext` descreve a curva em linguagem natural — *"entrada suave, saída rápida, sem overshoot"*;
- a curva é lida também como texto: *"cubic-bezier 0,25 0,10 0,25 1,00"*;
- **arraste nunca é o único caminho**.

### A7.7 Tempo e movimento

- O repouso de 2 s abre informação **complementar**; nenhuma função depende dele.
- Toast com ação permanece 8 s no mínimo e pode ser fixado ao receber foco (2.2.1).
- Nada pisca acima de 3 vezes por segundo (2.3.1). O pulso do Live Control é um ciclo único.
- Reduzir movimento nunca remove feedback essencial — apenas encurta ou substitui por mudança de estado.
- Prévia em vídeo é silenciosa, com controle de pausa e sem reprodução automática acima de 5 s.

### A7.8 Texto, idioma e escala

- Tamanho mínimo 11 px, e apenas para micro-rótulo; corpo em 12 px.
- Escala de UI a 100 %, 125 %, 150 % e 200 %: nenhum corte de texto, nenhuma sobreposição, nenhuma rolagem horizontal em 280 px de largura (1.4.10).
- Texto redimensionável até 200 % sem perda de função (1.4.4).
- pt-BR e en-US desde o primeiro commit, incluindo **mensagens de erro**, rótulos de Live Controls e nomes de camadas criadas.
- Nenhum texto dentro de imagem rasterizada (1.4.5).
- `lang` correto no documento e nos blocos que trocam de idioma.

### A7.9 Checklist por feature

Toda feature adiciona à Definition of Done:

- [ ] Operável só com teclado, do foco inicial ao resultado.
- [ ] Anel de foco visível em todos os estados, sem obstrução.
- [ ] Nome acessível em todo controle interativo.
- [ ] Nenhuma informação só por cor.
- [ ] Contraste aprovado pela tarefa `a11y:contrast`.
- [ ] Alvos ≥ 24 px com espaçamento ≥ 4 px.
- [ ] Live region anuncia resultado e erro.
- [ ] Sem gesto de arraste obrigatório.
- [ ] Funciona com movimento reduzido.
- [ ] Testado em 100 % e 200 % de escala, em 280 px de largura.
- [ ] Strings em pt-BR e en-US.

### A7.10 Aceite

- Um editor consegue aplicar, ajustar e remover qualquer rig sem tocar no mouse.
- `axe-core` sem violação de nível `serious` ou `critical` em todas as telas, no CI.
- Captura de todas as telas aprovada nos três filtros de daltonismo.
- Nenhuma regressão de contraste passa pelo CI.

---

## A8. Matriz Quick por comando

Normativa. Cobre todo o catálogo do §13 mais os módulos das seções 14 a 20. Colunas:

- **Um clique faz** — comportamento exato do Quick, com defaults derivados por A1.3.
- **Live Controls** — controles criados no host (A2). `—` significa operação de dados sem parâmetro contínuo.
- **Avançado abre** — o que o Inspector expõe além dos Live Controls.

### A8.1 Animação e expressão

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.animate.wiggle` | Wiggle em Position das layers selecionadas, 2 Hz, amplitude 12 px escalada pela resolução, seed pelo índice da layer | Frequência · Amplitude · Seed · Suavizar (posterize) | dimensões separadas, fase temporal, propriedade alvo, conflictMode |
| `ae.animate.flicker` | Flicker em Opacity, modo *random-hold*, 8 Hz, hold de 2 frames, faixa 40–100 % | Frequência · Mínimo · Máximo · Hold (frames) · Seed | modos noise/strobe, probabilidade, bake para keyframes |
| `ae.animate.inertial` | Inércia sobre os keyframes existentes, amortecimento médio; sem keys, avisa e não aplica | Amplitude · Frequência · Decaimento | por propriedade, limite de overshoot, bake |
| `ae.animate.jump` | Salto no CTI com squash leve, duração 0,5 s no fps real | Altura · Duração · Squash · Gravidade | curva de queda, offset por layer, anticipação |
| `ae.animate.kinetic` | Overshoot cinético nos keys selecionados, 1 oscilação | Overshoot · Bounce · Decaimento | número de oscilações, por eixo, bake |
| `ae.expression.loopout` | `loopOut("cycle")` na propriedade animada da seleção | Modo (dropdown) · Ciclos · Offset | pingpong/continue/offset, numKeyframes, loopIn simultâneo |
| `ae.expression.smooth` | `smooth()` com width 0,2 s e 5 amostras | Largura · Amostras | por dimensão, janela adaptativa, preservar extremos |
| `ae.rig.effector` | Cria null *Effector* no centro da seleção com falloff radial sobre Scale | Raio · Falloff · Força · Propriedade (dropdown) | múltiplas propriedades, curva de falloff, modo aditivo |
| `ae.audio.beat` | Analisa a camada de áudio da comp, cria markers e um controller Beat | Sensibilidade · Intervalo mínimo · Resposta · Decaimento | faixa de frequência, offset, escolher trilha, bake para keys |

### A8.2 Keyframes e tempo

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.keys.ease.apply` | Aplica a curva favorita aos keyframes selecionados | — | editor Bézier completo, presets, salvar/excluir preset |
| `ae.keys.cut` | Remove keyframes fora da work area | — | intervalo customizado, por propriedade, preview da remoção |
| `ae.keys.delay` | Delay progressivo por expressão, 2 frames por layer na ordem de seleção | Delay (frames) · Ordem (dropdown) · Curva | por propriedade, ordem aleatória com seed, bake para keys |
| `ae.keys.copy` | Copia os keys da primeira layer para as demais, mantendo o tempo relativo | — | offset, escala temporal, seleção de propriedades |
| `ae.keys.duplicate` · `reverse` · `duplicate-reverse` · `send-start` · `send-end` | Executa a operação nos keys selecionados no CTI | — | offset, espelhar valor, intervalo alvo |
| `ae.time.controller` | Time Remap com controller de velocidade em 1,0 e rampas curtas | Velocidade · Ramp In · Ramp Out · Congelar | curva de velocidade, freeze frames, frame blending |
| `ae.time.marker-loop` | Loop entre os dois markers mais próximos do CTI | Repetições · Offset · Ease | escolher markers, crossfade, loop de comp |

### A8.3 Anchor, layers e projeto

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.anchor.align` | Grade 3×3: cada célula é um Quick. Move o anchor preservando a posição visual | — | modos Reverse/Convex/Concave/Random, source de bounds, seed, tempo fixo |
| `ae.layer.create-null` | Cria null no centro da seleção e parenta as layers, preservando transform | — | nome, tamanho, 3D, não parentar, herdar transform |
| `ae.layer.parent` | Parenta a seleção na layer mais alta, preservando world transform | — | escolher pai, parentar por índice, remover parent |
| `ae.layer.rename` | Renomeia pelo padrão do último uso, com prévia dos nomes antes de aplicar | — | tokens de nome, numeração, busca e substituição, por tipo |
| `ae.layer.flip` | Espelha horizontalmente preservando anchor e posição visual | — | eixo vertical, por anchor ou por centro da comp, em grupo |
| `ae.layer.reverse-order` | Inverte a ordem das layers selecionadas preservando parents | — | inverter só em intervalo, preservar travadas |
| `ae.comp.fast-edit` | Abre a comp selecionada em modo de edição rápida, com contexto preservado | — | opções de retorno, breadcrumbs, comps aninhadas |
| `ae.project.clean` | **Sem Quick** — `destructive: true`. Clique abre prévia do que será removido | — | escopo, itens não usados, apenas itens da suíte, exportar relatório |

### A8.4 Shapes, vetor e 3D

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.shape.library` | Insere a shape do último uso no centro da comp, escalada pela resolução | Tamanho · Espessura · Canto · Cor | biblioteca completa, alinhamento, preenchimento/traço, grupo |
| `ae.shape.trim-path` | Trim de 0 a 100 % começando no CTI, 1 s, com ease | Início · Fim · Offset · Duração | por caminho, ordem, delay entre caminhos, bake |
| `ae.shape.break` | **Prévia primeiro** — separa a shape em grupos independentes | — | critério de separação, preservar transform de grupo, nomear |
| `ae.vector.text-to-vector` | **Prévia primeiro** — converte texto em shape layer, mantendo o original desligado | — | preservar original, agrupar por letra/palavra, otimizar caminho |
| `ae.vector.ai-to-vector` | **Prévia primeiro** — converte layer de `.ai` em shape editável | — | qualidade, agrupar por camada do Illustrator, escala |
| `ae.3d.orbit` | Órbita ao redor do centro da comp, uma volta na duração da layer | Raio · Velocidade · Inclinação · Fase | eixo, alvo customizado, easing, sentido |
| `ae.3d.look-at` | Aponta as layers 3D selecionadas para a câmera ativa | Peso · Offset X · Offset Y · Amortecimento | alvo alternativo, travar eixo, limite de ângulo |
| `ae.3d.cylinder` | Monta cilindro com 12 faces a partir da layer selecionada | Raio · Faces · Altura · Rotação | mapeamento, faces individuais, fechamento, material |
| `ae.3d.cube` | Monta cubo a partir da layer, arestas iguais ao menor lado | Tamanho · Rotação X/Y/Z · Explodir | faces separadas, textura por face, pivô |

### A8.5 Efeitos e estilo

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.style.neon` | Neon com cor amostrada do conteúdo, núcleo + glow duplo, texto continua editável | Largura do núcleo · Raio do glow · Intensidade · Flicker | modo stack, cores separadas, precompor, traço externo |
| `ae.effect.echo` | Echo com 5 ecos e decaimento 0,7 | Número · Tempo · Decaimento · Mistura | modo de composição, echo temporal x espacial |
| `ae.effect.glitch` | Glitch leve, 10 % de probabilidade por frame, RGB split sutil | Intensidade · Frequência · RGB Split · Seed | blocos, deslocamento vertical, ruído, modo digital/analógico |
| `ae.effect.particles` | Emissor no centro com preset padrão e vida de 2 s | Taxa · Vida · Velocidade · Tamanho · Gravidade | forma do emissor, física, cor por idade, colisão |
| `ae.effect.wave` | Onda suave horizontal, amplitude escalada pela resolução | Amplitude · Comprimento · Velocidade · Direção | eixo, distorção por máscara, fase por layer |
| `ae.effect.tile` | Tile 3×3 centrado, sem espaçamento | Colunas · Linhas · Espaço · Offset | espelhamento, offset alternado, recorte |
| `ae.asset.texture` | Aplica a textura do último uso em overlay a 20 % | Opacidade · Escala · Mistura (dropdown) | biblioteca, encaixe, cor, animar deslocamento |
| `ae.text.box` | Caixa atrás do texto com padding de 24 px, canto 8, cor da UI | Padding X · Padding Y · Canto · Opacidade · Offset | acompanhar bounds dinâmicos, cauda, alinhamento, traço |

### A8.6 Parallax e câmera

| Comando | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| `ae.animate.parallax.quick` | Rig 2.5D a partir da ordem das layers: converte para 3D, distribui profundidade, cria câmera e controller, preserva o enquadramento | Profundidade · Força · Foco · Balanço | ordem manual, auto focus, wiggle, zoom, bake, adjust |
| Parallax avançado (§16) | Cada subcomando entra pelo Inspector do rig existente, nunca cria um segundo rig | herdam o controller do rig | create/auto-focus/wiggle/null/focus/zoom/bake/adjust |
| Transições de câmera (§17) | Aplica o preset no CTI com duração de 1 s; cada preset do catálogo é um tile próprio | Duração · Distância · Ângulo · Motion Blur | curva, ponto de origem, layers afetadas, encadear presets |

### A8.7 Assets, legendas e SFX

| Fluxo | Um clique faz | Live Controls | Avançado abre |
|---|---|---|---|
| Assets — item do grid | Importa e insere no CTI da comp/sequência ativa, com atribuição registrada | — | destino, escala de importação, bin, substituir seleção |
| Assets — busca | Busca com debounce de 250–400 ms e resultado virtualizado | — | filtros, orientação, licença, provider |
| Captions — gerar | Gera legendas com o último estilo, no idioma detectado | Tamanho · Posição Y · Palavras por linha · Destaque | estilo por palavra, segmentação, karaokê, animação, exportar |
| Captions — importar | Importa SRT/VTT selecionado e aplica o último estilo | mesmos acima | mapeamento de tempo, correção de timebase, revisão |
| SFX automático | Sugere SFX pelos markers e insere em trilha dedicada, com prévia antes | Volume · Offset · Variação | regras, catálogo, densidade, substituir |

### A8.8 Regras gerais da matriz

1. **Comando sem parâmetro contínuo não inventa slider.** Em compensação, o toast oferece **Ajustar** — que reabre o comando com os mesmos alvos e valores — e **Repetir** para nova seleção.
2. **Comando destrutivo não tem Quick.** Clique abre prévia. Declarado em `destructive: true`, jamais decidido pela UI.
3. **Cada preset do catálogo de transições de câmera é um tile próprio.** Escolher preset dentro de um diálogo é um clique a mais que o produto não pode cobrar.
4. **Toda célula da grade 3×3 do Anchor é um Quick.** Nove ações de um clique, não uma ação com nove opções.
5. Nenhum comando pode exigir mais de **3 Live Controls** para produzir seu efeito característico. Se exigir, o preset está mal calibrado.

---

## A9. Extensão do schema de preset — §23

```ts
export interface PresetDefinition {
  schemaVersion: 2;                    // era 1
  id: string;
  version: string;
  displayName: Record<string, string>;
  category: string;
  hosts: HostId[];
  minHostVersion?: Record<HostId, string>;
  requirements: string[];
  controls: PresetControl[];
  operationPlan: unknown;

  /** NOVO — obrigatório em todo preset marcado como quick. */
  quick?: {
    isDefault: boolean;
    liveControls: LiveControlBinding[];
    budgetMs: number;
    oneLine: Record<"pt-BR" | "en-US", string>;
    needs: Record<"pt-BR" | "en-US", string>;
    creates: Record<"pt-BR" | "en-US", string>;   // "3 controles na layer"
  };

  /** NOVO — agora obrigatório, não opcional. */
  preview: {
    poster: string;      // primeiro frame, estático
    loop: string;        // ≤ 3 s, ≤ 400 KB, sem áudio
    fixtureId: string;   // fixture que gerou o render
    renderedAt: string;
    checksum: string;
  };

  checksum: string;
  signature?: string;
}
```

Regras adicionais às do §23:

- migração `schemaVersion 1 → 2` obrigatória, com teste de round-trip;
- `preview` deixa de ser opcional: preset sem prévia não é publicável;
- `quick.liveControls` deve casar exatamente, em `paramId` e ordem, com o que o adapter cria no host — verificado por teste de contrato;
- preset remoto continua assinado e não pode conter JavaScript.

---

## A10. Orçamentos adicionais de performance — §27

| Operação | Meta |
|---|---|
| Clique no tile até primeira resposta visual | ≤ 50 ms |
| Quick simples até resultado no host | ≤ 400 ms (`budgetMs` por comando manda) |
| Abertura do cartão de prévia após o repouso | ≤ 200 ms |
| Primeiro frame do vídeo da prévia | ≤ 120 ms após montagem |
| Abertura do Inspector com Live Controls preenchidos | ≤ 250 ms |
| Leitura do vetor de valores do rig | ≤ 40 ms |
| Commit de arraste de slider até refletir no host | ≤ 120 ms |
| INP da interface | ≤ 200 ms no percentil 95 |
| Quadros perdidos durante qualquer animação do catálogo A6.2 | 0 na máquina de referência |
| Nós animáveis simultâneos | ≤ 40 |
| Peso total dos assets de prévia no bundle | ≤ 12 MB, com carga sob demanda |

O harness de performance de UI roda no CI com o painel em 280 px e em 720 px, e falha o build em regressão acima de 15 %.

---

## A11. Definition of Done — itens adicionais ao §33

Somam-se à lista existente. Uma feature só recebe `Done` quando também:

- [ ] Possui `QuickProfile` com `derive` testado em 4 fps e 3 resoluções.
- [ ] O caminho Quick funciona sem nenhuma entrada do usuário, em host real.
- [ ] Emite Live Controls quando há parâmetro contínuo, e eles são editáveis com o plugin fechado.
- [ ] Reaplicar entra em Adjust e não duplica rig.
- [ ] Congelar e desacoplar funcionam, e o projeto congelado renderiza sem a suíte instalada.
- [ ] Possui asset de prévia renderizado de fixture real, dentro do orçamento.
- [ ] `oneLine`, `needs` e `creates` existem em pt-BR e en-US.
- [ ] Estado desabilitado explica o requisito e oferece ação corretiva.
- [ ] Passa no checklist de acessibilidade A7.9.
- [ ] Respeita os orçamentos de A10, medidos e registrados.
- [ ] Nenhuma expressão gerada contém literal numérico de parâmetro exposto.
- [ ] Efeito resolvido por nome customizado e propriedade por índice `(1)`; testado em host localizado e com a pilha de efeitos reordenada.
- [ ] Nomes de controle únicos na layer e com unidade explícita.
- [ ] Nenhuma animação da UI anima propriedade que dispare layout.

---

## A12. Backlog — issues CHMS-UX

Numeração paralela à do §32. Dependem de `CHMS-003` (contracts) e `CHMS-008` (UI shell).

| Issue | Título | Dependências | Aceite resumido |
|---|---|---|---|
| CHMS-UX-001 | Pacote `ui-tokens` com tema neutro claro/escuro | 008 | Tokens de A5 aplicados; `a11y:contrast` no CI reprova regressão. |
| CHMS-UX-002 | Pacote de movimento + movimento reduzido | UX-001 | Catálogo A6.2 implementado; toggle interno funciona sem preferência do SO. |
| CHMS-UX-003 | Kit de componentes: tile, botão, slider, chip, popover, gaveta, toast | UX-001,002 | Todos com estados completos e teclado. |
| CHMS-UX-004 | `QuickProfile` no contracts e no registry | 003 | Schema, validação e migração de preset v1→v2. |
| CHMS-UX-005 | Derivador de defaults por contexto | UX-004 | Funções puras com fixtures de fps e resolução. |
| CHMS-UX-006 | Live Controls — writer/reader/updater AE | 004,009,011 | Cria, lê, atualiza e religa controles por índice, sem dependência de idioma. |
| CHMS-UX-007 | Live Controls — Premiere via MOGRT/ComponentParam | 005,045 | Paridade de `paramId`; fallback honesto quando indisponível. |
| CHMS-UX-008 | Sincronização painel ↔ host com polling governado | UX-006,007 | 1 dispatch por 500 ms só com Inspector aberto; divergência sinalizada. |
| CHMS-UX-009 | Congelar / Desacoplar / Limpar controles | UX-006 | Projeto congelado renderiza sem a suíte. |
| CHMS-UX-010 | Hover-intent, tooltip e cartão de prévia | UX-003 | 2 s configurável; paridade por teclado e toque; WCAG 1.4.13. |
| CHMS-UX-011 | Pipeline `previews:render` no CI | UX-010, fixtures | Render real por fixture; ≤ 400 KB; checksum no preset. |
| CHMS-UX-012 | Command palette e dock de recentes/favoritos | UX-003 | Busca bilíngue; `Ctrl/Cmd`+`1..6`; resultado indisponível com motivo. |
| CHMS-UX-013 | Inspector e os quatro breakpoints | UX-003 | Nenhuma função removida em 280 px; ordem de leitura preservada. |
| CHMS-UX-014 | Toast com Desfazer / Ajustar / Salvar | UX-003 | 8 s com ação; **Ajustar** abre o rig recém-criado. |
| CHMS-UX-015 | Estados desabilitados com motivo e ação corretiva | 006 | Toda capability ausente vira frase acionável. |
| CHMS-UX-016 | Harness de acessibilidade no CI | UX-003 | `axe-core` sem `serious`/`critical`; teste de teclado por tela. |
| CHMS-UX-017 | Harness de performance de UI | UX-002,003 | INP, frames perdidos e orçamentos de A10 medidos e versionados. |
| CHMS-UX-018 | Onboarding: 4 coach marks e dicas progressivas | UX-010,014 | Dispensável, não repete, desligável. |
| CHMS-UX-019 | Migração da grade 3×3 do Anchor para 9 Quicks | 017, UX-004 | Cada célula aplica direto, preservando posição visual. |
| CHMS-UX-020 | Tiles individuais para cada preset de transição de câmera | 024, UX-004 | Um clique aplica; duração e distância viram Live Controls. |

Ordem sugerida: UX-001 → UX-002 → UX-003 → UX-004 → UX-005 → UX-006 → UX-008 → UX-010 → UX-014 → UX-013 → UX-012 → UX-016 → UX-017 → o restante em paralelo às features.

---

## A13. Riscos e decisões que exigem ADR

Somam-se ao §35 do MASTER. O agente **para e registra ADR** quando:

- for necessário fonte tipográfica não pertencente à pilha do sistema, por licenciamento;
- o conjunto de ícones vier de biblioteca de terceiros — verificar licença e jamais derivar de plugin de referência;
- o custo de `backdrop-filter` no Chromium do CEP inviabilizar o efeito de camada elevada;
- o Premiere não expuser evento de seleção e o polling se mostrar custoso em projeto grande;
- a marca definitiva mudar o accent e exigir recálculo de toda a tabela de contraste;
- houver proposta de telemetria de uso da interface — decisão de privacidade, não de produto;
- houver proposta de som de feedback — decisão de acessibilidade, não de estética.

Riscos conhecidos e mitigação:

| Risco | Impacto | Mitigação |
|---|---|---|
| Live Controls poluem o Effect Controls do usuário | Rejeição por editores avançados | Limite de 12 por layer; promoção para controller; **Limpar controles** sempre à mão; nomeação prefixada e agrupada |
| Quick aplica algo que o usuário não esperava | Perda de confiança | Campo **Vai criar** no cartão de prévia; um Undo cobre tudo; nunca converte para 3D sem aviso |
| Prévias inflam o bundle | Tempo de instalação | Orçamento de 12 MB, carga sob demanda, poster antes do loop |
| Polling degrada projeto grande | Travamento | Três condições simultâneas para ligar; desliga ao perder foco; fingerprint barato |
| Movimento reduzido não chega ao CEP | Barreira de acessibilidade | Toggle próprio, `OR` com a preferência do SO |
| Accent confundido com seleção do host | Erro de leitura da interface | Accent violeta-azulado, distante do azul nativo dos dois hosts |

---

## A14. Resumo executável para o agente

```text
Leia docs/MASTER_BUILD_SPEC.md e depois docs/ADDENDUM_A_QUICK_UX_SPEC.md antes de editar a UI.

Este addendum é normativo sobre interface, acessibilidade e ergonomia.
Ele substitui §22.3 e §22.4 do MASTER e estende §8, §11, §13, §23, §27, §32 e §33.

Três leis:
1. Um clique entrega resultado, com defaults derivados do contexto real.
2. Todo parâmetro contínuo vira controle deslizante no host, na layer ou no controller.
3. Toda ferramenta se explica em uma linha e mostra prévia real após 2 s de repouso.

Regras que não se negociam:
- Live Control é o efeito Expression Control na layer (ADBE Slider Control e irmãos), nunca um widget do painel;
- expressão gerada nunca contém literal numérico de parâmetro exposto;
- resolver o EFEITO por nome customizado e a PROPRIEDADE por índice (1) — nome de propriedade é traduzido, índice de efeito quebra na reordenação;
- limite de valor vive na expressão, porque o Controle Deslizante não tem faixa configurável por script;
- reaplicar entra em Adjust, nunca duplica rig;
- comando destrutivo não tem caminho de um clique;
- prévia é render real de fixture, nunca mockup;
- nenhuma informação só por cor, nenhuma função só por mouse, nenhum hover sem paridade;
- animação usa apenas transform e opacity, com teto de 420 ms;
- todo par de cor da tabela de tokens é testado no CI.

Comece por CHMS-UX-001 e siga a ordem sugerida em A12.
Ao concluir cada issue: lint, typecheck, test, a11y:contrast, previews:render, build, validate.
Atualize CHANGELOG.md, QA_MATRIX.md e este documento quando uma decisão mudar.
```

---

**Fim do Addendum A.**
