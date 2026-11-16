# ADR 0006 — Elementos procedurais e sons gerados pelo Moti.on

- **Status:** aceita; implementada em 15/10/2026
- **Data:** 2026-10-15
- **Escopo:** `ae.elements.insert` (§13 do `MASTER_BUILD_SPEC.md`), `packages/contracts/src/elements.ts`, `scripts/generate-sfx.mjs`

## Situação

O estudo do Animation Composer 4 e do BadFX (`docs/research/2026-10-12-ac4-badfx-rea.md`) mostrou uma categoria que o Moti.on não tinha: elementos prontos (formas animadas, tarjas e títulos) que entram como pré-composição, com texto e cores editáveis e um som opcional.

Nos dois produtos esses itens são arquivos próprios: pré-comps em `.mhcitem` criptografados no AC, e MOGRTs e `.aep` no BadFX. O limite clean-room (§0.8/§34) proíbe abrir, decriptar ou copiar esses arquivos, as prévias e os nomes. Também não havia licença para sons de terceiros.

A sondagem `scripts/probe-elements-capabilities.jsx` no AE 26.5 (Windows) confirmou o que o host oferece:
- `Property.addToMotionGraphicsTemplateAs` para texto e cor;
- o grupo `ADBE Layer Overrides` na camada pai, com substituições graváveis;
- os match names de Trim Paths, Repetidor e traço;
- a importação de um WAV como footage com áudio.

## Decisão

1. **Receitas em dados, desenhadas por código.** Cada elemento é uma receita do Moti.on em `MOTION_ELEMENTS`: camadas de shape (elipse, retângulo, caminho, estrela, com Trim Paths, Repetidor, traço ou preenchimento) e de texto, com trilhas de animação por canal. O host monta a pré-comp a partir dessa receita; nenhum arquivo de projeto é distribuído.
2. **Edição pelas Propriedades essenciais.** Textos e cores viram controladores da pré-comp. Na camada pai aparecem como substituições, então cópias da mesma camada aceitam textos diferentes. As cores ficam em Controles de cor numa nula guia ("Moti.on Cores") que formas e textos leem por expressão.
3. **Tempo por expressão, não por keyframe.** Cada propriedade animada recebe uma expressão com `elementTrack(time, thisComp.duration, animação, trechos)`. A mesma função, ES3, é serializada no host e usada pela prévia SVG do painel. Mudar a duração da pré-comp leva a Saída para o novo fim sem mover keys.
4. **Caixas que seguem o texto.** Retângulos com `fit` medem o texto com `sourceRectAtTime`; o ponto de ancoragem do texto fica no centro visual (ou no meio da borda esquerda), então o layout não depende da métrica da fonte.
5. **Sons sintetizados no build.** `scripts/generate-sfx.mjs` gera seis WAVs (passagem, impacto, estalo, subida, clique, sino) com ruído de semente fixa, senoides e filtros simples, em PCM 16 bits mono 48 kHz. Os arquivos não ficam no repositório: saem do build em `assets/sounds/`. O host importa cada um uma vez por projeto, na pasta "Moti.on Elementos/Sons", e coloca a camada de áudio dentro da pré-comp.
6. **Fonte.** Textos usam Arial (`Arial-BoldMT`/`ArialMT`), presente no Windows e no macOS. Onde `app.fonts` existe e a fonte falta, o texto fica com a fonte padrão e o comando devolve um aviso; não há substituição silenciosa.

## Consequências

- O catálogo cresce adicionando receitas, sem binários novos. Cada receita é testada por geometria: começa e termina invisível, aparece no repouso.
- A pré-comp é editável como qualquer outra; o Moti.on não tenta gerenciar uma pré-comp alterada à mão (sem "ajustar" nesta versão).
- A largura do texto na prévia do painel é estimada; no After Effects ela vem da fonte real.
- Sons gerados são simples. Uma biblioteca maior, de terceiros, exigiria outra decisão de licença.
- Verificado no AE 26.5x89/Windows: `sourceRectAtTime` dentro da pré-comp acompanha o texto substituído na camada pai, então a mesma pré-comp serve a cópias com nomes de tamanhos diferentes.
