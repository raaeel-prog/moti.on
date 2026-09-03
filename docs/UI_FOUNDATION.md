# Fundação Visual — CrossHost Workstation

> **Atualização normativa (2026-09-02):** `docs/ADDENDUM_A_QUICK_UX_SPEC.md`
> substitui os detalhes de interação, acessibilidade, cor e movimento das
> seções §22.3/§22.4 do MASTER. A fonte executável dos tokens agora é
> `packages/ui-tokens/src/tokens.css`; `packages/ui-core/src/theme.css` mantém
> uma cópia autocontida, verificada por teste de drift, para CEP e UXP. O
> catálogo executável de A6.2 vive em `packages/ui-motion/`.

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
  /* A superfície-base Adobe permanece uma regra do projeto. */
  --bg-host: #1D1D1D;

  /* Superfícies e accent normativos do Addendum A. */
  --bg-0: #0E1013;
  --bg-1: #141619;
  --bg-2: #1A1D21;
  --bg-3: #22262B;
  --bg-4: #2A2F35;
  --accent: #7C8CFF;
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
- Base tipográfica entre 12 e 13 px.
- Padding padrão de 10–12 px.
- Radius discreto de 3–5 px.
- Separadores e twirl-downs substituem cards.
- No máximo duas colunas em painel largo.

## Estados responsivos

| Largura | Estrutura |
|---:|---|
| 280–339 px | Compact: barra inferior, grid de 2 colunas, Inspector em tela cheia |
| 340–479 px | Default: rail de 48 px, grid de 3 colunas, Inspector sobreposto |
| 480–719 px | Comfort: grid de 4 colunas, Inspector de 320 px |
| 720+ px | Wide: grid e Inspector fixo de 360 px em duas colunas |

Nunca use scroll horizontal. Em altura reduzida, apenas a região de conteúdo rola; a ação principal permanece acessível.

## Movimento

Componentes declaram o movimento por ID em `data-motion`; não reescrevem
duração, easing ou keyframes localmente. Os 25 IDs normativos, o controller da
preferência efetiva (`interno OR sistema`) e a folha distribuída aos dois hosts
vivem em `packages/ui-motion/`. O toggle fica em **Settings → Interface**.

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
- três ou mais cores de destaque;
- motion decorativo em loop;
- ícone sem tooltip para ação incomum;
- texto abaixo de 11 px;
- botão destrutivo apenas por ícone;
- thumbnail fora de telas de assets/presets.

## Referência interna

- `design-references/target-minimal-parallax.png`: direção exploratória inicial, ainda sujeita a simplificação por largura e por objetivo da tela.

As screenshots de produtos de terceiros não fazem parte do pacote. Não reproduzir marcas, ícones, thumbnails, wording ou composição pixel a pixel.
