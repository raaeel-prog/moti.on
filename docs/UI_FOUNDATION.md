# Fundação Visual — CrossHost Workstation

> **Atualização normativa (2026-09-02):** `docs/ADDENDUM_A_QUICK_UX_SPEC.md`
> substitui os detalhes de interação, acessibilidade, cor e movimento das
> seções §22.3/§22.4 do MASTER. A fonte executável dos tokens agora é
> `packages/ui-tokens/src/tokens.css`; `packages/ui-core/src/theme.css` mantém
> uma cópia autocontida, verificada por teste de drift, para CEP e UXP. O
> catálogo executável de A6.2 vive em `packages/ui-motion/`.

## Direção atual — 03/10/2026

Evoluir o estado visual do GM preservado em
`artifacts/onyx-components-20261003/source-before/`. Esta direção foi aprovada
pelo responsável e substitui as cores, geometria e navegação históricas do
MASTER, do Addendum e das skills quando houver divergência.

O tema Onyx usa base **#121212**, superfícies **#1A1A1A**, controles
**#212121**, hover **#2E2E2E** e áreas gráficas profundas **#101010**.
Ações principais continuam neutras. As famílias cromáticas aparecem nos
vetores: azul para keyframes, turquesa para camadas, âmbar para animação,
violeta para espacial, rosa para formas, coral para efeitos e azul acinzentado
para projeto. Sucesso, aviso e erro têm tokens próprios e informação textual.
Os dois temas mantêm contraste verificado para texto, controles e famílias.

`packages/ui-tokens/src/tokens.css` é a única origem dos valores visuais.
O build executa `sync-theme.mjs` para gerar os espelhos CSS/JSON em `shared/`
e o bloco de tokens de `packages/ui-core/src/theme.css`. Edite a origem,
nunca os espelhos; geometria e apresentação compartilhadas pertencem ao kit.
Controles têm 28 px, alvos mínimos de 24 px, espaços de 4/8/12/16/24 px,
raios de 2/4/6 px e fonte de sistema entre 11 e 14 px com números tabulares.

Os oito Web Components `moti-*` usam TypeScript e **Light DOM**, registro por
documento e factories públicas. Cada fallback nativo usa a mesma apresentação.
`moti-button` aceita ícone e modo compacto, preserva botão nativo, nome
acessível, estados e ativação única. Seus aliases normalizam as variantes
existentes; o helper legado do shell conserva seu contrato próprio.
Controladores e adapters continuam responsáveis pelos comandos Adobe.
Bézier e números arrastáveis mantêm seus comportamentos especializados.

A biblioteca permanece uma grade compacta de ícones: ordem, filtros,
favoritos, recentes, âncora e dock conservam sua lógica. Os nomes das
ferramentas aparecem em dicas externas legíveis, inclusive com teclado.
Suavização tem seis blocos retangulares em duas linhas de três, com diagramas
que diferenciam origem, resultado e direção. Aplicação com um clique e
impedimentos por seleção permanecem nos controles.

Configurações organiza Interface, Acessibilidade e Ajuda. Contexto, Sistema
e Diagnóstico ficam dentro de Ajuda no AE. Não restaurar o rodapé técnico ou
um status permanente de conexão. Requisitos, erros e progresso continuam
acessíveis perto da ação. O Premiere conserva suas rotas funcionais e estado
de indisponibilidade para ferramentas ainda não implementadas. Conta online
fica para uma etapa posterior, sem campos ou cartões fictícios nesta entrega.

O catálogo tipado de vetores em `packages/ui-core/src/icons.ts` descreve
identificador, família, segmentos, gesto e desenho estático. Movimento usa o
catálogo compartilhado: pressão 90 ms, transições 200–260 ms, gesto de ícone
até 360 ms, uma vez por entrada ou foco, sem deslocar o botão ou repetir em
loop. Respeitar movimento reduzido efetivo (`interno OR sistema`).

## Direção aprovada

O painel deve parecer uma ferramenta nativa e discreta dentro do After Effects/Premiere. A referência é a eficiência de painéis como BadFX, Brazu e Premiere Composer, sem copiar identidade, assets ou layout proprietário.

A interface **não** deve parecer:

- dashboard SaaS;
- landing page;
- central de analytics;
- painel gamer/neon;
- coleção de cards com todos os módulos ao mesmo tempo.

## Tokens base

```css
:root {
  /* Superfície-base aprovada para Moti.on. */
  --bg-host: #121212;

  /* Base Onyx; valores completos gerados a partir de ui-tokens. */
  --bg-0: #101010;
  --bg-1: #121212;
  --bg-2: #1A1A1A;
  --bg-3: #212121;
  --bg-4: #2E2E2E;
  --accent: #FFFFFF;
}
```

Não copie este recorte para componentes. Consuma os tokens do pacote. Os
valores AA corrigidos para texto terciário e danger estão documentados no
próprio CSS e são validados por `npm.cmd run a11y:contrast` nos temas escuro e
claro.

## Anatomia de uma tela de ferramenta

```text
[ navegação compacta ]
[ título da ferramenta ] [ preset ]
------------------------------------
[ seção principal aberta ]
  label      slider       valor
  label      dropdown
  opção      checkbox
[ avançado ▸ ]
------------------------------------
[ Reset ]          [ Apply ]
```

A tela deve priorizar uma ação principal. Preview, presets, layer stack e opções avançadas aparecem somente quando ajudam a função ativa.

## Densidade

- Controles com 28–30 px de altura.
- Ícones com 16–18 px.
- Hierarquia tipográfica entre 11 e 14 px; nomes nas dicas externas.
- Padding padrão de 10–12 px.
- Raios de 2, 4 e 6 px, conforme componente.
- Separadores e twirl-downs substituem cards.
- No máximo duas colunas em painel largo.

## Estados responsivos

| Largura | Estrutura |
|---:|---|
| 280–339 px | Compact: barra inferior, grid de 2 colunas, Inspector em tela cheia |
| 340–479 px | Default: rail de 48 px, grid de 3 colunas, Inspector sobreposto |
| 480–719 px | Comfort: grid de 4 colunas, Inspector de 320 px |
| 720+ px | Wide: grid e Inspector fixo de 360 px em duas colunas |

`resolveWidthClass` em `packages/ui-core/src/shell.ts` implementa exatamente
essas quatro fronteiras, e `packages/ui-core/tests/shell.test.mjs` as prende nos
dois lados de cada uma. Até 2026-09-04 o código tinha só três faixas, com todas
as fronteiras erradas (Compact até 359, uma faixa "standard" até 559, Wide a
partir de 560) e sem Comfort — na prática um painel em 340 px recebia o layout
compacto, e a partir de 560 px já entrava no layout mais largo.

**Atualizado em 2026-09-10:** a grade passou a 2/3/4 colunas nas faixas
Compact/Default/Comfort e Wide, com acesso aos nomes por dicas externas e ações de favorito e
ajuste separadas da aplicação. Tema claro/escuro e densidade são preferências
locais. A barra inferior, o dock completo e o Inspector do Addendum continuam
pendentes. A nova grade foi compilada, mas a matriz visual permanece `NOT RUN`
conforme o pedido do responsável para reduzir verificações durante esta etapa.

Nunca use scroll horizontal. Em altura reduzida, apenas a região de conteúdo rola; a ação principal permanece acessível.

## Kit de componentes

As primitivas normativas de CHMS-UX-003 vivem em
`packages/ui-core/src/components.ts`, com geometria/estados em
`packages/ui-core/src/components.css`: tile, botão, slider, chip, popover,
gaveta e toast. Consumidores ligam callbacks de comando; o package não conhece
host, filesystem, storage ou rede.

O layout compartilhado usa Flexbox. O Premiere UXP 25.6 documenta que CSS Grid
não está disponível e que `aria*`, `hidden`, tab order, `<label for>` e CSS
animation têm limitações. Por isso, o kit combina estado visível com ARIA para
CEP, `data-hidden`, foco explícito, marcadores que não dependem só de cor e
timeouts que garantem o fechamento sem `animationend`. A decisão e os links
oficiais estão em
`docs/research/premiere-uxp-component-dom-capabilities.md`.

Essas defesas são contratos automatizados, não prova visual de host. A matriz
real permanece em `docs/QA_MATRIX.md`.

## Movimento

Componentes declaram o movimento por ID em `data-motion`; não reescrevem
duração, easing ou keyframes localmente. Os IDs normativos, o controller da
preferência efetiva (`interno OR sistema`) e a folha distribuída aos dois hosts
vivem em `packages/ui-motion/`. O toggle fica em **Configurações → Acessibilidade**.

Build/teste automatizado não prova comportamento no runtime Adobe. Movimento,
persistência, escala, leitor de tela e orçamento de frames continuam sujeitos
aos gates reais registrados em `docs/QA_MATRIX.md`.

## Hierarquia

1. ferramenta ativa;
2. seleção/preset atual;
3. parâmetro principal;
4. parâmetros secundários;
5. opções avançadas;
6. ação Apply/Adjust/Bake/Remove.

Busca global, assets, captions e configurações não permanecem visíveis quando o usuário está ajustando Parallax ou keyframes.

## Proibições visuais

- gradiente decorativo;
- glow/neon permanente;
- glassmorphism;
- logo grande;
- header de marketing;
- cards aninhados;
- múltiplas cores de destaque em fundos e controles; famílias cromáticas ficam nos vetores;
- motion decorativo em loop;
- ícone sem tooltip para ação incomum;
- texto abaixo de 11 px;
- botão destrutivo apenas por ícone;
- thumbnail fora de telas de assets/presets.

## Referência interna

- `design-references/target-minimal-parallax.png`: direção exploratória inicial, ainda sujeita a simplificação por largura e por objetivo da tela.

As screenshots de produtos de terceiros não fazem parte do pacote. Não reproduzir marcas, ícones, thumbnails, wording ou composição pixel a pixel.
