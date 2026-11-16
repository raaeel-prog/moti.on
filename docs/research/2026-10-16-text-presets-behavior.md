# Comportamento dos presets de texto (AC4 + BadFX) → cobertura Moti.on

Data: 2026-10-16 · Escopo: somente pesquisa (alimenta a lista de lacunas do motor text-v3) · Status: `RESEARCH_ONLY` — nada aqui foi aplicado em host.

## 0. Regras de sala limpa

- Estudo **apenas do comportamento visível** nos vídeos de preview públicos que os próprios fornecedores instalam localmente. Nenhum `.mhcitem`, `aeft.json.enc` ou `.jsx.enc` foi aberto, decifrado ou copiado (MASTER_BUILD_SPEC §0.8/§34).
- Nenhuma expressão, nome de preset, preview ou quadro de terceiros entra no produto. Os nomes de categoria dos fornecedores aparecem neste documento **apenas como referência de pesquisa**, para rastrear de onde veio cada medida. As propostas de receita (§5) têm nomes, valores e combinações nossos.
- Quadros extraídos ficaram só no scratchpad da sessão (fora do repositório) e não estão embutidos aqui.

## 1. Método

**Fontes (somente leitura):**

| Fonte | Arquivos | Formato | Texto de amostra |
|---|---|---|---|
| Animation Composer 4.2.6 (produto 3300) | 81 previews `.mhpreview.webm` dos 81 itens de texto de `preset-study/animation-composer/catalog.tsv` (caminho por `previewPath` em `catalog-items.json`) | 320×180, 29,97 fps, ~2,3–4,5 s, IN + hold + OUT | 1 linha de 11 glifos; 3–7 palavras; 3–4 linhas |
| BadFX Essential Presets AE | 48 `.mp4` em `Previews/Text` (Letters/Words/Lines × Fade/Position/Rotate/Scale × 01–04) | 480×270, 24 fps, 3–10,5 s, IN + hold + OUT | 8 glifos; 5 palavras; 3 linhas |

**Medição automática** (ffmpeg 8.1 → quadros em cinza → script Python próprio, sem bibliotecas externas):

1. Máscara de tinta por limiar sobre o fundo; por quadro: área, peso, bounding box, centróide e energia de gradiente horizontal.
2. **Hold** = maior sequência de quadros quase idênticos com ≥60 % da tinta máxima. **IN** = do primeiro quadro com tinta até o início do hold; **OUT** = do fim do hold até o último quadro com tinta.
3. **Ordem/stagger**: o bbox do hold é dividido em 10 faixas horizontais (e 4 verticais para linhas). Mede-se o quadro em que cada faixa atinge 50 % da tinta final. A sequência de chegadas classifica a ordem (início, fim, aleatória, simultânea) e o espalhamento total (`spread`) dá o stagger ≈ `spread / (N−1)` para N unidades.
4. **Forma da curva**: altura/largura do bbox e centróide relativos ao hold. *Overshoot* = maior excursão além do valor final, em % do deslocamento inicial; *cruzamentos* = quantas vezes a métrica atravessa o valor final (tolerância 1,5 %). Como as unidades são escalonadas, esses valores são **agregados e funcionam como limite inferior** do overshoot por unidade.
5. **Desfoque**: razão de nitidez (gradiente/peso) mínima no IN, relativa ao hold. Valores <0,3 indicam rastro forte (motion blur ou blur por unidade). Os previews do AC4 renderizam com motion blur de camada (achado C07 do ledger), então a nitidez baixa em movimentos rápidos não prova blur próprio do preset.

**Revisão visual**: folhas de contato (10 quadros do IN + 4 do OUT por preset) dos 129 vídeos, inspecionadas uma a uma para trajetória (arco, queda, giro), 3D (glifos espelhados, perspectiva), decode, máscara, tracking e flicker.

**Limitações**: a resolução do preview é baixa; o tempo de 1 quadro é 33 ms (AC4) / 42 ms (BadFX). As durações dependem da quantidade de unidades e da duração do preview, não do default que o usuário recebe ao aplicar. Os loops (Effects) não têm hold, então só têm medidas qualitativas.

## 2. Achados transversais

1. **Duração do IN.** AC4: 0,5–1,7 s, com moda em ~1,2 s; a "versão curta" de cada família fica em 0,53–0,83 s. BadFX: 0,5–3,3 s, com moda em ~1,1 s.
2. **Separately × Together (vocabulário AC4)** não muda a ordem; muda a **sobreposição**. *Separately*: cada glifo resolve em ~150 ms, stagger ~70 ms, com ~2 glifos em transição ao mesmo tempo. *Together*: cada glifo leva ~400 ms, stagger ~37 ms, com ~10 glifos em transição simultânea, formando uma rampa de luz suave. No Moti.on isso já cabe em `overlap` + `durationFrames`.
3. **Ordem de saída diverge entre os fornecedores.** AC4 espelha no tempo: quem entrou por último sai primeiro (594: entra da direita, sai pela esquerda). BadFX repete a ordem de entrada: quem entrou primeiro sai primeiro. → GAP-10.
4. **Overshoot medido** (agregado, limite inferior):
   - famílias "Overshoot" de caracteres do AC4: 9–10 % do percurso, 1 cruzamento (um único rebote);
   - "Position & Mask" de palavras: ~19 %, 2 cruzamentos;
   - escala com âncora no topo: até 33 % da altura;
   - BadFX Letters Scale 01/03: ~36 % da altura, 1 cruzamento;
   - BadFX Words Position 01 e Lines Position 02: 17–21 %, 2 cruzamentos;
   - BadFX Letters Position 01–03: **o tracking oscila** 11–18 %, com 2 cruzamentos → GAP-12.
5. **Percursos.** AC4 Words Y: ~2× a altura do texto. AC4 Lines "Single" Y: 4,6–4,9× a altura, ou seja, sai do quadro → GAP-07. Caracteres: 1,1–1,6× a altura.
6. **3D.** Nos 81 previews do AC4 **não há** glifo espelhado, perspectiva nem paralaxe em Z. Tudo é compatível com transformações 2D (Z-rotation, escala, posição). No BadFX há 3D real: Letters Rotate 02/04 (virada em Y com o verso visível), Lines Rotate 01/04 (dobradiça em X), Words Position 04 e Rotate 04 (voo a partir da câmera, com desfoque).
7. **Desfoque.** Nitidez mínima de 0,05–0,19 em todos os deslizes horizontais (AC4 Words X, Lines X, Single X; BadFX Lines Scale 04). É desfoque direcional forte e combina com `blur` + `blurAxis: "x"`.
8. **Trajetória em arco.** AC4 Characters P&R&S Y 1 e Words P&R 3/6: as unidades descrevem um arco de raio grande, como numa roda com pivô muito abaixo ou acima do texto. Não é deslocamento linear com rotação → GAP-01.
9. **Âncoras de escala.** O AC4 oferece a mesma escala com âncora Bottom/Center/Top. Com âncora no topo, o overshoot aparente triplica (11 % → 33 %) → GAP-03.
10. **Loops "Square"** (AC4 Effects): o wiggle é **em degraus**, segurando valores por alguns quadros, como em posterize-time. Uma das variantes dispersa todos os glifos periodicamente e os remonta → GAP-08 e GAP-09.

## 3. Medições por família

Legenda: `in`/`out` em ms; `spread` = tempo entre a primeira e a última unidade atingirem 50 %; `stg` = stagger estimado por unidade; `OS` = overshoot agregado, com cruzamentos entre parênteses; `nit` = nitidez mínima.

### 3.1 AC4 — Caracteres (N = 11, 29,97 fps)

| Ref. (categoria AC4) | IDs | in | out | Ordem | spread / stg | Forma / extras |
|---|---|---|---|---|---|---|
| Fade · Ease · Separately 3 (From End/Start) | 594, 597 | 834–868 | 734 | fim / início | 700 / ~70 | per-unit ~150 ms; sem movimento; saída espelhada |
| Fade · Ease · Together 3 (End/Start) | 603, 606 | 734–801 | 634 | fim / início | 367 / ~37 | per-unit ~400 ms; rampa suave |
| P&R&S · Ease · Y 1 (Bottom/Top) | 725, 752 | 534 | 567 | início | 300 / ~30 | **arco** a partir de baixo/cima; escala de ~0; giro tangente; blur |
| P&R&S · Ease · Randomly 2 (8 direções) | 722–762 | 1268–1468 | 1101–1335 | aleatória | 370–900 | percurso 1,3–1,6 H; giro ±; escala de pequeno; **inclui diagonais** |
| P&R&S · Overshoot 1 (Bottom/Top) | 4221, 4225 | 1235 | 1168 | início | 400–434 / ~42 | percurso ~1,2 H; OS 9–10 % (1); giro leve |
| P&S · Overshoot 1 (Bottom/Top) | 4250, 4254 | 1201–1235 | 1134 | início | 467 / ~47 | igual ao anterior sem giro; OS ~10 % (1) |
| P&S · Wiggly 4 | 801 | 1201 | 1401 | quase simultânea | ~300 | linha desce ~1,9 H; tracking largo → normal; linha de base ondulada; OS 7 % (1) |
| Scale · Ease 2 (End/Start) | 805, 810 | 1201–1268 | 1401 | fim / início | 600–700 / ~65 | escala uniforme **ancorada na base**; sem OS |
| Scale · Ease 4 (End/Start) | 807, 812 | 1201–1235 | 1134–1401 | fim / início | 600–700 | **só escala X** (glifos como fatias) |
| Scale · Ease · Randomly 1/2/3 | 814–816 | 1168–1268 | 1101–1368 | aleatória | ~400 | variantes de âncora (base/centro/variável) |
| Scale · Overshoot 1 (Bottom/Center/Top) | 4273, 4278, 4283 | 1134–1201 | 968–1034 | início | 467 / ~47 | OS 11 % / 17 % / 33 % (1) conforme a âncora |
| Scale & Tracking · Ease 3 | 839 | 1301 | 1301 | **simultânea** | ~0 | largura inicial 1,44× (tracking aberto); glifos de ~0 → 100 % |
| Scale & Tracking · Overshoot 1 (B/C/T) | 4297–4299 | 1168–1201 | 1101–1168 | início | ~450 | tracking fecha com OS ~7 % (1); blur |

### 3.2 AC4 — Palavras

| Ref. | IDs | in | out | Ordem | Forma / extras |
|---|---|---|---|---|---|
| Decode & P&S · Flickering 3 / 6 | 1111, 1114 | 501–801 | 601–901 | início (por linha) | glifos aleatórios + escala de pequeno + cintilação; o 6 nasce de "pontos" |
| Position · Ease · Together Y (Bottom/Top, ± From End) | 1235, 1236, 1241, 1242 | 667–701 | 534–567 | início ou fim | percurso ~2 H; sem OS; easing suave |
| Position · Ease · Together X (Left/Right, ± From End) | 1237–1240 | 701–734 | 534–601 | início ou fim | percurso ~0,9 W; **nit 0,12–0,19** |
| Position & Mask · Overshoot Y (Bottom/Top) | 5007, 5131 | 1235 | 868 | quase simultânea por linha | sobe por trás de uma máscara na linha de base; **OS ~19 % (2)** |
| P&R · Ease 3 / 6 (Bottom/Top) | 1254–1269 | 1168–1268 | 1034–1101 | fim / aleatória | **arco** de raio grande; nit 0,32–0,61 |
| P&R&S · Wiggly 7 | 1306 | 1201 | 1468 | aleatória | dispersão com giro → reunião; assentamento ondulado |
| P&S · Flickering Randomly 6 | 1338 | 801 | 801 | aleatória | escala + tracking + cintilação; 3 cruzamentos em altura |
| P&S · Wiggly Randomly 5 / 9 | 1344, 1347 | 801 | 601–634 | aleatória | escala de pequeno com tracking aberto; glifos saltitam |
| Scale · Ease 1 / 2 (Start/End) | 1358, 1354 | 1435 | 1034 | início / fim | escala de pequeno + tracking aberto → normal |
| Scale · Wiggly Randomly 2 | 1374 | 1401 | 1134 | aleatória | escala com glifos oscilando em Y; OS 7,5 % (2) |

### 3.3 AC4 — Linhas

| Ref. | IDs | in | out | Ordem | Forma / extras |
|---|---|---|---|---|---|
| Decode & Fade · Decode 2 (End/Start) | 853, 855 | 968–1001 | 734 | fim / início (por linha) | linha em glifos aleatórios **esmaecidos** → resolve; na saída volta a lixo |
| Fade · Wiggly Randomly 2 | 877 | 534 | 534 | aleatória | entrada com cintilação de opacidade |
| Fade & Position · Ease · Together X 2 (L/R) | 892, 903 | 701–767 | 601–701 | início | desliza + fade; **nit 0,15** |
| Fade & Position · Ease · Together Y 2 (Bottom) | 881 | 767 | 667 | simultânea | sobe + fade; OS ~15 % (2) |
| Position · Ease · Single X / Y (4 lados) | 3389–3392 | 634–901 | 567–734 | **bloco único** | todo o texto como uma unidade; Y percorre 4,6–4,9 H (sai do quadro); X com nit 0,19–0,23 |
| Position · Ease · Together X 1 / Y 1 | 962, 974, 950, 982 | 734–1301 | 501–1001 | início | X com nit 0,05–0,10; Y sobe por linha |
| P&S · Ease · Randomly 1 | 996 | 1435 | 1101 | aleatória | escala de pequeno por linha |
| Scale & Tracking · Ease 5 (Start) | 1020 | **1702** | 1635 | início | o mais lento do catálogo; tracking muito aberto → normal |
| Scale & Tracking · Wiggly Randomly 2 | 1042 | 1101 | 1268 | aleatória | tracking aberto, com tremor |

### 3.4 AC4 — Effects (loops, sem IN/OUT)

| Ref. | ID | Comportamento observado |
|---|---|---|
| Decode Continuously 3 | 329 | glifos trocam por aleatórios em rajadas periódicas e voltam |
| Flickering Decode & Scale & Tracking 3 | 335 | decode + tamanho dos glifos e espaçamento pulsando, com aparência de cintilação |
| Wiggly Fade 1 | 346 | opacidade aleatória por glifo |
| Skew Jiggling | 4391 | inclinação sutil (poucos %) e independente por glifo |
| Turbulent Jiggling | 4883 | tremor sutil de escala e posição por glifo |
| Wiggly P&R · Square 2 | 371 | posição e rotação em **degraus** (valores seguros por alguns quadros) |
| Wiggly P&R&S · Square 1 | 384 | **dispersão periódica**: glifos explodem com giro e blur e se remontam a cada ciclo |
| Wiggly & Cosine P&R&Tracking · Square 2 | 410 | onda cossenoidal que percorre os glifos (Y + rotação) + respiro de tracking, em degraus |

### 3.5 BadFX (24 fps; 8 glifos / 5 palavras / 3 linhas)

| Ref. | in | out | Ordem | Forma / extras |
|---|---|---|---|---|
| Letters Fade 01 | 500 | 375 | aleatória | glifos aleatórios + fade, que resolvem quase juntos |
| Letters Fade 02 | 1125 | 1125 | início, stg ~125 | cursor: cada glifo percorre letras próximas até travar (rolagem) |
| Letters Fade 03 | 2833 | 2750 | início, stg ~285 | rampa de fade muito longa e suave |
| Letters Fade 04 | 1458 | 1208 | início, stg ~95 | fade por glifo com blur leve |
| Letters Position 01 / 02 / 03 | 1083–1792 | 667–1250 | aleatória / início / início | deslize horizontal com **tracking que oscila** (OS 11–18 %, 2) |
| Letters Position 04 | 917 | 958 | início, stg ~60 | glifo cai de cima; na saída cai para baixo |
| Letters Rotate 01 | 1625 | 750 | **fim** | inclinação 2D + fade |
| Letters Rotate 02 | — | — | início | **3D Y ~180°** com o glifo perto da câmera (enorme, espelhado) |
| Letters Rotate 03 | 917 | 708 | início | giro 2D sobreposto |
| Letters Rotate 04 | 1208 | 1333 | bordas → centro | **3D Y** (glifos espelhados) + tracking |
| Letters Scale 01 / 03 | 1125 | 625–875 | início | escala de pequeno, ancorada; **OS ~36 % (1)** |
| Letters Scale 02 | 833 | 875 | simultânea | só escala X |
| Letters Scale 04 | 875 | 583 | simultânea | começa a ~2,2× e reduz; 2 cruzamentos |
| Lines Fade 01 / 02 / 03 / 04 | 875–1000 | 750–1000 | início | fade escalonado / decode (03) / com blur (04) |
| Lines Position 01 / 02 / 03 / 04 | 1083 / 1208 / 1083 / 2708 | 625–1958 | início | queda / subida com OS 17 % (2) / lateral / subida lenta com OS |
| Lines Rotate 01 / 04 | 2042 / 1083 | 583 / 917 | início | **dobradiça 3D em X** (linha achatada → plana) |
| Lines Rotate 02 / 03 | 1417 / 2042 | 750 / 458 | início | inclinação 2D + deslize / compressão horizontal (Y-flip) |
| Lines Scale 01 / 02 / 03 | 1125–1208 | 583–875 | início | de grande→ / de pequeno→, com OS 15–32 % |
| Lines Scale 04 | 1125 | 875 | centro | escala + **blur forte** (nit 0,26) |
| Words Fade 01–04 | 917–3292 | 917–2708 | início/aleatória | fade simples / com blur longo / aleatório / decode por rolagem |
| Words Position 01 / 02 | 875 / 1083 | 917 / 667 | início | sobe / desce com **OS 21 % (2)** / 7 % (1) |
| Words Position 03 | 1125 | 625 | início | deslize lateral com espaçamento |
| Words Position 04 | — | — | início | **voo a partir da câmera** (Z) com blur |
| Words Rotate 01–04 | 1250–1958 | 667–1292 | aleatória | inclinação vindo de baixo / giro / giro com blur / 3D com escala |
| Words Scale 01–04 | 1000–1292 | 583–875 | início/centro | de pequeno / de grande / de enorme / escala não uniforme (larga e baixa) |

## 4. Matriz de cobertura

Células = unidade × propriedade × estilo de easing × ordem, consolidadas a partir das duas fontes. "Receita mais próxima" usa os 120 ids `text-v3-*` (`packages/contracts/src/motion-library-text.ts`, idêntico ao de `Moti.on-text-presets`) e as 113 receitas de texto legadas (studio/gemini/native/premium/signature e as sem coleção), num total de **233**, conferido por bundle do `MOTION_LIBRARY_PRESETS`.

Status: **OK** = cobre o comportamento (ajustes ficam nos controles existentes: `order`, `overlap`, `durationFrames`, `direction`); **PARCIAL** = cobre com diferença perceptível; **GAP** = sem equivalente (ver §5).

| # | Unidade | Propriedades | Easing | Ordem | Ref. de pesquisa | Receita Moti.on mais próxima | Status |
|---|---|---|---|---|---|---|---|
| 1 | caract. | fade curto | ease | início/fim | AC Fade Separately; BFX L-Fade 04 | `text-v3-characters-fade-cascade` (+`order: reverse`) | OK |
| 2 | caract. | fade em rampa longa | ease | início/fim | AC Fade Together; BFX L-Fade 03 | `text-v3-characters-fade-cascade` com `overlap` ≈ 90 | OK |
| 3 | caract. | fade + glifos aleatórios | ease | aleatória | BFX L-Fade 01 | `text-v3-characters-decode-resolve` | OK |
| 4 | caract. | decode por rolagem | ease | início | BFX L-Fade 02; BFX W-Fade 04 | `text-v3-characters-decode-roll`, `signature-slot-roll` | OK |
| 5 | caract. | posição + giro + escala em **arco** | ease | início | AC P&R&S Y 1 | `text-v3-characters-rotate-swing` (pivô curto, sem arco) | **GAP-01** |
| 6 | caract. | P+R+S dispersos, 8 direções | ease | aleatória | AC P&R&S Randomly 2 | `scattered-letters`, `text-v3-characters-rotate-scatter` | PARCIAL → **GAP-11** (diagonais; feito em 2026-10-18) |
| 7 | caract. | P+R+S com um rebote | overshoot 1× | início | AC Overshoot P&R&S 1 | `text-v3-characters-combination-lift-turn` | OK |
| 8 | caract. | P+S brotando com um rebote | overshoot 1× | início | AC Overshoot P&S 1; BFX L-Scale 01/03 | `bouncy-letters` (centro, sem subida) | **GAP-02** |
| 9 | caract. | P+S ondulado, tracking largo | wiggly | simultânea | AC P&S Wiggly 4 | `text-v3-characters-combination-wiggly-lift` | OK |
| 10 | caract. | escala uniforme ancorada (base/topo) | ease | início/fim/aleat. | AC Scale Ease 2; Randomly 1–3 | `text-v3-characters-scale-bloom` (centro, spring) | **GAP-03** |
| 11 | caract. | escala ancorada com rebote | overshoot 1× | início | AC Overshoot Scale 1 (B/C/T) | `bouncy-letters` (só centro) | PARCIAL → **GAP-03** (variante) |
| 12 | caract. | só escala X | ease | início/fim/simult. | AC Scale Ease 4; BFX L-Scale 02 | `text-v3-characters-scale-width` | OK |
| 13 | caract. | escala de grande → normal | ease | simultânea | BFX L-Scale 04 | `text-v3-characters-scale-near` | OK |
| 14 | caract. | escala de ~0 + tracking fechando, **juntos** | ease | simultânea | AC Scale & Tracking 3 | `signature-tracking-breath`, `premium-glyph-breath` (sem escala de 0) | **GAP-04** |
| 15 | caract. | escala + tracking com rebote | overshoot 1× | início | AC Overshoot Scale & Tracking 1 | `text-v3-characters-combination-lift-turn` (tem giro e subida) | PARCIAL → **GAP-04** (variante) |
| 16 | caract. | deslize + tracking **oscilando** | rebote 2× | início/aleat. | BFX L-Position 01–03 | `text-v3-characters-tracking-spread` (sem rebote) | **GAP-12** |
| 17 | caract. | queda de cima | ease | início | BFX L-Position 04 | `text-v3-characters-position-drop` | OK |
| 18 | caract. | inclinação 2D + fade | ease | fim | BFX L-Rotate 01 | `text-v3-characters-rotate-lean` (+`reverse`) | OK |
| 19 | caract. | giro 2D sobreposto | ease | início | BFX L-Rotate 03 | `text-v3-characters-rotate-turn` | OK |
| 20 | caract. | **virada 3D Y completa** (verso visível) | ease | início/bordas | BFX L-Rotate 02/04 | `text-v3-characters-rotate-yaw-3d` (86°, para no perfil) | **GAP-05** |
| 21 | palavras | posição Y longa | ease | início/fim | AC Position Together Y | `text-v3-words-position-rise`, `word-rise` | OK |
| 22 | palavras | posição X + rastro | ease | início/fim | AC Position Together X; BFX W-Position 03 | `text-v3-words-position-slide`, `word-slide` | OK |
| 23 | palavras | posição + máscara com rebote | rebote 2× | por linha | AC Position & Mask Overshoot Y | `word-curtain`, `text-v3-words-mask-rise-window` | OK |
| 24 | palavras | posição + giro em **arco** | ease | fim/aleat. | AC P&R 3/6 | `text-v3-words-rotate-swing` | **GAP-01** |
| 25 | palavras | decode + escala + cintilação | flicker | início | AC Decode & Scale Flickering 3/6 | `text-v3-words-combination-resolve-lift`, `word-scramble-burst` | OK |
| 26 | palavras | dispersão P+R+S → reunião | wiggly | aleatória | AC P&R&S Wiggly 7 | `text-v3-words-rotate-scatter`, `text-v3-words-rotate-tumble-3d` | OK |
| 27 | palavras | escala + tracking com **cintilação** | flicker | aleatória | AC P&S Flickering Randomly 6 | `text-v3-words-fade-spark` (sem escala) | **GAP-06** |
| 28 | palavras | escala de pequeno + tracking aberto | wiggly/ease | aleat./início/fim | AC P&S Wiggly 5/9; Scale Ease 1/2; Scale Wiggly 2 | `text-v3-words-combination-wiggly-lift`, `premium-word-sculpt` | PARCIAL → **GAP-04** |
| 29 | palavras | fade / fade com blur / aleatório | ease | início/aleat. | BFX W-Fade 01–03 | `text-v3-words-fade-cascade` / `-focus` / `-spark` | OK |
| 30 | palavras | sobe/desce com rebote | rebote 2× | início | BFX W-Position 01/02 | `text-v3-words-position-ricochet` | OK |
| 31 | palavras | voo a partir da câmera (Z) | ease | início | BFX W-Position 04, W-Rotate 04 | `text-v3-words-position-approach-3d`, `premium-word-zoom` | OK |
| 32 | palavras | inclinação/giro 2D | ease | aleatória | BFX W-Rotate 01–03 | `text-v3-words-rotate-lean` / `-scatter` / `-turn` | OK |
| 33 | palavras | escala de pequeno/grande/não uniforme | ease | início/centro | BFX W-Scale 01–04 | `text-v3-words-scale-bloom` / `-near`, `premium-word-punch` | OK |
| 34 | linhas | decode **esmaecido** sequencial | ease | início/fim | AC Decode 2; BFX Lines Fade 03 | `text-v3-lines-decode-resolve` (aleatória), `line-resolve` | PARCIAL → **GAP-13** |
| 35 | linhas | fade com cintilação | flicker | aleatória | AC Fade Wiggly Randomly 2 | `text-v3-lines-fade-spark` | OK |
| 36 | linhas | fade + deslize X com rastro | ease | início | AC Fade & Position X 2; AC Position X 1 | `text-v3-lines-position-slide`, `signature-horizon-split` | OK |
| 37 | linhas | fade + subida com rebote | rebote 2× | simult./início | AC Fade & Position Y 2; BFX Lines Pos. 02/04 | `text-v3-lines-position-ricochet` | OK |
| 38 | **bloco** | texto inteiro como uma unidade, saindo do quadro | ease | única | AC Position Single X/Y | `text-dissolve` (unidade "all", só escala) | **GAP-07** |
| 39 | linhas | queda / lateral | ease | início | BFX Lines Position 01/03 | `text-v3-lines-position-drop` / `-slide` | OK |
| 40 | linhas | escala de pequeno | ease | aleatória | AC P&S Randomly 1 | `text-v3-lines-scale-bloom` (+`order: random`) | OK |
| 41 | linhas | escala + tracking muito aberto | ease/wiggly | início/aleat. | AC Scale & Tracking 5; Wiggly S&T 2 | `text-v3-lines-tracking-spread` (sem escala) | PARCIAL → **GAP-04** |
| 42 | linhas | dobradiça 3D em X | ease | início | BFX Lines Rotate 01/04 | `text-v3-lines-rotate-pitch-3d` | OK |
| 43 | linhas | inclinação 2D / compressão Y | ease | início | BFX Lines Rotate 02/03 | `premium-line-swing`, `text-v3-lines-rotate-yaw-3d` | OK |
| 44 | linhas | escala de grande/pequeno com rebote; com blur | spring | início/centro | BFX Lines Scale 01–04 | `text-v3-lines-scale-near` / `-bloom` (+`easing: spring`) | OK |
| 45 | loop caract. | decode contínuo | — | — | AC Decode Continuously 3 | `text-v3-characters-loop-decode`, `living-code` | OK |
| 46 | loop caract. | decode + escala + tracking | — | — | AC Flickering Decode & S&T 3 | `text-v3-characters-loop-decode-spacing` | OK |
| 47 | loop caract. | opacidade aleatória | — | — | AC Wiggly Fade 1 | `text-v3-characters-loop-flicker` | OK |
| 48 | loop caract. | inclinação sutil por glifo | — | — | AC Skew Jiggling | `letter-wobble`, `text-v3-lines-loop-skew` | OK |
| 49 | loop caract. | tremor sutil por glifo | — | — | AC Turbulent Jiggling | `liquid-letters`, `text-v3-lines-loop-jiggle-scale` | PARCIAL → **GAP-08** |
| 50 | loop caract. | wiggle P+R **em degraus** | — | — | AC Wiggly P&R Square 2 | nenhum (todos os waveforms são contínuos) | **GAP-08** |
| 51 | loop caract. | **dispersão periódica** e remontagem | — | — | AC Wiggly P&R&S Square 1 | nenhum | **GAP-09** |
| 52 | loop caract. | onda cossenoidal P+R + tracking | — | — | AC Wiggly & Cosine P&R&T Square 2 | `text-v3-characters-loop-tilt` + `-drift`, `studio-text-ribbon-flow` | PARCIAL (sem gap; combinar) |
| 53 | todas | ordem de saída (espelhada × repetida) | — | — | §2 item 3 | renderer espelhava; `exitOrder` desde 2026-10-18 | **GAP-10** (feito) |

Resumo: 53 células, sendo **33 OK**, 8 PARCIAL e 12 GAP diretos. Ao todo são 13 itens de GAP: alguns cobrem várias células, e alguns são opções de motor.

## 5. Lista de GAPs (pronta para implementar)

Valores em pixels nominais a 1080 px de altura e em quadros a 30 fps, seguindo o padrão de `make()` em `motion-library-text.ts`. Os ids seguem `text-v3-{unit}-{family}-{variant}`. Easings usados: apenas os já existentes em `MOTION_LIBRARY_EASINGS`. **GAP-07, 08, 10 e 11 exigem mudança de contrato/motor**; os demais são só receitas.

1. **GAP-01 — "Arco de chegada" / "Arrival arc"** · `family: rotate`, `id: arc` · unidades: caracteres, palavras.
   Cada unidade gira em torno de um pivô distante abaixo da linha de base, o que desenha um arco largo em vez de uma reta.
   `rotation [0,0,-38]`, `scale [-55,-55,0]`, `text.pivot [0, 320, 0]`, `blur 4`, easing `velvet`, `order forward`. Caracteres: `durationFrames 26`, `staggerFrames 1`, `overlap 82`. Palavras: `34 / 4 / 75`.
   Variante "Arco descendente / Descending arc" (`id: arc-top`): `pivot [0,-320,0]`, `rotation [0,0,38]`.

2. **GAP-02 — "Broto com rebote" / "Sprouting rebound"** · `family: scale`, `id: sprout` · caracteres (e palavras).
   `position [0,60,0]`, `scale [-100,-100,0]`, `text.pivot [0,36,0]` (base do glifo), easing `settle-hop` (`settleAmount 14`, `settleCount 1`, `settleDamping 72`), `order forward`, `durationFrames 34`, `staggerFrames 2`, `overlap 70`.
   Alvo medido: um rebote de ~10–35 % e IN total de ~1,1–1,2 s em 11 glifos.

3. **GAP-03 — "Crescer da base" / "Grow from baseline"** e **"Crescer do topo" / "Grow from cap line"** · `family: scale`, `ids: grow-base`, `grow-top` · caracteres, palavras.
   `scale [-100,-100,0]`, `text.pivot [0, 36, 0]` (base) ou `[0,-36,0]` (topo), easing `velvet`, `order forward`, `durationFrames 30`, `overlap 65`.
   Variante com rebote (`id: grow-base-spring`): easing `spring`, `elasticity 40`.

4. **GAP-04 — "Convergência" / "Convergence"** · `family: tracking`, `id: converge` · caracteres, palavras, linhas.
   `scale [-100,-100,0]`, `text.tracking 120`, `blur 3`, easing `velvet`, `order forward`, `staggerFrames 0`, `overlap 100` (todas as unidades juntas), `durationFrames 38` (linhas 48).
   Variante "Convergência viva" / "Lively convergence" (`id: converge-spring`): easing `spring`, `elasticity 32`, `staggerFrames` padrão da unidade, `overlap 70`.

5. **GAP-05 — "Virada completa 3D" / "Full flip 3D"** · `family: rotate`, `id: flip-3d` · caracteres, palavras.
   `text.dimension "3d"`, `rotation [0,180,0]`, `position [0,0,-380]` (começa perto da câmera), `scale [40,40,40]`, `blur 3`, easing `silk`, `order forward`, `durationFrames 36`, `overlap 70`. O verso fica visível no começo, como na referência.
   Linhas: `rotation [180,0,0]` (`id: flip-x-3d`).

6. **GAP-06 — "Faísca em escala" / "Scaling spark"** · `family: combination`, `id: spark-scale` · palavras (e caracteres).
   `scale [-60,-60,0]`, `text.tracking 22`, `fade true`, easing `flicker`, `text.order random`, `seed 59`, `durationFrames 26`, `overlap 45`.

7. **GAP-07 — "Bloco único" / "Single block"** · `family: position`, `id: block` · nova unidade `all` em `text-v3` (hoje `UNITS` só tem characters/words/lines).
   `text.unit "all"`, `travel "offscreen"`, `position [0,1,0]` (só a direção; a distância vem do host), `text.blur 10` com `blurAxis` no eixo do movimento, easing `glide`, `staggerFrames 0`, `durationFrames 26`, direções 4 lados via `direction`.
   *Motor:* aceitar a unidade `all` em `make()` e ligar `travel: "offscreen"` ao text animator.

8. **GAP-08 — "Tremor em degraus" / "Stepped jitter"** · `family: loop`, `id: stepped-jitter` · caracteres.
   `position [5,5,0]`, `rotation [0,0,6]`, `waveform "stepped"`, `speed 50`, `seed 67`.
   Variante "Tremor fino" / "Fine tremor" (`id: fine-tremor`): `scale [3,3,0]`, `position [2,2,0]`.
   *Motor:* novo waveform `stepped`, um wiggle segurado em ~8 Hz (amostrar e manter); hoje só existem waveforms contínuos.

9. **GAP-09 — "Dispersão periódica" / "Periodic scatter"** · `family: loop`, `id: scatter-pulse` · caracteres.
   `position [160,120,0]`, `rotation [0,0,120]`, `scale [-60,-60,0]`, `text.random true`, `blur 6`, `waveform "heartbeat"` (pulso breve e longo repouso montado), `speed 22`, `intensity 70`, `seed 31`.
   Nenhuma mudança de motor, se o `heartbeat` aceitar amplitude por unidade com sementes aleatórias. Caso contrário, documentar.

10. **GAP-10 — Ordem de saída** · opção de motor/UI para `phase: "out" | "both"`: `exitOrder: "mirror" | "repeat"` (pt-BR "Saída: espelhada / na mesma ordem"; en-US "Exit: mirrored / same order").
    Default `mirror` (o último a entrar sai primeiro). **Antes, verificar** o que o renderer atual faz com `phase: both` e registrar o resultado.

11. **GAP-11 — Direções diagonais** · estender `MotionLibraryOptions.direction` com `top-left | top-right | bottom-left | bottom-right`, aplicadas às receitas dispersas (`scattered-letters`, `text-v3-*-rotate-scatter`, GAP-01).
    *Contrato:* atualizar `isMotionLibraryOptions` e o schema.

12. **GAP-12 — "Espaço com rebote" / "Rebounding spacing"** · `family: tracking`, `id: rebound` · caracteres, palavras.
    `text.tracking 60`, `position [-40,0,0]`, easing `settle-wave` (`settleAmount 18`, `settleCount 2`, `settleDamping 60`), `order forward`, `durationFrames 34`, `overlap 70`.
    Alvo medido: o tracking ultrapassa 11–18 % e cruza 2×.

13. **GAP-13 — "Varredura de código" / "Code scan"** · `family: decode`, `id: scan` · linhas.
    `text.reveal "resolve"`, `order forward`, `fill [0.55,0.55,0.55]` (unidade esmaecida enquanto decodifica e volta ao preenchimento original ao travar), easing `glide`, `durationFrames 30`, `staggerFrames 8`, `overlap 55`.
    Variante `scan-reverse` com `order reverse`.

**Ordem sugerida**: 1 → 4 → 2 → 3 → 12 → 13 → 6 → 5 → 9 (só receitas, cobertas pelo motor atual), depois 10 → 7 → 11 → 8 (contrato/motor). Cada receita nova precisa entrar em `MOTION_TEXT_COVERAGE`, nos testes de catálogo e na verificação em host (`IMPLEMENTED_NOT_HOST_VERIFIED` até a prova).

## 6. Pendências do `finding-ledger.json`

| Unknown do ledger | Resultado deste estudo |
|---|---|
| "All 81 installed variants not applied." | **Parcialmente resolvido**: os 81 previews foram observados e medidos (direções, âncoras, ordens e variantes numeradas diferem como descrito em §3). Aplicação nativa continua não feita (fora do escopo). |
| "Native 3D Composer behavior not established…" | **Resolvido pela evidência de preview**: nenhum dos 81 previews de texto do AC4 mostra 3D (sem glifo espelhado, perspectiva ou paralaxe Z), o que é coerente com o C08 (`threeDLayer=false`). 3D real só aparece no BadFX (§2 item 6). |
| "Native internal formulas not reconstructed." | Mantido **por desenho** (sala limpa); substituído por medidas de comportamento. |
| "Public catalog not exhaustively applied." | Não resolvível por preview local. |
| Aviso de recuperação de sessão; avaliação pareada de renderização | Fora do alcance dos vídeos. |

## 7. Reprodutibilidade

Os scripts de medição (`analyze.py`, `summ.py`, `sheets.py`) e os JSONs brutos (`ac.json`, `bfx.json`, `recipes.json`) ficaram no scratchpad da sessão, fora do repositório. Para refazer: listar `previewPath` dos itens com `Text Presets` em `catalog-items.json`, decodificar em cinza com `ffmpeg -vf scale=W:H,format=gray -f rawvideo` e aplicar o método do §1. Nenhum arquivo do fornecedor é modificado ou copiado.
