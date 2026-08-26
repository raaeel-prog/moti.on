# Changelog

## Não lançado

Fase P0 (fundação) conforme `docs/MASTER_BUILD_SPEC.md` §39. Ainda não é release: o package raiz, os dois packages de host e os dois manifests continuam em `0.1.0`. `BUILD_INFO.json` deriva do package raiz, mas a sincronização automática dos demais campos de versão continua pendente; a versão só sobe quando houver um release para numerar.

### Estado de verificação deste worktree

- `PASS` automatizado final: em **2026-08-25**, `npm.cmd run check` no branch `Codex`/worktree integrado concluiu lint, typecheck, build, validate, **326/326 testes** e skills validate.
- `PASS` no After Effects real: build Moti.on carregado no **After Effects 26.3x87**, CEP **12.0.1**, Windows 11; estado ocioso correto da verificação de sistema, contexto, capability probe, round-trip Unicode, criação da composição de teste, rótulo localizado de Undo e Undo em um passo foram observados.
- `FAIL` corrigido no After Effects real: o `<ScriptPath>` produziu modal de erro de sintaxe na linha 1. Depois de removê-lo e reinstalar o mesmo bundle, uma inicialização limpa abriu sem modal e o bootstrap oficial por `$.evalFile` passou.
- `NOT RUN`: carregamento deste build no Premiere Pro, transação/Undo Premiere, exportação pelo picker UXP e matriz visual/acessível completa nos hosts.
- `NOT RUN`: revisão visual no browser. Nenhuma captura ou interação de browser foi executada neste ciclo.

O vocabulário acima é literal: `PASS` significa executado e aprovado, `FAIL` significa executado e reprovado, e `NOT RUN` significa que o item não foi executado no escopo declarado para o build atual. Pesquisa de API e teste com doubles não viram `PASS` de host.

### CHMS-003 — JSON Schemas e validadores standalone

O aceite antes parcial de CHMS-003 foi concluído e entrou no check integrado:

- quatro schemas v1 em JSON Schema Draft 2020-12: request, response, capabilities e rig metadata;
- Ajv 8 somente em desenvolvimento, para validar os artefatos e gerar o módulo standalone;
- runtime CSP-safe sem `eval`, `Function`, `require` ou import do Ajv;
- guards públicos profundos que recusam ciclos, valores não JSON, protótipos inesperados, profundidade excessiva, campos extras e invariantes inválidas;
- teste de drift entre schemas e validadores gerados, incluindo sincronismo dos códigos de erro e da versão do protocolo.

Status automatizado: `IMPLEMENTED_AND_VERIFIED`. Isso não substitui nenhum gate Adobe aplicável.

### CHMS-013 — Smooth (`ae.expression.smooth`)

Segundo comando de expressão do P1, completando o que já existia pela metade: `@motion/expression-library` **já trazia** o template `ae.expression.smooth` com tokens, render e parse, mas não havia comando de host, descriptor nem interface. Este slice fecha os quatro.

- **Host `expression-smooth.jsx`** com o mesmo contrato do LoopOut: a seleção inteira é validada antes do primeiro write, e conflito numa única propriedade recusa o lote todo. Aplicar metade de uma seleção seria pior que não aplicar nada, porque o usuário não tem como saber onde parou. Rollback restaura em ordem inversa quando o After Effects recusa a expressão.
- **Mínimo de dois keyframes, com motivo.** `smooth()` calcula a média do valor ao longo do tempo; numa propriedade sem animação o resultado é a própria constante — um no-op que o usuário leria como "o comando não fez nada". Como o modo de conflito recusa propriedades que já têm expressão, keyframe é a única fonte de variação possível neste comando.
- **Teste de paridade entre as duas implementações.** O template existe em ES5 no host e em TypeScript na biblioteca; um teste compara a fonte emitida pelos dois para quatro conjuntos de tokens. Se divergirem, `isManagedSmooth` deixaria de reconhecer o que o painel gerou e o comando trataria a própria expressão como conflito alheio.
- **`allowsNoopSuccess` entrou na lista fixada do teste de descriptors**, que exige decisão consciente por comando em vez de padrão herdado sem revisão.
- **View Smooth no painel**, com largura, amostras e referência. O campo de tempo fixo só aparece quando a referência é "Tempo fixo": mostrá-lo desabilitado ao lado de "Tempo atual" seria ruído permanente. `Aplicar` nasce desabilitado com o motivo no tooltip, conforme a §9.
- **13 testes de host** cobrindo faixas, injeção no token de referência, corpo adulterado sob cabeçalho gerenciado, preservação de expressão alheia, contagem do lote, idempotência e rollback.

#### Verificado em host real — After Effects 26.3x87, Windows 11, CEP 12.0.1

Composição de teste com três keyframes de posição, propriedade selecionada, aplicação pelo botão do painel:

| Ação | Resultado observado |
|---|---|
| 1ª aplicação | `smooth(0.2, 5, time);` com cabeçalho gerenciado, `expressionEnabled=true`, `expressionError` vazio, 3 keyframes preservados |
| 2ª aplicação, mesmos tokens | "As 1 propriedade(s) selecionadas já usam exatamente este Smooth" — no-op reportado como sucesso, sem escrita |
| 3ª aplicação, largura 1,5 s | substituiu o gerenciado anterior por `smooth(1.5, 5, time);` |

Status: `IMPLEMENTED_AND_VERIFIED` no ambiente acima. `NOT RUN`: Ctrl+Z de um passo para este comando especificamente, macOS, AE 25.x e propriedades 3D/COLOR em host real.

### CHMS-013 — Wiggle (`ae.expression.wiggle`)

Terceiro comando de expressão do P1. Diferente do Smooth, aqui **nada existia**: template, tokens, parser, host, descriptor e interface entraram neste slice.

#### A pesquisa mudou o desenho

Registrada em `docs/research/after-effects-wiggle-and-seed.md`. A frase que decidiu o template:

> *"The offset value, **but not the timeless value**, is also used to control the initial value of the wiggle function."*

- **`seedRandom` é emitido sempre, com semente explícita.** Sem ele a semente do wiggle deriva do identificador da camada e da propriedade: duas camadas com os mesmos parâmetros se movem diferente, e o mesmo projeto reaberto não é comparável. A skill `engineering-motion-rigs` exige semente exposta e resultado reproduzível.
- **`timeless` NÃO é emitido.** Ele não governa o wiggle. Emiti-lo sugeriria um controle que não existe e ampliaria o parser canônico sem ganho.
- **`t` (tempo base) ficou fora da v1.** Seu uso real é truque de loop, que pertence ao CHMS-020.
- **Proveniência declarada:** a página oficial da Adobe expirou em duas tentativas de 60 s nesta sessão. As assinaturas verbatim vieram do espelho mantido pela comunidade, corroboradas por um resumo do helpx — corroboração, não prova primária. Está anotado como incerteza aberta.

#### Diferença de contrato

**Wiggle não exige keyframes.** LoopOut e Smooth exigem dois porque operam sobre animação existente; `wiggle()` opera sobre valor estático, e sacudir uma camada parada é o uso principal. Exigir animação prévia bloquearia o caso mais comum. Há teste dedicado, com fixture de `numKeys = 0`.

#### Cobertura

19 testes novos: 6 na biblioteca (round-trip, faixas, corpo adulterado, semente removida) e 13 no host (paridade ES5↔TypeScript em quatro conjuntos de tokens, injeção pelo token numérico, lote atômico, idempotência, troca de semente, rollback).

#### Verificado em host real — After Effects 26.3x87, Windows 11, CEP 12.0.1

Composição com propriedade de posição **sem nenhum keyframe**, selecionada, aplicação pelo botão do painel:

| Estado | Observado |
|---|---|
| antes | expressão vazia, `expressionEnabled = false`, `numKeys = 0` |
| um clique em Aplicar | "Wiggle aplicado em 1 propriedade(s)" |
| depois | `seedRandom(0);\nwiggle(2, 30, 1, 0.5);` com cabeçalho gerenciado, habilitada, sem erro, `numKeys = 0` |
| reaplicar mesmos tokens | no-op reportado como sucesso, sem escrita |
| trocar só a semente para 7 | reescreveu para `seedRandom(7);` |

Status: `IMPLEMENTED_AND_VERIFIED` no ambiente acima.

**Pendência de produto registrada:** a documentação diz que o offset controla o *valor inicial* do wiggle, mas o identificador da camada continua na composição da semente. Não foi medido se duas camadas com a mesma semente produzem movimento idêntico — pode ser que a semente iguale a fase e não a trajetória. Até isso ser medido, o produto **não promete "mesma semente, mesmo movimento" entre camadas**; o texto da interface fala apenas do comportamento por propriedade.

### Matriz de transform 3D: a dívida que bloqueava três comandos

Flip, Alinhador de âncora e qualquer coisa que compense transform recusavam camadas 3D. A recusa
era honesta — sem saber a composição exata, a alternativa seria escrever matriz por palpite e
produzir camadas visualmente erradas **sem levantar erro nenhum**. Virou dívida sistemática, e
este slice a paga.

```text
toWorld(v) = posicao + M . (v - ancora)

M  = Ro . Rx(rx) . Ry(ry) . Rz(rz) . S
Ro = Rx(ox) . Ry(oy) . Rz(oz)
S  = diag(escalaX/100, escalaY/100, escalaZ/100)
```

Todas as rotações usam a matriz de **ângulo positivo** — não há inversão de sinal apesar do eixo
Y apontar para baixo. **Erro máximo contra o host: `5,684e-14`**, precisão de máquina.

#### O método importou mais que o resultado

Adivinhar entre oito composições candidatas não converge: as oito erram, e o erro não diz **por**
**quê**. O que resolveu foi medir a matriz — para uma camada sem pai, as colunas de `M` são
diferenças de `toWorld` nos vetores da base, e quatro avaliações dão `M` inteira. Cada hipótese
vira então uma comparação numérica em vez de um palpite.

Dois enganos apareceram assim, e nenhum seria óbvio por leitura:

1. **`toComp` não serve.** Numa camada 3D ele já inclui a projeção da câmera — erro de **860 px**.
   O que corresponde ao transform é `toWorld`.
2. **Não há inversão de sinal.** Assumir que o eixo Y para baixo inverte as rotações respondia
   sozinho por **165 px**.

#### O alinhador de âncora deixa de recusar 3D

| Caso | Erro visual |
|---|---|
| 3D rotacionada nos três eixos | `3,212e-6 px` |
| 3D com orientation | `2,613e-6 px` |

Contra o critério de 0,5 px da §14.6. O comando também passou a preservar a terceira componente da
âncora e da posição: escrever duas numa camada 3D zeraria a profundidade em silêncio.

`MotionTransform` serve 2D e 3D pelo mesmo caminho — uma camada 2D é o caso em que orientation e
as rotações X e Y são zero. A fórmula 2D usada antes é exatamente esta restrita ao plano, então o
código específico de 2D saiu.

#### Uma armadilha de diagnóstico, registrada

Concatenar um array de valor de propriedade do After Effects numa string levanta `resultado`
`numérico inválido (divisão por zero?)`. Custou uma rodada inteira: o log de sucesso explodia
dentro do `try`, e o `catch` fazia parecer que a **escrita** tinha falhado quando ela funcionara.

#### O que a dívida ainda cobra

**`ae.layer.flip` continua recusando 3D**: refletir em três eixos é outra derivação, e a matriz
sozinha não dá a decomposição de volta em rotações que o flip precisa escrever. E
**`ae.layer.create-null` ainda usa `toComp`** na sonda de posicionamento — para camadas 3D isso é
a posição projetada, o mesmo engano que custou 860 px aqui. Nenhum dos dois foi medido.

### CHMS-017 — Alinhador de âncora (`ae.anchor.align`)

Décima terceira ferramenta do painel: move o ponto de ancoragem para um dos nove pontos do
bounds, com a camada ficando no lugar.

#### A matriz, porque o spec proíbe o atalho

A §14.5 é explícita: *não usar expressão temporária quando a operação pode ser resolvida por
matriz.* Aqui pode. O transform leva o espaço da camada ao espaço do **pai** por
`p = posição + R·S·(v − âncora)`, então:

```text
posicao' + R·S·(v - A')  =  posicao + R·S·(v - A)
posicao'                 =  posicao + R·S·(A' - A)
```

**O transform do pai cancela** — `posição` já está em espaço do pai, e os dois lados passam pela
mesma matriz. A compensação é local, e vale para qualquer profundidade de parentesco.

#### Verificado em host — AE 26.3x87

| Caso | Erro visual |
|---|---|
| 2D simples | `0` |
| rotacionada 37° e escalada 160×70 | `1,205e-5 px` |
| escala negativa | `0` |
| **parenteada a pai rotacionado e escalado** | `5,267e-6 px` |
| texto | `0` |

Critério da §14.6: **0,5 px**. O pior caso ficou 40 mil vezes abaixo, e o resíduo é arredondamento
do próprio After Effects — não da conta. A penúltima linha é a que confirma a derivação.

#### O defeito que só a interface revelou

A primeira aplicação pelo painel devolveu `ROLLBACK_FAILED`. **`setValue` levanta erro numa
propriedade com keyframes**, e a cena de teste tinha uma camada com Position animada. O rollback
tentava o mesmo caminho e falhava também — por isso o código de rollback no lugar do erro real.

Camada animada é o caso comum no After Effects, não a exceção. O comando agora desloca cada
keyframe pelo mesmo vetor — o que preserva a animação inteira — e o rollback subtrai o mesmo
vetor, sem snapshot, porque nenhum keyframe é criado, removido ou reordenado.

Duas recusas vieram junto: **âncora animada** (qual keyframe iria para o canto?) e **escala ou
rotação animada com compensação ligada** (o vetor muda a cada quadro, e um deslocamento constante
erraria em silêncio).

#### Grade 3×3, e não um select de nove

A §14.2 pede grade. Um select diria a mesma coisa e ocuparia menos espaço, mas esconderia a
geometria: aqui a posição do botão **é** a informação, e ler "superior esquerdo" numa lista custa
mais que ver o canto. `radiogroup` com `aria-label` por célula, porque nove botões sem nome
acessível seriam nove botões idênticos para um leitor de tela.

#### Escopo recusado

**Convex** e **Concave** dependem de análise de path — convex hull e sinal de cross product — e
são corpo de trabalho próprio. **Camadas 3D** precisam de matriz 4×4 ainda não verificada. As
fontes de bounds `source`, `mask`, `shapePath` e `selection` são recusadas com erro tipado em vez
de silenciosamente trocadas por `visual`.

### CHMS-016 — as quatro ferramentas no painel, e o painel finalmente verificado

Renomear, Inverter ordem, Cortar keys e Atrasar entram na interface. Com elas o navegador chega a
**doze ferramentas**, e o painel deixa de ser código que passa no gate para virar coisa medida.

#### Prévia antes de mutar

A §7 exige do Rename que o preview liste exatamente os nomes finais. As quatro seguem o mesmo
padrão, e isso pediu infraestrutura compartilhada:

- **`textField`** no `ui-core` — o painel não tinha campo de texto livre. Confirma em `change` e
  não em `input`: cada confirmação dispara uma prévia que fala com o host, e reagir a cada tecla
  daria uma ida ao host por caractere digitado.
- **`hint`**, linha auxiliar discreta. Não é `notice`: aviso é caixa com peso visual, e
  "mais 12 camadas" é rodapé. Usar aviso para isso gastaria a atenção que os avisos de verdade
  precisam ter.
- **Contador de sequência que descarta prévias fora de ordem.** Os campos confirmam rápido e uma
  prévia pedida antes pode voltar depois; sem isso a lista mostraria o resultado de uma regra já
  trocada, e a pessoa aplicaria confiando no que está vendo.
- **Teto de 40 linhas** com rodapé de contagem: uma composição grande geraria centenas de nós a
  cada confirmação de campo.

#### O painel exercitado pela interface, não pelo dispatcher

Até aqui todo comando tinha sido verificado por despacho direto. O `.debug` — que declara a porta
do inspetor remoto — só é instalado sob `-EnableDebugMode`, e as instalações recentes rodaram sem
a flag; o painel carregava, mas era mudo para inspeção. Com o arquivo no lugar, o painel foi
aberto por `app.executeCommand(app.findMenuCommandId("Moti.on"))` e percorrido inteiro.

| Verificação | Medido |
|---|---|
| grade | 12 ladrilhos, todos com ícone SVG |
| abrir e voltar | as 12 desenham título, campos e ações, e devolvem a grade |
| prévias | quatro ferramentas montaram lista com dados vindos do host |
| aplicação pela interface | Inverter ordem previu `Titulo, alpha, beta` e produziu exatamente isso; Renomear previu `P_Titulo, P_alpha, P_beta` e renomeou as três |
| largura | `compact` em 280 px, `standard` em 480 px, sem rolagem horizontal |
| exceções | nenhuma |

#### Quatro defeitos que só a interface revelou

Nenhum apareceria em teste com double, porque nenhum é lógica — são contrato e texto.

1. **`before`/`after` da prévia de reverse eram registros, não strings.** Eu tipei `string[]`; o
   guarda rejeitaria a prévia em silêncio e a lista ficaria eternamente em "calculando".
2. **`Atualizar lista` aparecia em quatro ferramentas que não têm lista.** O gancho de carga serve
   a duas coisas diferentes, e um rótulo só mentia em quatro das cinco.
3. **O rodapé da prévia do Cortar keys falava no passado**, dizendo que os keyframes já tinham
   saído antes de qualquer clique.
4. **O Espelhar tinha um campo chamado `Aplicar`**, idêntico ao botão ao lado.

#### O que continua `NOT RUN`

Teclado, foco e leitor de tela; larguras 360 e 720; e a aplicação pela interface das outras dez
ferramentas — só duas foram clicadas até o fim. Item 20 de `docs/HOST_LIMITATIONS.md`.

### CHMS-015 — Flip (`ae.layer.flip`), fechando os três comandos

Terceiro e último comando do CHMS-015. O critério de aceite é curto: flip duplo retorna ao estado
inicial dentro de tolerância numérica.

#### A derivação, que importa mais que o código

**Espelhar não é negar a escala.** Sendo `M` a reflexão:

```text
M·T(p)·R(t)·S = T(Mp)·M·R(t)·S = T(Mp)·R(-t)·M·S = T(Mp)·R(-t)·S'
```

A posição reflete em torno do pivô, **a rotação troca de sinal**, e a escala do eixo espelhado
troca de sinal.

Sem negar a rotação, qualquer camada rotacionada termina no lugar errado — e o erro cresce com o
ângulo. Numa camada sem rotação o resultado é idêntico, então um teste com valores redondos passa
e o defeito só aparece no material real de quem usa. É o mesmo padrão do erro de âncora do Create
Null: plausível, silencioso, e invisível para verificação que só confirma "não deu erro".

Como cada termo troca de sinal, aplicar duas vezes devolve o estado inicial exatamente — o
critério de aceite sai da álgebra, não de um ajuste.

#### Verificado em host real — After Effects 26.3x87

| Verificação | Medido |
|---|---|
| flip duplo, camada rotacionada 35° e escalada 140×80 | voltou **idêntico** |
| estado intermediário | `pos=[490, 120] esc=[-140, 80] rot=-35` |
| canto medido por `toComp`, espelhado em torno de x=320 | erro de **1,137e-13** em x, zero em y |
| centro dos limites: conta do comando vs motor de expressões | `269,4468` nos dois |
| 3D e camada com pai | recusadas com erro tipado |
| texto com legibilidade preservada | mudou de lado, escala continuou `[100, 100]` |

A quarta linha é a que mais vale: a conta de limites que o comando faz à mão foi conferida contra
a matemática nativa do After Effects, e não contra a expectativa de quem a escreveu.

#### Escopo recusado, e por quê

Camadas **com pai** e camadas **3D** são recusadas com erro tipado, e **shape paths** ficam fora
deste slice. Num pai rotacionado o eixo de espelhamento deixa de ser alinhado e a fórmula não
vale; em 3D são três rotações e a derivação é outra; paths são uma segunda implementação inteira,
sobre `Shape` em vez de transform.

Nos três casos a alternativa seria produzir silenciosamente um resultado errado — que é
exatamente o modo de falha deste comando. O painel declara o limite de saída, e não só quando o
comando recusa: descobrir a restrição depois de montar a seleção é pior que saber antes.

**O painel continua `NOT RUN`** para os três comandos do CHMS-015. Item 19 de
`docs/HOST_LIMITATIONS.md`.

### CHMS-015 — Create Null (`ae.layer.create-null`)

Segundo comando do CHMS-015. O critério de aceite é o mesmo: parentear camadas rotacionadas e escaladas não pode alterar a posição visual delas.

#### A decisão estrutural: não reimplementar a matemática da Adobe

A §7 pede "resolver bounds e transform matrices". Compor essas matrizes a mão no ExtendScript daria um cálculo que eu **não teria como verificar** contra 3D, parents aninhados e camadas animadas — e que erraria em silêncio.

Em vez disso o comando usa **o próprio motor de expressões como calculadora**: escreve uma expressão temporária na posição do null, lê o valor que o After Effects avaliou, apaga a expressão e assa o número. A matemática passa a ser a nativa da ferramenta.

A sonda é apagada num `finally`, inclusive no caminho de erro. Um null com expressão temporária sobrevivente seria pior que um null mal posicionado: o usuário ficaria com uma camada contendo código que ele não escreveu.

#### Dois defeitos que só o host revelou

**1. `toComp` devolve dois componentes numa camada 2D e três numa 3D.** Ler `p[2]` sem guarda numa camada 2D produz *"Valor indefinido usado na expressão"* e o After Effects desabilita a expressão. Seleção mista de 2D e 3D é o caso comum, não o excepcional.

**2. `toComp([0,0,0])` mapeia a origem do espaço da camada — o canto superior esquerdo da fonte, não a âncora.** Num sólido a âncora nasce no centro, então "média das âncoras" calculava a média dos cantos: `[215.835, 129.607]` onde o correto era `[260, 180]`.

O segundo é o achado que vale registrar. **Ele passou como sucesso:** o comando respondia `ok: true`, a expressão avaliava sem erro, e o null pousava num lugar plausível. Só apareceu porque a sonda de verificação carregava o valor **esperado** ao lado do medido. Verificação que só confirma "não deu erro" não teria pego — e o defeito teria chegado ao usuário como "o null nasce meio torto".

#### Verificado em host real — After Effects 26.3x87

| Verificação | Medido |
|---|---|
| `compCenter` sem seleção | `[320, 180]` numa comp 640×360 |
| `averageAnchor` | `[260.000, 180.000]` — exatamente a média das âncoras |
| `selectionBounds` em 3D | `[245.186, 159.607, 0]` |
| sonda residual | vazia nos três casos |
| **critério de aceite** | camada rotacionada 35° e escalada 180% não se moveu ao ser parenteada |

**O painel continua `NOT RUN`.** Item 18 de `docs/HOST_LIMITATIONS.md`.

### CHMS-015 — Parentesco (`ae.layer.parent` + `ae.layer.list`)

Primeiro dos três comandos do CHMS-015. O critério do roteiro é um só — *world transform preservado* — e ele depende inteiramente de um fato que precisava ser medido, não lido.

#### A medição que decidiu o comando

```
layer.parent = alvo          PRESERVA o world transform
layer.setParentWithJump(x)   NAO preserva — a camada pula
```

O nome da API engana: é natural ler `setParentWithJump` como "seta o parent evitando o pulo". É o contrário — o "jump" é o que ela causa. **Um palpite pelo nome teria invertido a feature, e o erro seria silencioso:** as camadas ficariam visualmente erradas sem nenhuma exceção.

O experimento está em `docs/research/after-effects-parenting.md`. Detalhe do método que importa: o pai precisa estar rotacionado **e** escalado — com rotação sozinha uma filha na origem do pai fica parada nos dois modos, e o teste não distinguiria nada.

#### Decisões

- **Detecção de ciclo no preflight**, mesmo o After Effects recusando sozinho. Confiar na exceção do host faria o lote falhar no meio e devolveria uma mensagem de host não traduzida em vez de erro tipado.
- **O nome do alvo viaja como soma de verificação**, não como identidade. Se o timeline mudou entre a leitura da lista e o clique, parentear pelo índice antigo acertaria a camada errada em silêncio.
- **Encadeamento na ordem do timeline**, não na de seleção. `selectedLayers` não garante ordem: encadear por ela daria uma hierarquia diferente a cada clique, com os mesmos inputs.
- **Reparentar para o mesmo pai é no-op.** Reescrever levaria o After Effects a recalcular o transform sem necessidade, e cada reaplicação acumularia arredondamento na posição.
- `ae.layer.list` é comando próprio, e não um campo de `ae.context.read`: o contexto é lido a cada troca de foco, e uma composição com centenas de camadas transformaria isso num payload grande e constante.

#### Uma suposição que estou declarando

O spec lista `chainMode` sem dizer o que os modos são. Implementei os dois que a convenção do After Effects sustenta — *todas para o alvo* e *encadear na ordem do timeline*, com a última da pilha indo para o alvo. Diferente de `anchorMode` e `multilineMode` do Text Box, aqui existe uma leitura dominante, então preferi entregar a declarar bloqueio. Se a intenção era outra, é uma troca barata.

#### Verificado em host real — After Effects 26.3x87

| Verificação | Medido |
|---|---|
| `preserveWorldTransform: true` | mundo `[60, 60]` antes e depois |
| `preserveWorldTransform: false` | `[120, 80]` → `[473.923, 311.962]` — pulou, como pedido |
| reaplicar | `appliedCount: 0`, `unchangedCount: 1` |
| ciclo | recusado, pai do alvo intocado |
| nome divergente | recusado |
| encadear | topo→meio→base→alvo |
| desparentear | mundo preservado |

**O painel continua `NOT RUN`:** o comando foi exercitado pelo dispatcher, não pela interface. Item 17 de `docs/HOST_LIMITATIONS.md`.

### CHMS-014 — Text Box: o rig completo, ainda sem medição em host

O slice anterior deixou os `matchName` sondados e os templates prontos. Este monta o rig: `ae.text.box` cria uma shape layer atrás de cada camada de **texto** selecionada, parenteada, ordenada logo abaixo, com tamanho e posição dirigidos por expressão gerenciada.

- Toda a estrutura é endereçada por `matchName`. Nome de exibição volta localizado do host — `ADBE Vector Rect Size` aparece como "Tamanho" num After Effects em português — então qualquer lógica escrita sobre display name funcionaria só na máquina de quem escreveu.
- A caixa é reconhecida como gerenciada por **estrutura mais cabeçalho versionado**: ser forma, ter o texto como parent, e carregar a expressão gerenciada no `ADBE Vector Rect Size`. Nunca pelo nome da camada, que o usuário renomeia. Renomear a caixa não a esconde, e uma forma que o usuário parenteou à mão não é confundida com rig nosso.
- Parenteia e **depois** zera âncora e posição. Assim o resultado não depende de `layer.parent = x` preservar ou não o transform: ele é escrito explicitamente.
- `colorField` novo no `@motion/ui-core`, com detecção de suporte: `input[type=color]` é a única primitiva do shell fora da interseção verificada de CEP e UXP, então o campo sonda o tipo depois de atribuí-lo e cai para texto hex editável quando o runtime não o implementa.

#### Um defeito que o teste encontrou antes do host

Se a montagem falhasse **depois** de `addShape()`, a camada meio-construída ficava órfã no projeto: ela ainda não tinha sido registrada para rollback. Criação e montagem foram separadas, e agora a camada entra na lista de rollback no instante em que passa a existir — antes de qualquer configuração.

#### Escopo recusado, e por quê

`createPerLayer` está no contrato mas o host **recusa `false`** em vez de aceitar e criar por camada assim mesmo. Uma caixa única em volta de várias camadas não consegue usar `thisLayer.parent` — há um só parent — e precisaria referenciar cada texto por nome ou índice, que é a fragilidade que este rig existe para evitar.

`anchorMode` e `multilineMode` continuam **bloqueados por definição de produto**, não por implementação: o spec lista os inputs mas não diz o que os modos são. Para uma caixa que já centraliza no bounding box, "modo de ancoragem" pode ser três features diferentes.

#### Quatro falhas em host antes de passar

Nenhuma das duas causas era detectável lendo o código, e nenhuma foi pega pelos 15 testes — porque o double era otimista demais. Cada correção veio acompanhada de uma correção **no modelo**, para a suíte parar de aceitar o que o host recusa.

**1. Expressão escrita antes do parentesco.** O template dereferencia `thisLayer.parent`; numa camada sem parent isso é `null` e o After Effects rejeita a expressão na atribuição. Parentear passou a vir antes. O double agora avalia: escrever uma expressão com `thisLayer.parent` numa forma sem parent falha.

**2. Handle de propriedade envelhecido — a que importa para o projeto inteiro.** Uma referência de propriedade no ExtendScript é presa ao índice dentro do grupo: acrescentar um irmão **invalida as referências já entregues**. O código guardava o `rect` devolvido por `addProperty` e adicionava o fill em seguida; o handle morria ali, e todo uso levantava "O objeto é inválido".

Os `matchName` estiveram certos o tempo todo — a sonda do slice anterior não reproduziu o problema porque não inseria nada depois de obter a referência. A regra que sai daí vale para todo comando futuro: **nunca segure referência de propriedade atravessando uma mutação estrutural do grupo que a contém.** O double modela isso com gerações, e há um teste que pina o modelo.

**3. O comando deixava a caixa selecionada.** O After Effects seleciona toda camada nova, então a segunda aplicação encontrava a *caixa* na seleção e recusava com `INVALID_SELECTION_TYPE` em vez de dar no-op. O comando agora devolve a seleção ao texto. Este é o primeiro comando do projeto que altera seleção, e o item 5 de `HOST_LIMITATIONS.md` já previa que o gate valeria a partir dele.

#### Verificado em host real — After Effects 26.3x87, Windows 11

| Verificação | Medido |
|---|---|
| criação | `ok: true`, `createdCount: 1` |
| `Rect Size` avaliado | `[91.0664, 60.1504]` — exatamente `w+2·24`, `h+2·14` |
| `Rect Position` avaliada | `[21.8145, -8.3057]` — exatamente o centro do bounding box |
| `expressionError` | vazio nas duas, ambas habilitadas |
| âncora e posição da camada | `[0, 0, 0]` e `[0, 0, 0]` |
| ordem na timeline | caixa logo abaixo do texto |
| texto apagado | recolheu para `[0, 0]` |
| seleção após o comando | só o texto |
| reaplicação | no-op, uma única caixa |

Status: `IMPLEMENTED_AND_VERIFIED` nesse ambiente. `NOT RUN`: Ctrl+Z de um passo, cor não-preta pelo painel (o host foi exercitado com preto, e a conversão `hexToChannels` não foi medida), várias camadas selecionadas, multilinha, macOS e AE 25.x.

### CHMS-008 — navegação por ladrilhos, no lugar de uma aba por ferramenta

Cada comando de expressão tinha virado uma aba. Com quatro comandos o painel gastava **sete abas**, e a §22 pede o contrário: grade de ícones, sem inspector até a ferramenta ser escolhida, uma tarefa dominante por vez. O CHMS-014 e o CHMS-015 acrescentariam mais duas cada.

- A navegação voltou a **quatro abas**: Contexto, Ferramentas, Sistema, Diagnóstico.
- `toolGrid` e `toolTile` no `@motion/ui-core`. Ladrilho, não card: sem sombra, sem raio grande, sem borda dupla. O rótulo textual **nunca some** — ícone sozinho exigiria decorar a iconografia.
- `shell.setViewTitle` permite que a ferramenta aberta assuma o título. Deixá-lo em "Ferramentas" obrigaria a pessoa a voltar à grade para lembrar onde está.
- As quatro ramificações do `renderView` viraram um **registro de ferramentas**: acrescentar uma ferramenta passa a ser acrescentar uma entrada, e não mais uma aba somada a mais uma ramificação.

#### Dois defeitos encontrados pela própria verificação em host

1. **A aba Ferramentas apareceu com `?` no lugar do ícone** — o id novo não tinha entrada no mapa de ícones, e o fallback é o ponto de interrogação. Nenhum gate pegava porque nada testava cobertura de ícone. Corrigido, com teste que percorre todos os ids que os painéis usam.
2. **O quarto ladrilho esticava para a linha inteira** quando a grade quebrava em três colunas, ficando três vezes maior que os irmãos. A §22 pede layout previsível e alinhado à grade; resolvido com `max-width` no item.

#### Verificado em host real — After Effects 26.3x87

Quatro abas; grade com os quatro ladrilhos e ícone próprio; abrir Wiggle troca o título para "Wiggle" e mostra os cinco campos com Aplicar, Redefinir e Voltar; Voltar devolve a grade. Sem rolagem horizontal em 280 px nem em 480 px, e sem exceções no painel.

### CHMS-014 — Text Box: pesquisa em host e núcleo de expressão (`PARTIAL`)

Primeiro slice do Text Box. **Não é o comando completo** — ver o que ficou de fora, abaixo.

#### `matchName` sondados no host, não lembrados

O rig precisa construir uma shape layer. Em vez de escrever os `matchName` de memória, eles foram **enumerados no After Effects 26.3x87** criando uma shape layer de sonda e percorrendo as propriedades. Registro completo em `docs/research/after-effects-text-box-rig.md`.

A sondagem confirmou por que a regra existe: os nomes de exibição voltaram **localizados** — `ADBE Vector Rect Size` aparece como "Tamanho", `ADBE Vector Rect Position` como "Posição". Lógica escrita sobre display name funcionaria na máquina de quem escreveu e falharia na do usuário.

#### A caixa aponta pelo parentesco, não pelo nome

A implementação clássica escreve `thisComp.layer("Nome do texto")`, que quebra em silêncio quando o usuário renomeia a camada e pega a camada errada quando há duas com o mesmo nome.

Como o rig **já cria** o vínculo de parentesco que o spec exige, a expressão usa `thisLayer.parent`. Sobrevive a rename, reordenação e duplicação, e não há um segundo acoplamento para manter em sincronia. Se o usuário desparentar, a falha é visível e atribuível a uma ação explícita dele. Há teste que recusa qualquer fonte contendo `thisComp.layer(`.

#### Texto vazio: medido, e mudou o template

| Conteúdo | `sourceRectAtTime(0, false)` |
|---|---|
| `"Ag"` | width=91.873 height=76.476 |
| `""` | **tudo zero** |
| `" "` (só espaço) | **tudo zero** |
| 3 linhas | height=268.845 |

Sem tratamento, apagar o texto deixaria um bloco de cor órfão do tamanho do padding pousado na origem da camada — e um único espaço faria o mesmo, porque espaço não tem tinta e portanto não tem bounding box. O template de tamanho colapsa a caixa para `[0, 0]` nesse caso; ela some quando não há texto e volta sozinha quando o texto volta.

Multilinha não precisou de tratamento: `sourceRectAtTime` já devolve o bounding box de todas as linhas.

#### Entregue neste slice

Templates `ae.textbox.size` e `ae.textbox.position` na `@motion/expression-library`, com padding validado, colapso de texto vazio, round-trip pelo parser e recusa de corpo adulterado. 6 testes novos.

#### O que ficou de fora, e por quê

A §7 lista como inputs mínimos `paddingX, paddingY, roundness, fill, stroke, anchorMode, multilineMode, createPerLayer`.

- **`stroke`** — custo baixo, adiado só para não ampliar o rig gerenciado antes de o núcleo estar verificado em host.
- **`anchorMode` e `multilineMode`** — **precisam de definição de produto**. O spec não diz o que os modos são. Para uma caixa que já centraliza no bounding box do texto, "modo de ancoragem" pode significar três features diferentes; e como `sourceRectAtTime` já cobre multilinha, não está escrito o que o modo deveria alternar. Escolher por conta própria seria inventar requisito.
- **O comando de host** que cria a shape layer, parenteia e ordena abaixo do texto é o próximo slice.

Status: `PARTIAL`. O critério de aceite da issue — mudar conteúdo, fontSize e alinhamento mantendo padding visual — só pode ser medido quando o comando existir.

### CHMS-013 — Flicker (`ae.expression.flicker`), fechando o slice

Quarto e último comando de expressão do CHMS-013. O aceite da issue — *"Wiggle/Flicker/LoopOut/Smooth · Host smoke tests"* — está completo.

#### A dimensionalidade forçou o desenho

`random(min, max)` com dois números devolve **um escalar**. Uma propriedade de posição espera um array. Emitir `random(0, 1)` cru quebraria tudo que não fosse 1D — e quebraria dentro do After Effects, não no build. O template resolve multiplicando o próprio valor:

```text
// MOTION_EXPRESSION v1 | ae.expression.flicker
seedRandom(<seed>);
posterizeTime(<rate>);
value * random(<min>, <max>);
```

`value` carrega a dimensionalidade da propriedade, e `array * escalar` é válido na linguagem de expressões. Efeito colateral melhor que a alternativa: como multiplica em vez de substituir, **preserva a animação existente** da propriedade.

- **Invariante entre campos:** `minFactor <= maxFactor`. `random(1, 0)` não é erro no After Effects, mas faz o contrário do que a interface declarou — é recusado antes de virar fonte, e a interface desabilita o botão com mensagem própria em vez do genérico "revise os valores".
- **Não exige keyframes**, como o Wiggle.
- 16 testes novos: 5 na biblioteca, 11 no host, incluindo aplicação simultânea em 1D, 2D, 3D e cor.

#### Verificado em host real — After Effects 26.3x87, Windows 11, CEP 12.0.1

Opacidade (1D) e Posição (2D) selecionadas juntas, nenhuma com keyframes, aplicação pelo botão:

| Propriedade | `expressionError` | Valor avaliado em t=1 s |
|---|---|---|
| Opacidade (1D) | vazio | `28.37` — escalar |
| Posição (2D) | vazio | `3.50, 1.96, 0` — array |

O mesmo template serviu as duas dimensões sem ramificação: é a evidência que justifica a decisão de multiplicar `value`. A faixa invertida desabilitou a ação com o motivo correto. Nenhuma exceção no painel.

Status: `IMPLEMENTED_AND_VERIFIED` no ambiente acima.

**Observação de produto vinda da verificação:** multiplicar posição por um fator aleatório aproxima a camada da origem — matematicamente correto e provavelmente indesejado. Flicker é útil em opacidade e escala; em posição o resultado é um salto para perto de (0,0). O comando não bloqueia isso, e o texto da interface explica que o fator multiplica o valor, mas vale considerar um aviso por tipo de propriedade quando houver tela de presets.

### Correção de codificação e guarda contra recorrência

Três strings chegaram ao repositório com UTF-8 lido como Latin-1 — `loopOut.section.main` ("RepetiÃ§Ã£o"), `loopOut.section.safety` ("SeguranÃ§a") e uma mensagem de log em `main.ts`. Nenhum gate existente pegou: não quebra build, não quebra tipo, não quebra teste. Só aparece na tela do usuário, como título de seção do painel.

- As três foram regravadas em UTF-8.
- `tests/encoding.test.mjs`, novo: varre `packages/`, `apps/`, `scripts/` e `tests/` por sequências que só existem quando UTF-8 é interpretado como Latin-1. Tem teste positivo e negativo próprio — um detector sem teste nunca acusaria nada e ninguém perceberia.

### CHMS-009 — núcleo puro de metadata de rigs

Novo package `@motion/rig-metadata`, sem acesso direto a APIs Adobe ou filesystem:

- create/read/update/remove/migrate do bloco `[MOTION_META_V1]` preservando byte a byte o texto do usuário fora do span gerenciado;
- JSON recursivamente canônico, UTF-8 estrito, base64url sem padding e integridade SHA-256;
- validação fail-closed de delimitadores, schema, timestamps, UUIDs, payload sidecar e migrações explicitamente registradas;
- escolha inline/sidecar por limite em bytes fornecido pelo adapter; o package devolve planos de escrita/limpeza, mas não executa I/O;
- **24/24 testes focados `PASS`**, também incluídos no `npm.cmd run check` integrado.

Status: `IMPLEMENTED_NOT_HOST_VERIFIED`. Integração com `Layer.comment`, persistência/rename atômico do sidecar e Undo real no After Effects: `NOT RUN`. Nenhum efeito visual ou rig aplicado no host foi entregue por este slice.

### Primeira medição do ambiente real via extensão equivalente — o `ScriptPath` do CEP não carrega

Em After Effects 26.3x87, Windows 11 e CEP 12.0.1, uma extensão CEP equivalente reproduziu a falha descrita no item 1 de `docs/HOST_LIMITATIONS.md`. As medições desta seção continuam como histórico daquele ambiente e daquela extensão; a seção seguinte registra separadamente o build Moti.on real.

- **O `<ScriptPath>` do manifest CSXS não é avaliado no carregamento da extensão.** `typeof $.global.MotionAE` respondia `"undefined"` com o painel aberto e renderizando; todo comando voltava `"EvalScript error."`, que o adapter só sabia reportar como timeout. `$.evalFile` sobre o mesmo arquivo, no mesmo host, carregava sem erro — o host era válido, o carregamento automático é que não acontecia. Era exatamente o risco que a página de limitações registrava como não verificado.
- **Correção implementada:** `buildHostBootstrapCall`, ao lado de `buildDispatchCall` em `packages/contracts/src/evalscript.ts` — as duas passam pelo mesmo encoder, e continuam sendo as únicas funções do repositório que produzem string de código. O caminho da extensão é normalizado e codificado antes de entrar no literal: ele contém o nome da conta do sistema, que pode ter acento, espaço e aspa. A regressão tem cobertura que localiza onde o literal termina respeitando escapes.
- **O adapter carrega explicitamente o host atual antes do primeiro despacho** e o recarrega quando o engine some, com uma única retentativa apenas para comando read-only. `scripts/validate.mjs` continua exigindo exatamente uma ocorrência de `evalScript(` no bundle: bootstrap e despacho passam os dois pela mesma função.
- **Itens 2, 3 e 9 medidos no experimento equivalente.** O round-trip não-ASCII ficou íntegro nas duas direções, incluindo par de substitutos de emoji — a hipótese de corrupção por codepage não reproduziu naquela máquina. O CEP 12.0.1 embutia Chrome 99.0.4844.84 e `appUILocale` era `pt_BR`, com underscore.

### Smoke do build Moti.on real — After Effects 26.3x87

Em **2026-08-25**, o pacote gerado em `dist/after-effects-cep` foi instalado no perfil do usuário e aberto no After Effects 26.3x87/CEP 12.0.1/Windows 11.

- Com `<ScriptPath>`, a inicialização exibiu `Não é possível executar o script na linha 1. Erro de sintaxe`: `FAIL` observado. Depois de fechar o modal, o bootstrap explícito por `$.evalFile` carregou o mesmo `host/index.jsx` e os comandos responderam.
- O manifest passou a omitir o elemento opcional `<ScriptPath>`. Após build, reinstalação e reinício limpo do AE, o painel abriu sem modal e mostrou `Conectado`: `PASS`.
- `ae.context.read`, `ae.capability.probe` e `ae.diagnostics.echo` passaram. A ponte preservou português, japonês, emoji, aspas e barras; a matriz mostrou fatos reais e manteve recursos futuros/host-específicos indisponíveis em vez de simulá-los.
- `ae.demo.createComposition` criou `Moti.on Demo`; um único Ctrl+Z removeu a composição inteira: `PASS` para o Undo dessa demo. Isso não fecha o Undo da futura integração CHMS-009.
- A primeira inspeção do menu revelou `appUILocale` como `pt_BR` e um rótulo em inglês. A normalização passou a aceitar underscore, caixa e fallback por idioma; após rebuild/reinstalação, o menu exibiu `Desfazer Moti.on: criar composição de teste`: `PASS` no ambiente medido.
- O painel foi observado em largura compacta próxima do mínimo de 280 px, com base escura, uma view dominante e sem overflow horizontal. As larguras 360/480/720, DPI, foco por teclado e leitor de tela continuam `NOT RUN`.

Registro técnico e fontes oficiais: `docs/research/after-effects-cep-bootstrap.md`.

### Limite do canal `evalScript`

- O limite canônico é `MAX_INLINE_EVALSCRIPT_CHARS = 60_000`, medido sobre o JSON **depois** do escape ASCII; texto Unicode pode ultrapassar o teto mesmo quando a string original parece pequena.
- Acima do limite, o adapter recusa antes do bootstrap e antes de qualquer `evalScript`, com `INTERNAL_ERROR`, motivo `INLINE_PAYLOAD_TOO_LARGE`, tamanhos observados e `mayHaveMutated: false`.
- O transporte alternativo por arquivo temporário, com integridade e limpeza, **não está implementado**. Status: `PARTIAL`; execução do build atual no host: `NOT RUN`.

### Premiere UXP — ambiente do host e exportação de diagnóstico

- A fonte oficial para o contexto é `require("uxp").host.version` e `.uiLocale`, disponível no alvo Premiere 25.6+. Ausência ou getter que falha permanece `unknown`; não é convertida em tier `unsupported`.
- MOGRT, transcript e caption tracks são sondados pelos símbolos públicos registrados em `docs/research/premiere-uxp-capability-probes.md`; sem objeto necessário ou quando um getter/factory lança, o resultado é `unknown`.
- O bundle de suporte é salvo somente após ação explícita do usuário por `storage.localFileSystem.getFileForSaving(...)` e `File.write(...)`. Cancelar o picker não é erro, e caminho nativo/nome escolhido não entram no log.
- O manifest mantém a permissão mínima `localFileSystem: "request"`; não usa Node `fs`, processo externo nem `fullAccess`.
- Decisão, fontes e incertezas estão em `docs/research/premiere-uxp-host-environment-and-diagnostics-export.md`. Testes com doubles cobrem o contrato; carregamento e picker no Premiere real: `NOT RUN`.

### CHMS-007 — Logging e redaction

Novo package `@motion/logging`. Entrada no formato da §26; redaction aplicada **na escrita**, não na exportação.

- **A ordem importa e é a decisão central do package.** A §26 manda o log ser exportável pelo usuário como bundle de suporte — o conteúdo sai da máquina dele. Se o valor cru fosse guardado e limpo só na hora de exportar, ele existiria em memória a sessão inteira, apareceria em qualquer dump e dependeria de todo caminho de saída futuro lembrar de limpar. Redigindo na escrita, o dado sensível nunca chega à estrutura.
- **O que é preservado de propósito: o tamanho.** `«redigido» (14 caracteres)` distingue "não salvo" de "Campanha Verão 2026" sem revelar nada. Um placeholder de tamanho fixo perderia diagnóstico real.
- **Chaves comparadas em forma normalizada** — minúsculas, sem `_` nem `-`. O mesmo campo aparece como `projectName`, `project_name` e `project-name` conforme a camada, e uma lista que previsse uma grafia deixaria as outras passar.
- **Regressão coberta por teste:** sem lookbehind, o `s:/` de `https://` casa como letra de unidade do Windows e toda URL do log vira `«caminho»`. O lookbehind exige Chromium 62+; o CEP 12 embute o 99, verificado em execução.
- **Rotação por contagem e por bytes.** Contagem sozinha não protege memória — uma entrada com payload grande pesa mais que centenas de linhas curtas — e bytes sozinho deixaria o bundle ilegível.
- **`recordResponse` consome a `CommandResponse` do contrato** em vez de criar correlação própria: `requestId` e `durationMs` já vêm do `CommandClient`, e um segundo id para o mesmo comando tornaria o diagnóstico exportado impossível de reconstruir.
- **Payload arbitrário de resposta não entra nem em modo debug.** O modo debug, que expira sozinho em 15 minutos, aumenta a metadata diagnóstica permitida sem conservar conteúdo criativo vindo do host.
- A rotação mede bytes UTF-8 reais, limita até uma entrada individual enorme e devolve snapshots/bundles profundamente imutáveis.
- O logger substitui os objetos `logger` ad hoc dos dois painéis e satisfaz `CommandClientLogger`, que é como o cliente de comandos já reportava resposta descartada e timeout.

### CHMS-008 — Shell de UI, i18n e responsividade

`@motion/ui-core` deixou de ser só um CSS: passou a conter o shell dos dois painéis. O markup do starter saiu dos dois `index.html`, que agora têm só `<div id="root">`.

- **Tokens `#1D1D1D` da `docs/UI_FOUNDATION.md`**, substituindo a paleta `#202124` do starter. Separador no lugar de card, trilho sutil no lugar de tile aceso, e um único acento reservado à ação principal.
- **As classes de largura são aplicadas por JavaScript, não por `@media`.** Media query mede a viewport; o que importa num painel acoplado é a largura do painel — e o UXP não garante media query dentro dele. Cobertura para 280, 360, 480 e 720 px.
- **DOM direto, sem framework, e sem `innerHTML`.** O subconjunto usado é o que o Chromium do CEP e o runtime do UXP garantem os dois. Um teste varre o fonte do shell — com comentários removidos, senão acusaria a própria documentação da regra.
- **Ícone com degradação declarada:** SVG inline quando `createElementNS` existe, glifo textual quando não. O UXP não garante SVG, e três botões sem marcador visual em modo compacto seriam indistinguíveis.
- **i18n `pt-BR` e `en-US` com paridade garantida pelo tipo**, não por teste: `enUS` é `Record<MessageKey, string>` derivado de `ptBR`, então chave faltando é erro de compilação. Frases completas com parâmetro nomeado, nunca fragmento concatenado.
- **`normalizeLocale` aceita `pt_BR`** — o formato medido no host, não o suposto. Uma comparação direta com `"pt-BR"` jogaria todo usuário brasileiro no inglês, e só na máquina dele.
- **`formatNumber` troca o separador decimal na exibição** sem tocar na representação numérica interna.
- **Ciclo de vida protegido por construção:** o primeiro render recebe um shell utilizável, e a montagem do painel do Premiere é idempotente entre `create`, `show` e `destroy`. As regressões estão cobertas por teste; este build ainda não foi exercitado no host.
- **A view System Check da §9 existe:** cada capacidade aparece com estado e motivo, com o estado marcado por texto e por classe, nunca só por cor. A caixa de log improvisada do CHMS-006 saiu.
- Os testes usam um DOM falso que implementa só o subconjunto permitido — método que falta ali é sinal de que o shell está usando API que um dos hosts não tem. Largura, DPI, foco, leitor de tela e screenshots nos hosts reais continuam `NOT RUN`.

### CHMS-001 — Baseline e rebranding

- **Baseline do starter registrado** em `docs/BASELINE_STARTER_0.1.0.md`: saída verbatim de `npm run check` (exit 0, 6/6 testes), ambiente, e inventário de `dist/` com SHA-256. Tag `starter-0.1.0` criada. A forma legível por máquina está em `tests/fixtures/dist-baseline-pre-rebrand.json`.
- **Renomeado de "CrossHost Toolkit" para "Moti.on".** Namespace `com.example.crosshosttoolkit.*` → `com.motion.plugin.*`; globais `CrossHostAE` → `MotionAE` e `CrossHostProtocol` → `MotionProtocol`; pacote npm `adobe-crosshost-plugin-starter` → `motion-plugin`. Prefixos reservados para os rigs — `[MOTION_META_V1]`, `// MOTION_EXPRESSION v1 |`, `MOTION | ` — foram registrados em `docs/adr/0001-marca-e-namespace.md`; o primeiro agora é consumido pelo núcleo do CHMS-009.
- **Corrigido: o arquivo `.debug` do CEP ia parar em `dist/`.** `scripts/build.mjs` copiava a árvore de `src/` sem lista de exclusão, então a porta de depuração remota (8091) entrava no output de build. Agora é excluído, e `scripts/validate.mjs` falha se voltar.
- **Corrigido: `BUILD_INFO.json` podia mentir.** `name` e `version` eram literais hardcoded em `scripts/build.mjs`; agora vêm de `package.json`.
- **Corrigido: `scripts/validate.mjs` escrevia na raiz do repositório.** A cópia temporária usada para checar a sintaxe do `.jsx` era gravada como `.tmp-index-jsx-check.js` na raiz e removida num `finally` — se o processo morresse no meio, o arquivo ficava. Agora usa `os.tmpdir()`.
- **Removidos os `console.log` do ciclo de vida do plugin UXP**, proibidos pela §34. Os hooks continuam existindo porque o UXP os exige; o logger estruturado foi entregue depois no CHMS-007.
- **Novas proteções:** `tests/brand.test.mjs` varre a árvore inteira contra os identificadores antigos, com allowlist documental que exige motivo escrito por entrada. `scripts/validate.mjs` assere os IDs definitivos nos manifests construídos. `tests/manifests.test.mjs`, que antes **fixava** os placeholders `com.example`, agora fixa os IDs reais.
- **`.gitattributes` adicionado** normalizando fim de linha, necessário porque o gate de paridade de bytes do CHMS-002 roda em Linux e Windows. `dist/` entrou no `.gitignore`: é saída derivada, reproduzível por `npm run build` a partir da tag.

### CHMS-004 — Dispatcher único do After Effects

O commit crítico de segurança do P0. `evalScript` recebe uma **string de código** que o After Effects avalia com acesso total ao projeto e ao sistema de arquivos do usuário; o starter montava essa string por concatenação. Funcionava porque não havia argumento — no primeiro comando com parâmetro, viraria injeção de código.

- **`MotionAE.dispatch` é o único ponto de entrada.** `scripts/validate.mjs` verifica no build: exatamente um `evalScript(` no bundle do cliente e exatamente um `global.MotionAE =` no host. Um teste adicional fixa o conjunto completo de globais do host, para que um caminho paralelo ao dispatcher não apareça sem justificativa.
- **`encodeForEvalScript` produz sempre ASCII imprimível.** Escapa `\`, `"`, **todo** caractere abaixo de U+0020 e **todo** caractere acima de U+007E — inclusive acentos comuns. Este último ponto é o menos óbvio: o canal do `evalScript` não tem codificação garantida e no Windows o ExtendScript decodifica pela codepage do sistema, então `"Composição"` atravessaria corrompido em máquinas com codepage diferente — e corrompido de um jeito que só aparece na máquina do usuário. A função tem pós-condição assertada: se um caractere escapar da regra, ela lança em vez de emitir código.
- **`MotionJson`**, parser e serializador JSON em ES5 para o host, sem `eval`. Profundidade máxima 64 (o ExtendScript não tem proteção de pilha útil: profundo o bastante derruba o aplicativo em vez de lançar erro reportável), entrada máxima 4 MB, e recusa `__proto__`, `constructor` e `prototype` como chave. Aplica a **mesma** tabela de escape do painel, e um teste compara as duas saídas caractere a caractere.
- **Ordem de validação da §8, imposta pela estrutura.** Parse → versão de protocolo → descriptor → consentimento para operação destrutiva → `preflight` → grupo de Undo → `run`. Toda validação acontece com o projeto ainda intacto: um comando que valida no meio da execução já alterou o projeto quando descobre que não devia ter começado.
- **A regra do `ok` é do dispatcher, não de cada comando.** A §8 diz que `ok: true` nunca acompanha ausência de alteração; aqui isso é `ok = !descriptor.mutates || result.changed === true`. Um comando que ache que fez algo não consegue afirmar sucesso sozinho.
- **Registry separado dos descriptors.** O comando registra `preflight` e `run`; se é destrutivo, se muta e qual o rótulo de Undo vem do descriptor gerado. Um comando que declarasse a própria destrutividade colocaria `destructive: false` a um caractere de distância do código que apaga dado do usuário.
- **Cliente com correlação por `requestId`.** Resposta com id desconhecido é **descartada** com log — acontece de verdade, porque um `evalScript` que estourou o timeout ainda chama o callback depois, e entregá-la mostraria ao usuário o resultado da operação errada. O timeout **nunca afirma que nada aconteceu**: `evalScript` não tem cancelamento, então a mensagem manda conferir o histórico de Desfazer.
- **Três comandos reais**: `ae.context.read`, `ae.demo.createComposition` e `ae.diagnostics.echo`. O terceiro é o botão **Verificar ponte com o host** em System Check: manda um valor com acento, CJK, emoji e aspas e confere a volta. É a única forma de saber se os escapes estão íntegros *naquela máquina, com aquela codepage*. Sem ele, um usuário com o painel quebrado só teria "não funciona" para relatar.
- **O cliente passou a ser empacotado** pelo esbuild a partir de TypeScript. Não foi para "ter um bundler": a alternativa era reimplementar o escape dentro do painel, e uma segunda cópia da única função que impede injeção de código no host é exatamente a duplicação que este projeto não pode ter.
- **`context.locale`**, campo opcional novo, para que o rótulo em `Edit > Undo` saia no idioma do usuário — o rótulo é escrito pelo host, que não alcança a i18n do painel. Campo opcional não sobe `PROTOCOL_VERSION`, conforme `docs/adr/0002`.
- **`docs/HOST_LIMITATIONS.md`**, novo: separa estado de implementação de evidência executada e registra o roteiro de host do After Effects sem transformar teste automatizado em aprovação do host.

Os testes automatizados daquele marco não provavam que o painel carregava no After Effects. Essa lacuna foi parcialmente fechada depois pelo smoke real do build Moti.on em AE 26.3x87; a matriz completa de hosts continua em `NOT RUN`.

### CHMS-005 — Command bus do Premiere Pro

Precedido de pesquisa em fonte primária, registrada em `docs/research/premiere-uxp-transactions.md`. **A pesquisa corrigiu três coisas que teriam sido implementadas erradas se o código fosse escrito de memória:**

1. **`lockedAccess` e `executeTransaction` são síncronas.** O plano previa `withTransaction` como `async` devolvendo `Promise`. A referência oficial mostra `lockedAccess(callback: () => void): void` e `executeTransaction(callback: (compoundAction: CompoundAction) => void, undoString?: string): boolean`. Pior: o plugin oficial da Adobe tem **duas regras de lint dedicadas** a impedir exatamente esse erro.
2. **O callback recebe o `CompoundAction`; não devolve ações.** A assinatura planejada era `build: (ctx) => Action[]`. As ações entram por `compound.addAction(action)`.
3. **`no-action-scope-escape` é regra oficial, não invenção local.** O plano previa uma regra `no-restricted-syntax` caseira para a exigência da §10 de não reter referências de `Action`. A Adobe já tem uma — e regra oficial acompanha as mudanças da API, enquanto regra caseira envelhece em silêncio.

- **`@adobe/eslint-plugin-premierepro`** entrou, cumprindo a exigência da §7 de "ESLint incl. official Premiere rules". O plugin declara peer `eslint@^9` e o repositório usa o 10; a resolução foi destravada por um `override` dirigido, **e `tests/premiere-eslint-rules.test.mjs` prova que as regras de fato disparam** — com par positivo e negativo cada uma. Um override sem verificação é só uma forma de silenciar o instalador: se o plugin carregasse sem produzir diagnóstico, `npm run lint` ficaria verde para sempre e a proteção contra o erro mais caro do Premiere teria deixado de existir sem ninguém notar.
- **`withTransaction`** aninha `executeTransaction` dentro de `lockedAccess`, como a Adobe documenta, e devolve `{ executed, empty }`. **`compound.empty` é um sinal mais forte do que o equivalente no After Effects**: lá, saber se algo mudou depende de o comando reportar `changed` honestamente; aqui o próprio host responde. Nenhuma referência a `Action` ou `CompoundAction` sobrevive ao retorno.
- **Adapter com o mesmo contrato do host do After Effects**: mesmos 22 códigos de erro, mesma recusa de `protocolVersion` divergente, mesma regra do `ok`, mesmo `preflight` antes de qualquer mutação. O módulo `premierepro` é **injetado**, e é isso que torna o adapter testável sem abrir o Premiere.
- **O painel do Premiere foi reescrito em TypeScript** e passou a usar o adapter. Sem isso o adapter seria código morto — escrever a camada e deixar o painel no caminho antigo é exatamente o placeholder que a §0.5 proíbe. O `premiere-adapter.js` e o `main.js` antigos foram removidos.
- **`requiredPermissions` declarado pela primeira vez**, e com uma única entrada: `"localFileSystem": "request"`. Não `"fullAccess"` — daria acesso a todo o disco para um recurso que precisa de um arquivo por vez. `network`, `enableAddon`, `launchProcess` e `allowCodeGenerationFromStrings` estão **ausentes de propósito**, cada um amarrado à issue que o justificaria. `scripts/validate.mjs` falha se uma permissão não prevista aparecer, se `localFileSystem` subir de nível, ou se `network.domains` virar `"all"`.
- **Meta CSP nos dois painéis**, partindo de `default-src 'none'`, sem `unsafe-inline` nem `unsafe-eval`. Verificado no build.
- **`packages/test-fixtures`** com o duplo do módulo `premierepro`. Ele registra a **ordem** das chamadas, não só o fato de terem acontecido: a garantia que importa é que `executeTransaction` roda dentro do callback de `lockedAccess`, e um teste que só contasse chamadas passaria com as duas invertidas. O duplo também lança se a transação for aberta fora da trava.

#### Gate de paridade aposentado, com substituto

`tests/build-parity.test.mjs` comparava `dist/` contra o snapshot do CHMS-001b e cumpriu o papel: provou que a migração para workspaces não alterou nenhum artefato. Depois que o CHMS-004 e o CHMS-005 substituíram deliberadamente as duas camadas de host e os dois painéis, continuar comparando produziria uma lista de divergências declaradas que cresce a cada commit sem carregar sinal — a forma mais comum de um gate morrer sem que ninguém perceba.

Foi substituído por `tests/build-output.test.mjs`, que declara o **inventário exato** do build, verifica que `CSInterface.js` chega intacto (é o único arquivo de terceiros), e mantém as asserções estruturais. O fixture antigo continua no repositório, marcado como registro histórico.

### CHMS-006 — Matriz de capacidades

- **`parseHostVersion` e `compareVersions`**, existindo por causa de uma frase da §9: *"Nenhuma feature deve depender apenas de `parseFloat(hostVersion)`."* O problema não é estilo — `parseFloat("25.10")` devolve `25.1`, então `25.10 < 25.9`, e um gate escrito assim **bloqueia a versão mais nova e libera a mais velha**. O erro não aparece em teste nenhum enquanto os números menores não passarem de 9, e aparece meses depois na máquina de quem atualizou o aplicativo. Há um teste que demonstra o `parseFloat` errando ao lado do `parseHostVersion` acertando, e uma varredura no fonte que falha se `parseFloat` reaparecer no pacote.
- **`buildCapabilities` é pura** e compartilhada pelos dois hosts. Cada um coleta os fatos crus do seu jeito; a derivação é a mesma. É isso que impede as duas plataformas de divergirem em silêncio sobre o que "disponível" significa.
- **Uma sonda que não pôde concluir vira `"unknown"`, nunca `false`.** Colapsar em `false` faria a interface afirmar que um recurso está indisponível quando ninguém verificou; em `true` seria pior. Onde o contrato exige booleano, `"unknown"` vira `false` — mas o estado real sobrevive em `findings`, e é dele que a interface tira o que mostrar.
- **Toda capacidade ausente traz chave de motivo**, e um motivo específico da sonda vence o genérico: "não empacotado neste build" e "seu host não suporta" pedem ações diferentes do usuário, e a primeira não é culpa da instalação dele.
- **Campos de outro host não aparecem na matriz.** `hasActiveComp` não significa nada no Premiere; emitir os dois sempre produziria linhas permanentemente vermelhas para coisas que não existem naquele host.
- **Cache só de sessão, sem nenhum caminho de persistência** — e há um teste que falha se um aparecer. Capacidade é propriedade do ambiente, não do plugin: o usuário liga uma preferência, instala uma atualização, conecta a rede. Uma matriz persistida continuaria afirmando o estado de ontem, e o pior caso é o silencioso.
- **Sondas nos dois hosts**, todas por presença de símbolo. A leitura da preferência do After Effects fica dentro de `try/catch` porque **os nomes de seção e chave não foram verificados** contra documentação da Adobe — se estiverem errados o resultado é `"unknown"` e a interface diz que não conseguiu determinar, em vez de afirmar `false` com base num nome que ninguém confirmou.
- **Botão "Verificar sistema" nos dois painéis.** Naquele marco, o resultado ainda saía na caixa de log. O CHMS-008 depois entregou a view System Check compartilhada, com estado e motivo por capacidade.
- **`docs/adr/0003-tiers-de-suporte-after-effects.md`**: a §4.2 define faixas só para o Premiere, e para o After Effects não havia o que transcrever. As faixas propostas estão registradas como proposta, e o teste que as cobre se chama "os tiers do After Effects são proposta registrada, não transcrição" — para que ninguém leia o código e conclua que veio do documento normativo.

### CHMS-003 — Package `contracts`

- **`packages/contracts`** define o contrato de comandos da §8: `CommandRequest`, `CommandResponse`, `CommandWarning`, `CommandFailure`, `CommandContext`, `CommandOptions` e `CommandTiming`, mais `HostCapabilities` (§9) e `RigMetadata` (§11).
- **Os 22 códigos de erro da §8** como tupla `readonly` com união derivada — não `const enum`, que quebra com `isolatedModules` e não é consumível pelo módulo ES5 do ExtendScript. `ERROR_META` é `Record<ErrorCode, …>`, então acrescentar um código sem decidir se é recuperável e qual a ação corretiva não compila.
- **Dois apertos em relação ao texto da especificação**, ambos estreitando o contrato: `CommandFailure.code` é a união fechada `ErrorCode` e não `string`, então um comando não consegue inventar um código na hora em que falha; e `CommandFailure.action` é chave i18n e não frase, sem o que todo erro seria monolíngue apesar de a §22.3 exigir pt-BR e en-US desde o início.
- **Ponte para o envelope legado**: `fromLegacy`, `toLegacy` e `LEGACY_CODE_MAP` traduzem os códigos que os dois hosts inventavam (`AE_CONTEXT_ERROR`, `PREMIERE_CONTEXT_ERROR`, `SELF_TEST_FAILED` e os três de resposta malformada) para a lista fechada. Quando a tradução perde informação — `AE_CREATE_COMP_ERROR` e `AE_CONTEXT_ERROR` viram ambos `HOST_OPERATION_FAILED` — o código original sobrevive em `details`, porque os dois pedem investigação diferente.
- **Módulo ES5 gerado** em `apps/after-effects-cep/host/generated/motion-contracts.jsx`. O ExtendScript não importa TypeScript e não tem módulos, então o contrato existe duas vezes; a segunda cópia é gerada e nunca escrita à mão. `generated-drift.test.mjs` falha se sair de sincronia, e roda o mesmo scanner de subconjunto ExtendScript usado nos fontes escritos à mão — código gerado não está acima da regra.
- **`docs/adr/0002-versionamento-do-protocolo.md`**: o que faz e o que não faz `PROTOCOL_VERSION` subir, e a regra de que envelope de versão diferente é **recusado**, nunca interpretado da melhor forma possível — adivinhação é o que produz corrupção silenciosa de projeto.
- **ESLint passou a analisar TypeScript** via `typescript-eslint`, sem checagem com informação de tipo: `npm run typecheck` já roda o `tsc` completo e é a autoridade sobre tipos; duplicar isso no lint dobraria o tempo sem achar nada novo.

**Adiado naquele marco, concluído agora:** JSON Schema e validadores Ajv não tinham ponto de chamada antes dos dispatchers. A dívida foi encerrada com quatro schemas Draft 2020-12 e codegen standalone no build. Ajv permanece fora do runtime; a §24 continua atendida sem `allowCodeGenerationFromStrings`.

### CHMS-002 — npm workspaces sem regressão

- **Migrado para npm workspaces.** `src/after-effects-cep` e `src/premiere-uxp` viraram `apps/*`; `src/shared/protocol.js` virou `packages/contracts/legacy/protocol.js`; `src/shared/theme.css` virou `packages/ui-core/src/theme.css`. `src/` deixou de existir. Foram criados **2 packages, não os 14** que a §7 prevê: um diretório vazio é o placeholder que a §0.5 proíbe. `docs/ARCHITECTURE.md` traz a tabela mapeando cada diretório adiado à issue CHMS que o cria.
- **TypeScript 6.0.3, ESLint 10.9.0, typescript-eslint 8.67.0**, sem nenhuma dependência de runtime. A escolha do TypeScript 6 e não do 7 é forçada: `typescript-eslint` declara peer `typescript <6.1.0` e não existe major mais nova, então o 7 custaria o lint com reconhecimento de tipos.
- **`npm run typecheck` verifica a camada ExtendScript de verdade.** `apps/after-effects-cep/tsconfig.host.json` roda `checkJs` com `lib: ["ES5"]` sobre o host, tipado por JSDoc mais `host/types/extendscript.d.ts`. O typecheck já encontrou 17 problemas reais na primeira execução.
- **`scripts/check-extendscript.mjs`**, novo: varre 17 construtos fora do subconjunto ExtendScript, normalizando comentários e literais antes para não gerar falso positivo. Tem teste positivo e negativo próprio em `tests/extendscript-subset.test.mjs` — um scanner sem teste protege menos do que aparenta.
- **`scripts/build-extendscript.mjs`**, novo: monta o host e emite `#target aftereffects` exatamente uma vez. A diretiva saiu do arquivo-fonte porque não é JavaScript válido e impedia `tsc` e `node --check` de lerem o host. O CHMS-004 passou depois a usar o mesmo mecanismo de concatenação por ordem explícita.
- **`tests/build-parity.test.mjs`**, novo: gate de aceite do CHMS-002. Compara o conjunto de caminhos e o SHA-256 de `dist/` contra `tests/fixtures/dist-baseline.json`. Arquivos que mudaram de propósito entram num mapa `ALLOWED_DIVERGENCE` que exige motivo escrito de no mínimo 40 caracteres, e um terceiro teste falha se uma divergência declarada voltar a ser idêntica — permissão morta esconderia a próxima mudança de verdade.

#### Mudança de comportamento neste commit

Removido o ramo `if (!app.project) { app.newProject(); }` de `createDemoComposition`. `app.newProject()` descarta o projeto aberto, não entra no histórico de Undo, e estava sendo chamado de dentro de um grupo de Undo. Na prática o ramo nunca disparava, porque o After Effects sempre expõe um `app.project`; era um risco latente de perda de dados sem nenhum ganho.

#### Correções de ferramenta encontradas durante a migração

- `scripts/build.mjs` copiava `.tsbuildinfo` para `dist/`; agora exclui artefatos do compilador por extensão, e o `tsc` foi reconfigurado para gravá-los fora da árvore dos apps.
- `packages/contracts/legacy/` recebeu um marcador `"type": "commonjs"`: o package declara `"type": "module"` para o código do CHMS-003, e sem o escopo o Node passava a interpretar o protocolo UMD como ESM, quebrando `root.MotionProtocol = factory()`.
- Duas correções apontadas pelo ESLint no host: escape desnecessário numa regex, e `hasOwnProperty` acessado direto do objeto em vez de `Object.prototype.hasOwnProperty.call` — um objeto vindo de dados pode mascarar o método.

## 0.1.0 — 2026-08-24

- Starter Premiere Pro UXP funcional para leitura do projeto e da sequência ativa.
- Starter After Effects CEP/ExtendScript funcional para leitura do contexto e criação de composição de teste.
- Contrato compartilhado de respostas, build sem dependências, validação, testes e CI.
