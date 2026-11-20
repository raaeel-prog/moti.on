# Presets: organização, áudio, aba Editar e Effect Controls (2026-11-18)

Estado: `IMPLEMENTED_NOT_HOST_VERIFIED` — testes locais verdes, nada conferido no After Effects ainda.

## Pedido

Melhorar todos os presets da aba Presets (Motion e Tipografia) com movimentos únicos, sem repetição; árvore
sem pasta vazia, juntando presets de texto e de motion; barra de áudio nos sons; aba Editar com o mínimo de
informação; Effect Controls organizado, com nomes claros e funções parecidas juntas. Decisões do usuário nesta
rodada: **árvore por função** e **controles separados, porém ordenados e nomeados por grupo** (sem FFX).

## O que mudou

### Árvore por função (`preset-gallery.ts`)

Antes: 11 pastas no topo, metade delas coleções (Emulsion, Signature, Impulso, Revelações, Looks…) que
repetiam cards já presentes em Motion/Tipografia/Transições.

Agora, no topo: **Todos · Animações · Tipografia · Transições · Elementos · Sons · Minha biblioteca**.

| Pasta | Conteúdo |
| --- | --- |
| Animações | Entradas e saídas 2D, Entradas e saídas 3D, Efeitos e looks — cada uma com subpastas pelo que o preset faz (Movimento, Desfoque, Revelação, Cor, Profundidade, Looks…) |
| Tipografia | Caracteres, Palavras, Linhas (subpastas por família) e Efeitos de texto |
| Transições | Transições de corte (com Película, Zoom, Tremor, Luz…) e Movimentos de câmera |

- `pruneEmptyFolders`: pasta sem preset ativo não aparece; filho único se funde ao pai.
- `MIN_FAMILY_PRESETS = 3`: subpasta com 1–2 presets não existe; eles ficam na pasta-mãe.
- `legacyFolderId`: pasta salva da árvore antiga (ex. `signature-cinema`, `emulsion-burn`, `momentum-2d`)
  abre a pasta por função equivalente. Signature/Impulso/Premium/Emulsion seguem na busca (tags).
- A raiz Transições agora lista seus cards (antes ficava vazia ao ser clicada).

### Barra de áudio nos sons (`sound-waveform.ts`, `sound-library.ts`)

Pesquisa: o Composer usa um `waveform-player` (forma de onda + linha do tempo + controles); o padrão de
mercado (Freesound, peaks.js/audiowaveform da BBC) é **picos pré-calculados** desenhados em barras, com a
parte tocada colorida e um cursor. Como os sons do Moti.on são sintetizados no build, os picos saem da mesma
síntese — nada é decodificado no painel.

- `scripts/generate-sound-peaks.mjs` gera `client/src/generated/sound-peaks.ts` (48 barras + duração por som).
  Um teste falha se o arquivo ficar desatualizado em relação à síntese.
- Cada linha mostra a mini-onda e a duração ("0,62 s").
- O inspetor mostra a onda grande: Ouvir/Parar, cursor andando, clique ou setas/Home/End para mudar a posição.

### Aba Editar enxuta (`preset-phase-editor.ts`, `preset-workspace.ts`)

- Visível: Duração, Intensidade, Direção, Curva e (em texto) Intervalo; Restaurar e Remover.
- Em **Mais ajustes** (recolhido, lembra se ficou aberto): forma da curva, Animar por, Ordem, Saída,
  Sobreposição, Elasticidade, Ricochete, Variação, Motion blur, Deslocar, Mostrar na biblioteca, Copiar ajustes.
- Saíram: rótulo "Camada:", seção "Presets", selo "Ajustável".

### Effect Controls (`preset-library.jsx`, `preset-phases.jsx`)

Antes, cada controle aparecia como `Moti.on 1731900000000-5-1-1 · Duração (frames)` — o identificador interno
no nome — e na ordem em que foi criado.

Agora, presets aplicados a partir desta versão:

```
Moti.on In · Tempo · Duração (frames)
Moti.on In · Tempo · Intervalo do texto (frames)
Moti.on In · Tempo · Sobreposição (%)
Moti.on In · Movimento · Intensidade (%)
Moti.on In · Movimento · Elasticidade (%)
Moti.on In · Visual · Desfoque
Moti.on Out · Tempo · Duração (frames)
…
```

- Rótulos: `Moti.on In`, `Moti.on Out`, `Moti.on FX` (loops/looks) e `Moti.on` (aplicação simples), os mesmos dos marcadores.
- Grupos: **Tempo** (duração, intervalo, sobreposição, velocidade), **Movimento** (intensidade, elasticidade,
  ricochete, variação, distância, centro) e **Visual** (efeitos que renderizam).
- `orderControls` sobe os controles, em ordem Tempo → Movimento, para antes do primeiro efeito da instância.
  Efeitos que renderizam **não** se movem: a ordem de renderização, inclusive entre efeitos do usuário, fica igual.
- Presets aplicados antes desta versão mantêm os nomes antigos (sem rótulo nos metadados) e continuam válidos.

### Presets repetidos

`scripts/preset-uniqueness-audit.mjs` compara a impressão digital do movimento (eixos e sentidos, magnitude
em faixas, efeito, revelação de texto, família de curva, coreografia, cor) dentro de cada pasta. Achou 16 grupos;
17 presets mudavam só a ordem ou a curva — o que a aba Editar já troca — e foram aposentados em
`MOTION_LIBRARY_DUPLICATES_RETIRED` (saem da galeria; camadas que já usam seguem funcionando). Um teste impede
que novas repetições entrem.

## O que falta

1. **Conferir no After Effects** (instalar com `Atualizar Moti.on.cmd`): nomes e ordem no Effect Controls,
   aplicar/ajustar/remover In e Out, presets antigos ainda ajustáveis, barra de áudio tocando no painel.
2. **Refazer as receitas com olhar de motion designer.** A auditoria tira repetição exata; o pedido de
   "movimentos únicos e profissionais" pede revisar receita por receita (curvas, tempos, overshoot, desfoque
   direcional, escalonamento) e **renderizar as prévias de novo no AE** (`scripts/text-presets-render.mjs`).
   Tipografia tem 309 cards contra 115 de Animações — a mesma família repetida em Caracteres, Palavras e
   Linhas é o maior foco de repetição percebida. Sugestão: uma pasta por vez, começando por Tipografia › Caracteres.
3. Lacunas do Composer ainda abertas (GAP-MAP): Efeitos especiais 2D e overlays procedurais.

## Rodada 2 (2026-11-18, tarde)

### Correção: "A leitura falhou" na aba Editar

Causa: no editor de fases, dois `removeChild` ainda usavam o contêiner antigo (`body`) depois que os campos
passaram para "Mais ajustes" (`host`). O Chromium do AE lança `NotFoundError`; o DOM falso dos testes aceitava.

- Corrigido em `preset-phase-editor.ts`.
- `tests/cep-dom.mjs` agora lança `NotFoundError` como o Chromium — com o código antigo, 20 testes falham.
- A mensagem passa a dizer a causa ("A leitura falhou: …") e registra no console.
- `scripts/panel-preview.mjs` aceita `window.__motionInspect` para abrir a aba Editar com um preset aplicado.

### Curadoria de Tipografia › Caracteres (103 → 74)

Os 103 vinham de 7 coleções (legado, Gemini, Studio, Native, Premium, Signature, Texto) e repetiam conceitos.
Ficou o mais bem resolvido de cada ideia; os 29 que saíram estão em `MOTION_LIBRARY_DUPLICATES_RETIRED`:

| Conceito | Fica | Sai |
| --- | --- | --- |
| Subir com desfoque | Subida precisa, Cinética alternada, Subida em torção | Cascata delicada, Letras elásticas, Letras que se abrem, Chegada vibrante |
| Cair de cima | Cascata de glifos, Queda com quique | Queda macia |
| Inclinação 3D | Letras em seda, Dobradiça 3D | Giro aveludado |
| Foco / dissolver | Foco aveludado, Letras em expansão óptica, Digitação fluida | Texto em conjunto, Letras em sequência, Foco que floresce |
| Espalhar e reunir | Constelação de letras, Letras que se reorganizam | Letras dispersas, Dispersão que se reúne, Letras em encontro |
| Escala com quique | Expansão viva, Broto com rebote, Crescer da base, Salto Hiper-elástico | Letras saltitantes, Texto de Gelatina |
| Entreletra | Respiro de entreletra, Respiração tipográfica, Entreletra elástica, Convergência, Atração magnética, Espaço com rebote | Entreletras no ar, Espaços que se encontram, Compressão tipográfica |
| Itálico | Corte tipográfico | Inclinação fluida |
| Glitch / RGB | Chuva Digital, Glitch Neon, Letras cromáticas | Caracteres com glitch, Revelação Cyberpunk, Pulso Cromático |
| Decodificar | Decodificar e revelar, Rolagem de slot, Decodificação elegante, Sinal decodificado | Código que se resolve, Contagem de glifos |
| Escala e giro | Leque da base, Desdobrar da base, Impacto | Arco de chegada, Abertura vertical, Redução de perto |
| Janela e deslize | Janela ascendente, Deslize lateral | Janela com impulso, Deslize em bloco, Faísca em escala |

### Próximo: retoque das 74 que ficaram

Cada receita que mudar precisa de prévia renderizada de novo no AE (`node scripts/text-presets-render.mjs
--prepare --render --only=<ids>`; ele abre uma instância própria do AE, sem tocar no projeto aberto). Por isso o
retoque fica para uma rodada combinada com o usuário. Direções por receita: curvas com antecipação e
assentamento curtos, desfoque direcional na direção do movimento, ordem do centro para fora nas de escala,
origem na linha de base nas de rotação, e tempos por unidade (caractere 2 frames de intervalo, ataque ≤ 18 frames).

### Conferido no After Effects 26.5 (2026-11-18, via CDP 8091, composição "Moti.on teste 2026-11-18")

- Texto com Entrada "Cascata de luz" e Saída "Constelação de letras": Effect Controls em ordem
  `Moti.on In · Tempo …` → `Moti.on In · Movimento …` → `Moti.on Out · Tempo …` → `Moti.on Out · Movimento …`;
  marcadores `Moti.on In` / `Moti.on Out`. Ajustar a Intensidade da Entrada para 60 manteve nomes e ordem.
- Sólido com "mist-reveal": `Moti.on In · Visual · Desfoque` depois dos controles.
- Nenhum erro de expressão nas duas camadas, avaliando em 0,9 s e 3,6 s.
- Aba Editar abre com as duas fases (antes: "A leitura falhou").
- Sons: 35 linhas com onda; clicando "Passagem" o cursor andou de 1 a 40 das 48 barras e parou no fim.
  Corrigido no caminho: o laço parava no 1º quadro porque o `<audio>` ainda não sabia a duração.

Ainda não conferido: remover fases pelo painel com clique real, prévias dos cards e a pasta Tipografia › Caracteres
depois da curadoria (só contagem). Pendência menor: camadas que não são texto ainda recebem o controle
"Tempo · Intervalo do texto", que não faz nada nelas (é referenciado pelas expressões; tirar exige migrar o cabeçalho).

## Rodada 3: retoque de Tipografia › Caracteres (2026-11-18, noite)

Antes, cada receita de Texto era escrita uma vez e copiada igual para Caracteres, Palavras e Linhas.
Agora `CHARACTER_TUNING` (em `motion-library-text.ts`) ajusta 25 receitas só na unidade Caracteres, sem mudar IDs:

- **Rastro, não névoa:** o desfoque vai só no eixo da viagem (`blurAxis`), e gira junto quando o usuário troca a direção.
  Subida e Janela ascendente com rastro vertical; Deslize lateral, Largura, Convergência, Elástico lateral com rastro horizontal.
- **Linha de base:** Giro, Broto, Crescer da base, Leque, Subida em torção e Queda com quique giram ou crescem apoiados na base da letra.
- **Ataque e assentamento:** curvas `expo-out`/`quint-out` nas entradas secas (Subida, Foco, Janelas, Largura);
  mola mais viva no Florescer (elasticidade 45) e no Inclinar.
- **Ordem:** Foco e Impacto partem do centro para fora.

Um teste exige que cada receita retocada fique diferente da versão de Palavras (pegou um retoque que não mudava nada).
Prévias: só essas 25 (e suas direções) foram renderizadas de novo, com `--only`; a cópia anterior ficou no scratchpad da sessão.

**Render (rodada 3):** `node scripts/text-presets-render.mjs --prepare --render --shards=2 --only=<25 ids>` →
94 prévias (receitas + direções), 0 falhas; manifesto com 1042 entradas, nenhuma perdida, 92 atualizadas.
Conferido nos quadros: rastro vertical na Subida, horizontal no Deslize, letras crescendo pela base em Crescer da base.
Duas receitas ganharam lado e por isso direções: Cascata de luz (leve subida) e Giro (pivô na base).
Instalado no AE; a pasta Caracteres no painel ainda não foi aberta no AE depois do render — o AE foi reaberto
durante o render (às 19:14) e o painel Moti.on não estava aberto nele.
