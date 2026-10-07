# Impacto e tremor — entrega e validação

## Resultado

Dez transições de corte novas, todas com tremor e efeitos complementares, em **Presets → Transições → Impacto e tremor** (também em Premium › Câmera e na busca por "tremor", "impacto" ou "shake"). Total: 35 transições de corte, 197 receitas na biblioteca e 214 itens na galeria.

Seguem o padrão das transições de corte existentes: pré-comp de ajuste curta acima da footage, marcador **CUT** no pico, sem tocar nas camadas do usuário. No painel se ajustam **Duração** e **Intensidade**; os demais controles ficam como Sliders no Effect Controls. Reaplicar no mesmo CUT ajusta a instância; Converter em keyframes e Remover funcionam como nas outras.

## Receitas

| Preset | Estilo do tremor | Complementos | Frames |
|---|---|---|---:|
| Punch de impacto | golpe vertical seco, mola curta | punch 12 %, motion blur 180° | 18 |
| Impacto de luz | golpe vertical | flash 1,35 EV + glow, punch 8 %, desfoque 4 px | 20 |
| Onda de choque | golpe horizontal | onda 24 px que ecoa após o corte, punch 6 %, luz 0,4 EV | 24 |
| Zoom com tremor | tremor crescente | zoom in → out 24 %, desfoque 10 px, motion blur 200° | 24 |
| Tremor sísmico | textura orgânica forte, crescendo | zoom 6 %, punch 5 %, desfoque 2 px | 30 |
| Câmera na mão | balanço orgânico 2,2 Hz | giro 1,8°, punch 3 % | 30 |
| Chicote lateral | solavanco lateral de 70 px | motion blur 240°, punch 6 % | 16 |
| Torção de impacto | giro de 5° | punch 6 %, desfoque 3 px, motion blur 200° | 20 |
| Batida dupla | pré-batida + golpe no CUT | punch 9 %, flash 0,6 EV + glow | 24 |
| Impacto cinematográfico | golpe + textura | punch 10 %, zoom 12 %, flash 1,1 EV, glow, onda 10 px, desfoque 6 px | 26 |

Valores em pixels são nominais para 1080 px de altura e escalam com a composição.

## Como o movimento é construído

Uma única função, `cameraImpactSample` (`packages/contracts/src/motion-library-math.ts`), é serializada nas expressões do AE e desenhada na prévia da galeria — o mesmo padrão de `libraryChoreography`.

- **Pico no CUT:** o golpe sobe acelerando até o corte, atinge o máximo exatamente no frame do CUT e assenta como mola amortecida. A posição é contínua; a inversão de velocidade no corte é o impacto, suavizada pelo motion blur real do Transform.
- **Textura orgânica:** três senoides incomensuráveis com semente por instância (controle **Variação**), para transições vizinhas não tremerem igual. Harmônicos acima de metade do Nyquist do fps são atenuados, sem estroboscopia a 24 fps; a frequência da mola fica limitada a 60 % do Nyquist.
- **Sem bordas pretas:** a escala inclui uma cobertura suave calculada pelos limites do movimento (não pelo valor que treme), mais três raios de desfoque. Essa cobertura já funciona como punch; o punch só soma onde a supera, evitando ampliar a imagem além do necessário.
- **Bordas idênticas ao original:** todo termo é multiplicado pelo envelope, e o obturador abre junto com ele. O primeiro e o último frame da janela são idênticos ao bypass.

Ordem dos efeitos: Wave Warp (bordas fixas) → Gaussian → Transform (obturador próprio) → Exposure → Glow. Só entram os efeitos que a receita usa. Controles: Duração, Intensidade, Tremor, Direção, Giro, Frequência, Amortecimento, Textura, Variação, Punch, Zoom, Desfoque de movimento e, quando aplicável, Desfoque, Luz, Brilho e Onda.

## Validação

| Camada | Resultado |
|---|---|
| Testes do repositório | 2.139/2.144. As 5 falhas são as mesmas da linha de base, anteriores a esta entrega (Pulse gradient e text-style-swap, arquivo em edição externa). Novos testes: matemática do impacto (identidade nas bordas, pico no CUT em 24/25/29,97/30/50/60 fps e 5 sementes, continuidade, cobertura em 16:9/9:16/1:1/4:3 a 100 % e 300 %, Nyquist), catálogo, host com paridade expressão ↔ função, prévia e galeria. |
| Lint / ES3 / tipos | ESLint dos arquivos alterados PASS; subconjunto ExtendScript PASS (82 arquivos). `npm run lint` e `tsc -b` acusam apenas `text-style-swap.jsx`, fora desta entrega. |
| Build / validate / contraste / skills | PASS. |
| AE 26.5x89, macOS 27.2.0 | **33/33 PASS**: aplicar sem seleção no CTI, janela e CUT exatos, expressões sem erro em todos os frames, 16 e 32 bpc, ajuste pelo comando, mover a pré-comp move o CUT, um Undo remove overlay/pré-comp/sólido, camada selecionada intacta, salvar/reabrir com 11 overlays avaliados. |
| Renders AE | 141 PNGs: bordas 100 % opacas na intensidade padrão; primeiro frame idêntico ao bypass nos 10 presets; atividade visível no CUT. Folha de contato: `artifacts/impact-shake-20261006/contact-sheet.png`. |
| Instalação local | PASS: backup em `artifacts/install-backups/ae-20261006-213256/previous`; 43/43 arquivos idênticos ao build por SHA-256 (`artifacts/impact-shake-20261006/install-verification.json`); só `client/main.js` e `host/index.jsx` mudaram. Host instalado aplicou os 10 presets no AE sem erro de expressão (`installed-smoke.json`). |
| Painel (Chromium, shell de produção, transporte CEP simulado) | PASS em 280/360/480/720 px sem overflow; filtro lista os 10; Criar transição envia apenas `presetId`, `durationFrames` e `intensity`. |

## Limites

- Resíduo de 1/255 de alfa em 5 pixels da borda no Zoom com tremor a 160 % de intensidade (detalhes em `docs/research/after-effects-impact-shake-effects.md`).
- Prévia da galeria: transformações exatas; luz, onda e desfoque são ilustrativos (o cartão informa).
- Não executado: cliques no painel CEP instalado dentro do AE, outras versões do AE, Windows/Intel. Premiere não se aplica (transições de corte são só AE).
