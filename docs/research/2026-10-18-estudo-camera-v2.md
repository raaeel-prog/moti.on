# Estudo de câmera para o Moti.on — v2

**Motor de câmera, contrato com o Parallax e catálogo para motion flyers**

Moti.on • Especificação técnica v2 • 19 de outubro de 2026 • substitui a v1 (`Moti_on_Estudo_Camera_Integracao.docx`, 18/10)

A v1 propunha uma arquitetura e pedia uma auditoria antes de qualquer alteração. A v2 registra o que a auditoria encontrou, o que foi decidido e implementado, as fórmulas que estão de fato no código e o que ainda falta provar no After Effects. A decisão de arquitetura está no [ADR 0007](../adr/0007-motor-de-camera.md). O estudo clean-room do Brazu está em [2026-10-18-brazu-parallax-rea.md](2026-10-18-brazu-parallax-rea.md).

**Estado:** o motor, as 11 receitas, os comandos e a aba Parallax estão implementados.
- Testes automatizados de núcleo, harness do host e painel passam.
- No After Effects 26.5x89/Windows, `scripts/verify-camera-engine.jsx` passou 14/14. É o Marco 1 da v1: três planos, Hero Push, Depth Slide e Float Loop com e sem Parallax, sem salto no enquadramento inicial, projeto reaberto.
- Status: `IMPLEMENTED_HOST_PARTIALLY_VERIFIED`. Faltam o painel aberto dentro do AE, o Undo em um passo e o macOS.

## O que mudou da v1 para a v2

| Tema | v1 (proposta) | v2 (decisão) |
|---|---|---|
| Auditoria | Pedida antes de editar | Feita. O mapa real está na seção 1. |
| Rig | Câmera de saída sem parent | Null de controle no pivô com a câmera filha em `[0,0,−dist]`, a topologia do Parallax v3. No modo Parallax o motor adota o master existente. |
| Rotações | Quaternions no núcleo | Base `Ry(pan)·Rx(tilt)·Rz(roll)` com horizonte nivelado. A Orientation sai por decomposição exata na ordem medida do AE (`Rx·Ry·Rz`) e o roll vai para o Rotate Z. `lookAt` foi descartado (seção 5). |
| Loop | Trajetória periódica | Soma de harmônicos inteiros do período, com semente. Posição e velocidade fecham por construção. |
| Impacto | Envelope suave | Envoltória C1 com antecipação, ataque, ultrapassagem e acomodação amortecida. |
| Foco | Profundidade axial com janela passada | Implementado: 7 amostras ponderadas, alvo por Layer Control e fallback suave. |
| Tempo do shot | Início e duração | Marcador com duração no null de controle. Arrastar ou esticar o marcador muda o shot ao vivo. |
| Catálogo | 12 receitas | 11 implementadas. Rack Reveal espera o rack focus. Whip Reframe passou de 12° para 5° (seção 10). |
| Motion blur | Perfis por composição | Aviso ao aplicar receitas rápidas. O comando de perfil fica para a próxima fase. |
| Interface | Manter o fluxo atual | Aba nova **Parallax** no topo, ao lado de Suavização, com as seções Parallax e Câmera. |

## 1 Estado real do Moti.on (auditoria)

| Peça | Onde está | O que faz |
|---|---|---|
| Parallax v3 | `host/src/commands/animate-parallax-quick.jsx` | Cria o master null em `[cx,cy,0]` e a câmera filha em `[0,0,−zoom]`, com zoom 3000. Distribui os planos em Z e escreve expressões de compensação `k = 1 + z/f`. Os metadados ficam no comentário do master. |
| Parallax avançado | `host/src/commands/parallax-advanced.jsx` | Foco, wiggle, zoom e bake legados. `create-null` e `set-focus` continuam pendentes (ADR 0004). |
| Transições de câmera | `host/src/commands/camera-transition.jsx` | Os 11 movimentos clássicos por keyframes, roteados ao master quando há Parallax v3. |
| Núcleo de câmera | `packages/contracts/src/camera-kernel.ts` | Pose, impacto, ruído harmônico, cobertura, foco e orientação, em ES3. |
| Receitas | `packages/contracts/src/camera-presets.ts` | 11 receitas por intenção, com validação (`isCameraRecipe`). |
| Gerador | `scripts/build-motion-library.mjs` → `host/generated/camera-library.jsx` | `MotionCameraCore` (funções e `source`) e `MotionCameraCatalog`. |
| Rig | `host/src/camera/camera-rig.jsx` | Plano, adoção ou criação do par, controles, marcadores, expressões, metadados, rollback e devolução. |
| Comandos | `host/src/commands/camera-shots.jsx` | `ae.camera.shot.apply`, `.adjust` e `.remove`, `ae.camera.remove`, `.inspect` e `.bake`. |
| Painel | `client/src/camera-panel.ts`, `client/src/main.ts`, `packages/ui-core/src/ae-camera.css` | Aba Parallax com os segmentos Parallax e Câmera. |

O motor de expressão é o JavaScript do AE. O núcleo também roda no ExtendScript do host, e o build agrupa `&&` dentro de `||` porque o ExtendScript 26.5 avalia os dois com a mesma precedência.

## 2 O Brazu e onde o Moti.on vai além

Análise clean-room do Brazu 2.0.0 instalado: comportamento e estrutura, sem desofuscar nem copiar expressões, nomes, presets ou assets. O resumo:

| Brazu | Moti.on |
|---|---|
| Posição interpolada entre o centro e o valor: camadas fora do centro "saltam". | Projeção exata `k = 1 + z/f`: o layout não muda com o rig criado (≤ 0,5 px). |
| Identidade por nome e por `comp.layer(1)`. | Identidade por ids no metadado. O alvo de foco é um Layer Control, que sobrevive à renomeação. |
| Wiggle sem semente, loop ou limite; a rotação avançada lê as amplitudes de posição. | Ruído harmônico com semente que fecha o loop. Amplitude por eixo, normalizada pelo campo visível. |
| Auto foco no Z mundial mais próximo, varrendo todas as camadas a cada quadro. | Foco axial no alvo escolhido, com suavização determinística e custo constante. |
| 4 presets "Zoom Out", um eixo. | 11 receitas em 5 intenções, com 6 eixos, lente, dolly zoom, impacto e loop. |
| Bake congela só o quadro atual das camadas. | Bake quadro a quadro de pose e óptica, com o motor desligado ao final. |
| Padrões num arquivo global em Documentos. | Tudo no projeto: controles nativos, marcadores e metadados. |

Ideias de produto que valem também para o Moti.on, reescritas do zero:
- controlador único com a óptica ligada;
- ponto de foco por camada;
- movimentos empilháveis;
- tour de foco entre camadas.

## 3 Arquitetura implementada

| Componente da v1 | Implementação |
|---|---|
| SceneInspector | `MotionCameraRig.plan`: motor existente, Parallax v3 ou cena 3D independente. Recusa uma câmera alheia, uma cena só 2D e rigs copiados de outra comp. |
| PresetRegistry | `CAMERA_RECIPES` + `isCameraRecipe`. A receita é dado declarativo, sem ids de projeto. A instância fica no metadado do controle. |
| MotionKernel | `camPose(t, rig, shots)`, puro e determinístico. |
| LensFocusSolver | Lente, dolly zoom e cobertura em `camPose`; foco em `camFocusDepth`. |
| ConstraintSolver | Limite suave do plano próximo, `tilt` limitado a ±80° e joelho de cobertura. A proteção de leitura fica para a fase 3. |
| ParallaxAdapter | `parallaxFrame` lê o quadro, o plano mais próximo e a sobra do fundo nos originais do Parallax. |
| HostAdapter / RigManager | `camera-rig.jsx` e `camera-shots.jsx`: um grupo de Undo por comando, aberto pelo dispatcher, e rollback completo. |
| BakeService | `ae.camera.bake`: keys por quadro e motor desligado. |

**Fluxo de avaliação** em cada expressão:
1. Lê os controles (`Number(effect(...)(1))`) e os marcadores com parâmetros.
2. `camPose` soma os shots, cada um com seu peso no tempo.
3. Aplica o limite do plano próximo e o limite de tilt.
4. Monta a base, a lente e a cobertura.
5. Cada propriedade escreve a sua parte: Position = `m`, Orientation = `camOrientation`, Rotate Z = roll, Zoom = lente × cobertura e Focus = profundidade axial.

Nenhuma expressão lê uma propriedade que dependa dela.

## 4 Contrato com o Parallax

O Parallax v3 é o caso "planos 3D nativos" da v1:
- O master null fica no pivô `[cx, cy, 0]` e a câmera é sua filha em `[0, 0, −zoom]`.
- Cada membro tem Z e uma compensação `x' = cx + (x − cx)·k`, com `k = 1 + z/f` e `f` congelado.
- Com a câmera de referência, a projeção devolve exatamente o layout 2D.

**Regra única:** o motor move o master e a óptica da câmera; o Parallax nunca recompensa esse movimento.

| Situação | Comportamento |
|---|---|
| Aplicar shot com Parallax | O motor adota o master (confere `compId`, `cameraId` e o parentesco) e escreve Position, Orientation e Rotate Z no master e a óptica na câmera. |
| `ae.parallax.adjust` com o motor | Permitido. O zoom gerenciado é aceito, e o zoom de referência é lido antes da expressão. |
| `ae.parallax.move` com o motor | Recusado: o motor é o dono da Position do master. |
| `ae.parallax.remove` com o motor | Recusado até `ae.camera.remove`. |
| Foco legado do Parallax | Substituído pelo foco do motor e devolvido ao remover. |
| Sem Parallax, cena 3D | Rig independente com a câmera padrão do AE: `zoom = largura · 50/36`, na mesma pose da vista sem câmera. |
| Sem Parallax, cena 2D | Recusado com a sugestão de preparar com Parallax. Nada é convertido para 3D em silêncio. |

**Profundidade do Parallax**, nova nesta rodada:
- `depthMode` linear, `front` (mais espaço perto da câmera) ou `area` (o maior plano vai para o fundo);
- `backgroundDepth` coloca o fundo atrás do plano focal, ampliado e com aviso de resolução.

## 5 Seis graus de liberdade

**Normalização**, como proposta na v1:

```
visW = largura · dist / zoom          visH = altura · dist / zoom
tx = trX · visW · w    ty = trY · visH · w    tz = trZ · dist · w
```

**Base da câmera** (`p` = pan + órbita, `q` = tilt + órbita, `r` = roll):

```
f  = [sin p·cos q, −sin q, cos p·cos q]          (frente)
r0 = [cos p, 0, −sin p]                          (direita, horizontal)
d0 = [sin p·sin q, cos q, cos p·sin q]           (baixo)
right = r0·cos r + d0·sin r      down = d0·cos r − r0·sin r
câmera = pivô − dist·órbita + [tx, ty, tz]       m = câmera + dist·f
```

**Orientation no After Effects.** A composição medida no host é `M = Rx(ox)·Ry(oy)·Rz(oz)·Rz(rotZ)` (`docs/research/after-effects-3d-transform.md`, erro de 1e-13). Para a base `Ry(p)·Rx(q)`:

```
ox = atan2(sin q, cos p·cos q)
oy = asin(sin p·cos q)
oz = atan2(−sin p·sin q, cos p)
Rotate Z = valor do usuário + roll
```

**Por que não `lookAt`:** ele só aponta o eixo Z e devolve `oz = 0`. Quando pan e tilt se combinam, falta o `oz` acima. Com pan 10° e tilt 5° são cerca de −0,9°, aproximadamente 15 px na borda de um flyer. O teste do núcleo reconstrói os três eixos com a matriz medida (erro < 1e-12). O harness do host faz o mesmo a partir das expressões avaliadas.

**Órbita:** azimute e elevação em torno do pivô, com tilt total limitado suavemente a ±80°, sem flip no topo. Pan acima de ±90° funciona, mas a representação dos ângulos pula. Nenhuma receita chega perto disso.

**Câmera existente:** adotar fica para depois. Hoje o motor recusa a cena e explica o motivo; não concatena expressões nem substitui canais.

## 6 Autofoco

Implementado como na v1, com estes valores:

```
para i = 0..6:  ti = t − s·i/6,  peso = 7 − i
  C = câmera.toWorld([0,0,0], ti)    F = normalize(câmera.toWorldVec([0,0,1], ti))
  T = alvo.toWorld(alvo.anchorPoint, ti)    (sem alvo: o pivô)
  d = dot(T − C, F) + ajuste
  foco_i = d ≥ 100 ? d : (d ≤ 50 ? fallback : fallback + (d − fallback)·suave((d − 50)/50))
foco = Σ peso·foco_i / Σ peso
```

- O fallback é a distância axial até o pivô, então um alvo atrás da câmera nunca dá NaN nem salto.
- Com `s = 0`, o foco é avaliado direto.
- Controles: Alvo do foco (Layer Control), Ajuste do foco (px), Suavizar foco (s), Profundidade de campo, Abertura e Desfoque.
- **Pendentes:** rack focus A/B (Rack Reveal), foco por shot e nulls de alvo.

## 7 Zoom dinâmico e enquadramento

Três operações separadas, como a v1 pedia:

```
lente = zoom · exp(Σ w·ln(lens)) · (dist − dolly) / dist      (dolly = Σ dz·dollyRatio)
```

**Dolly zoom:** com `dolly = 1`, a lente acompanha a profundidade e o plano focal mantém o tamanho dentro de 1% (teste do núcleo).

**Plano próximo:** o avanço é limitado suavemente para que o plano mais próximo cresça no máximo `growth` vezes:

```
tz ≤ near · (1 − 1/growth)      via camSoftCap (tanh), contínuo
```

**Cobertura do fundo**, só com o Parallax: a cada quadro, projeta os quatro cantos do fundo (com a sua sobra, na profundidade real do plano) e calcula o menor zoom de lente que mantém os quatro cantos da comp dentro desse quadrilátero:

```
para cada aresta (a → b) do fundo projetado e cada canto p da comp, relativos ao centro:
  g0 = cross(b − a, −a)      b' = cross(b − a, p)
  se b'·área < 0:  s ≥ −b'/g0          cobertura = joelho(max(1, s))
```

Com pan e tilt, o plano fica oblíquo e o lado que se afasta encolhe pela perspectiva. A primeira versão media só no centro e deixou ~12 px de borda no AE (Whip Reframe + Depth Slide). O joelho C1 em `s = 1` deixa no máximo ~0,5 px. Intensidade zero não muda nada. No modo independente não há cobertura: o motor não sabe qual camada é o fundo.

**Pendentes:**
- proteção de leitura: título, data e CTA dentro da margem durante o trecho crítico;
- enquadramento por terços;
- indicador de limite de resolução.

## 8 Suavização, impacto e loop

**Curvas:** as mesmas da biblioteca de presets (`libraryEase`: silk, glide, sine, quad, quint, expo, velvet, drift, snap, smooth), mais `impact`.

**Direções:**

| Direção | Peso | Uso |
|---|---|---|
| `to` | `e` | Sai do design e segura o fim. |
| `from` | `1 − e` | Chega ao design. É a mais segura para revelações, porque o último quadro é o layout. |
| `through` | `e − 0,5` | Atravessa o design. |

**Impacto** (`camImpact`, `imp = [antecipação, ataque, ultrapassagem, oscilações, amortecimento]`):

```
antecipação (opcional, duração 0,8·ataque):  −antic · sin²(π·u/lead)
ataque:                                       (1 + over) · suave((u − lead)/ataque)
acomodação:  1 + over · e^{−kτ}·(cos ωτ + (k/ω)·sin ωτ) · (1 − suave((τ − 0,55)/0,45)),  ω = 2π·oscilações
```

`suave` é a quíntica com velocidade e aceleração nulas nas pontas. As junções são C1. O teste confere a ausência de saltos de velocidade e o assentamento em 1.

**Pulso** (Beat Hit): sobe e volta a zero dentro do shot.

**Loop:**

```
ruído(t) = Σ_{k=0..2} a_k · sin(2π·((n0 + k)·t/período + φ_k(seed, canal))) / Σ a_k,   a_k = 1/(1 + k)
```

- Harmônicos inteiros do período (`n0 = 1` para o drift): posição e todas as derivadas fecham na emenda (teste). A semente muda só as fases.
- O tremor usa harmônicos altos (`tremorHz · período`) do mesmo período.
- Ao aplicar, o período é ajustado para caber um número inteiro de ciclos na duração.
- Rampas de 0,25 s entram e saem só quando o loop não toca o início ou o fim da comp.

## 9 Motion blur e renderizadores

- Receitas rápidas (Punch In, Whip Reframe, Beat Hit) devolvem o aviso `CAMERA_MOTION_BLUR` quando a comp está sem motion blur. Nada é ligado em silêncio.
- O render com motion blur é verificado no script do host (Punch In com e sem blur).
- **Pendentes:**
  - comando explícito de perfil por comp (Nítido 90°/−45°, Equilibrado 180°/−90°, Arrasto 270°/−135°), reversível;
  - bake com amostras entre quadros para movimentos rápidos.
- O renderer homologado primeiro é o Classic 3D, que o Parallax exige.

## 10 Catálogo

Valores com intensidade 100%. Todas as receitas aceitam intensidade de 0 a 300%, direção, duração e início, além de ajuste fino de X/Y/Z, pan/tilt/roll e curva.

| Receita | Intenção | Duração | Valores | Observação |
|---|---|---|---|---|
| Hero Push | Destacar | 4 s | Z 8%, silk | Marco 1. |
| Depth Slide | Atravessar | 3 s | X 7%, Z 2%, contra-pan −1°, through | Marco 1. |
| Float Loop | Respirar | loop 6 s | X 1%, Y 0,6%, roll 0,25° | Marco 1. Semente editável. |
| Reveal Pull | Revelar | 3 s | Z 10%, Y 2%, from, drift | Termina no layout. |
| Pedestal Reveal | Revelar | 2,5 s | Y 6%, tilt 1,5°, from | Tilt compensado. |
| Arc Hero | Destacar | 4 s | órbita 6°/2°, Z 2%, through | Arco curto: recortes planos não aguentam órbita ampla. |
| Punch In | Impactar | 0,55 s | Z 5%, ataque 16%, ultrapassagem 6% | Pede motion blur. |
| Whip Reframe | Atravessar | 0,35 s | pan 5°, expo | Pede motion blur. A v1 propunha 12°: ver abaixo. |
| Dolly Zoom | Destacar | 3 s | Z 12%, dolly 1 | Precisa de separação de profundidade. |
| Beat Hit | Impactar | 0,35 s | pulso Z 2%, roll 0,4° | Por marcador. Áudio fica para depois. |
| Controlled Handheld | Respirar | loop 6 s | X/Y 0,3%, rotação 0,15–0,2°, tremor 7 Hz | Drift + tremor com semente. |
| Rack Reveal | Revelar | 2,5 s | — | Pendente: precisa do rack focus A/B. |

**Whip Reframe, 12° → 5°.** O meio-campo horizontal de um flyer vertical no Parallax é `atan(540/3000) ≈ 10°`. Como um shot `to` segura a pose final, 12° terminaria com o design todo fora do quadro. 5° desloca o pivô em cerca de 260 px, um reenquadramento forte que mantém o design visível. Com intensidade de 240% se chega aos 12° da v1, para quando houver espaço ou um corte planejado, como a própria v1 alertava.

**Primeiras receitas para flyers:** Hero Push, Depth Slide e Float Loop, como na v1.

### 10.1 Coreografias que leem a cena

Os shots acima são movimentos isolados. As **coreografias** leem as camadas 3D da composição e montam uma sequência longa: a câmera vem lá de trás, passa entre as camadas, dá zoom numa e depois em outra com o foco acompanhando, e volta ao layout.

| Coreografia | Duração | O que faz |
|---|---|---|
| Revelação em profundidade | 10 s | A câmera começa Z +2500 px para dentro, junto do fundo, e volta em linha reta à posição original. As camadas aparecem conforme ela passa. Depois, zoom com impacto no protagonista e volta ao layout. |
| Tour pelas camadas | 10 s | Pula entre até 3 camadas com zoom de impacto, órbita e roll alternados, arco no trajeto e rack focus antes da câmera; em cada camada continua avançando devagar. |
| Sequência completa | 16 s | Abertura Z +2500, revelação, zooms rápidos nos destaques e fechamento no layout. |
| Zooms rápidos | 8 s | De canto a canto: um zoom com estalo em cada um de até 4 destaques, roll alternado e o foco acompanhando. |
| Travelling entre camadas | 10 s | Arco em torno do centro do fundo: o fundo fica enquadrado e as camadas da frente atravessam o quadro. |
| Órbita do protagonista | 9 s | Aproxima, contorna em arco lento com o foco nele e volta. |
| Mergulho na cena | 6 s | Avança no protagonista, atravessa a camada dele como uma cortina e termina limpo no fundo, como saída ou transição. A lente abre para o fundo não passar de 2,2×. |

**Como funciona:**
- **Visitas.** Cada passo é um shot de pose absoluta: o ponto que a câmera olha, a distância, a órbita, o arco no trajeto e o ponto de foco.
- **Encadeamento.** As visitas se encadeiam no tempo, e a última volta exatamente ao design.
- **Shot vivo.** Cada passo continua sendo um shot vivo, com marcador para mudar o tempo.

**Regras de enquadramento do planejador** (mais detalhes no ADR 0007):
- texto fica inteiro, dentro da área segura; um título largo avança pelo menos 1,08× enquanto couber em 90% do quadro;
- enquadramento de operador: uma camada perto da borda do design fica fora do centro, porque o ponto de mira desliza para o centro até o fundo cobrir sozinho; se não bastar, a órbita diminui e, por último, a câmera recua;
- imagens ganham zoom real (≥ 1,15×) sem passar do que a fonte aguenta;
- uma camada que tapa o alvo é atravessada: a câmera para entre ela e o alvo;
- na abertura funda e no travelling, nenhuma camada pode cortar a lente nem cobrir mais de 40% do quadro;
- o zoom de cobertura do fundo fica até 1,25×;
- o protagonista nunca some do quadro.

**Primeira versão, corrigida no AE.** As folhas de contato do AE mostraram três falhas da primeira versão do planejador:
- a abertura com o artista enchendo o quadro;
- o travelling mostrando só fundo, por causa do zoom de cobertura de 1,4–2,3×;
- o título cortado pela órbita.

As três regras acima nasceram dessas folhas. Elas são geradas por `scripts/verify-camera-choreography.jsx`.

**Segunda rodada no AE (20/10).** As folhas mostraram mais quatro falhas:
- o close no título e na data cortava o texto dos lados. Centralizar uma camada perto da borda pedia zoom de cobertura de 13–22% por cima do enquadramento;
- um logo pequeno no canto, com órbita, ficava 3,5× maior;
- o Mergulho terminava com meio protagonista num fundo vazio;
- no começo do Mergulho, o protagonista encolhia, porque a lente abria em escala log mais rápido do que a câmera se aproximava.

Vieram daí o enquadramento de operador, a regra do título largo, o passo "atravessar" e a lente das visitas em escala linear.

**Terceira rodada (25/10), a pedido do usuário.**
- **Abertura em Z +2500**, o hábito do motion designer: a câmera vai até o fundo e volta. Se uma camada ficaria colada na lente, a câmera passa dela e avisa.
- **Foco planejado:** no alvo de cada visita, com o rack começando junto com o movimento; fora das visitas, no que mais pesa na tela (o fundo na abertura, cada camada que aparece no recuo).
  - Racks de 0,3 s.
  - No AE, o foco lê a camada viva por um Layer Control.
- **Câmera contínua:** impacto pequeno na chegada, avanço lento durante cada camada e movimentos mais curtos.
- **Correções:** intensidade acima de 100%, ótica devolvida ao remover, cena lida no meio da coreografia e travelling dentro das camadas.

Detalhes no ADR 0007, itens 16–19.

## 11 Controles e painel

**Aba Parallax** no topo, ao lado de Suavização, com dois segmentos:
- **Parallax:** o editor do Parallax, agora com os modos de profundidade e o fundo atrás do plano focal.
- **Câmera:**
  - chips de intenção;
  - cards de receita com prévia de três planos desenhada pelo mesmo núcleo, que anima ao passar o mouse ou focar;
  - Intensidade, Duração, Início (tempo atual ou da comp), Direção e Semente;
  - a lista de shots da comp, com **Ajuste fino** (intensidade, início, duração, X/Y/Z %, pan/tilt/roll, curva);
  - Aplicar shot, Atualizar, Bake da câmera e Remover câmera (dois cliques).

No After Effects, os mesmos controles ficam no null de controle (`Moti.on Câmera · …`) e cada shot é um marcador arrastável.

| Inovação da v1 | Estado |
|---|---|
| Construção por intenção | Feito: chips e cards por intenção. |
| Tour de Foco (fase 3 da v1) | Feito como as coreografias Tour pelas camadas e Sequência completa: reconhecimento automático das camadas e rack focus em cada uma. |
| Intensidade percebida | Feito para a normalização por campo visível. A medição projetada no sujeito fica para depois. |
| Variações com limites | Parcial: semente nos loops. Variações de direção e arco por semente, com travas, ficam para a fase 3. |
| Proteção de leitura | Pendente (fase 3). |

## 12 Dados, persistência e edição

**Receita** (dado declarativo, validado antes do host; ids não começam com `camera-`):

```json
{ "schemaVersion": 1, "id": "hero-push", "version": 1, "intent": "highlight", "milestone": 1,
  "durationSeconds": 4, "motionBlur": false,
  "shot": { "kind": "move", "dir": "to", "curve": "silk", "tr": [0, 0, 0.08], "rot": [0, 0, 0],
            "orb": [0, 0], "lens": 1, "dolly": 0, "imp": [0, 0.2, 0, 1.2, 4], "org": [6, 1847, 6, 0] } }
```

**Instância:** a linha `[Moti.on.camera.v1]` com JSON URI-encoded vai no comentário do null de controle e guarda:
- `rigId`, `mode`, `compId`, `controllerId` e `cameraId`;
- `frame`, o quadro de referência congelado;
- os nomes dos controles e as expressões originais de cada propriedade;
- as camadas criadas e os shots: id, receita e versão, início, duração, intensidade e forma;
- `pluginVersion`.

**Identidade:** por ids. Uma comp duplicada ou um rig copiado é detectado e recusado com instrução. Nomes nunca identificam.

**Atualizar** modifica o mesmo shot. Repetir não duplica controles nem rig.

**Undo e remoção:**
- um grupo por comando;
- uma falha no meio restaura expressões, marcadores, controles, comentário e camadas criadas;
- remover devolve as expressões originais só onde a expressão atual ainda é do motor.

**Bake:** keys por quadro em cada propriedade do motor e motor desligado. Câmera e controle ficam como camadas comuns.

## 13 Critérios de aprovação

Resultados no After Effects 26.5x89/Windows (`scripts/verify-camera-engine.jsx`, 14/14):

| Critério | Automatizado (Node) | After Effects real |
|---|---|---|
| Intensidade zero e antes do shot = enquadramento de referência | ✔ núcleo e harness | ✔ 0 px, com e sem Parallax |
| Projeção do Parallax = layout 2D | ✔ núcleo | ✔ 0 px |
| Orientation + Rotate Z = eixos do núcleo | ✔ núcleo (matriz medida) e harness | ✔ paridade de projeção 0 px com pan, tilt e roll juntos |
| Determinismo (qualquer ordem de avaliação) | ✔ núcleo | — |
| Loop fecha posição e velocidade | ✔ núcleo | — |
| Impacto C1, pulso volta a zero | ✔ núcleo | — |
| Dolly zoom ≤ 1% | ✔ núcleo | — |
| Foco axial, alvo fora do eixo e atrás da câmera | ✔ núcleo e harness | ✔ 0 px com o alvo no título |
| Marcador arrastado muda o shot | ✔ harness | ✔ `marker.key(i).parameters` lido dentro da expressão |
| Cobertura do fundo com pan, tilt e roll | ✔ núcleo (com e sem fundo atrás do plano focal) | ✔ pior caso 0,2 px |
| Um grupo de Undo, rollback completo | ✔ harness | Undo em um passo: não executado (exige chamadas separadas) |
| Bake ≤ 0,5 px e ≤ 0,05° | ✔ harness (valores) | ✔ 0,0006 px e 0° |
| Salvar e reabrir | — | ✔ 0 px, sem erro de expressão |
| Motion blur renderiza | — | ✔ rastro visível no ataque do Punch In |
| Remover devolve o projeto | ✔ harness | ✔ câmera, depois Parallax, de volta ao 2D com 0 px |
| Host montado é ES3 | ✔ parse ES3 do arquivo que o AE carrega | ✔ o host instalado carrega e registra os comandos |
| Painel a 280, 360, 480 e 720 px sem rolagem horizontal | ✔ harness de navegador | painel dentro do AE: não executado |

Custo: as 8 expressões do rig levam 9,9 ms por quadro no AE 26.5.

## 14 Próximos passos

1. Conferir a aba Parallax dentro do AE, o Undo em um passo e o macOS. O Marco 1 já passou no AE 26.5/Windows.
2. **Fase 2:**
   - rack focus A/B e Rack Reveal;
   - comando de perfil de motion blur;
   - nulls de alvo de foco;
   - bake com subquadros.
3. **Fase 3, pacote de flyer:**
   - receitas: Slam Zoom, Unveil Drop, Orbit Breath, Tilt Reveal, Fly-through, Impact Shake, Pendulum Roll;
   - proteção de leitura, construção por intenção guiada e variações por semente com travas;
   - coreografias que seguem uma camada movida depois de aplicadas (hoje os alvos são lidos ao aplicar: mover uma camada pede reaplicar).
4. ADR 0004: identidade v4 dos membros do Parallax, reparo e `set-focus`.

## 15 Fontes e limites

As fontes Adobe da v1 continuam valendo para o funcionamento do host [A1–A9]. Além delas:
- **Medição do Moti.on:** `docs/research/after-effects-3d-transform.md` (ordem da matriz de transform, AE 26.3, erro de 1e-13).
- **Estudo do Brazu:** `docs/research/2026-10-18-brazu-parallax-rea.md`, clean-room. As expressões do Brazu são ofuscadas, e o comportamento foi inferido sem desofuscar conteúdo protegido.

Os valores artísticos (amplitudes, durações, curvas) são pontos de partida a aprovar visualmente nas cenas de flyer. O suporte anunciado deve corresponder ao build testado.
