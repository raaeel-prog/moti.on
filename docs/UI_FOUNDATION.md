# Fundação Visual — CrossHost Workstation

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
  --ch-bg-base: #1D1D1D;
  --ch-bg-panel: #202020;
  --ch-bg-raised: #242424;
  --ch-bg-hover: #292929;
  --ch-bg-active: #2D2D2D;

  --ch-border-subtle: #333333;
  --ch-border-strong: #454545;

  --ch-text-primary: #E6E6E6;
  --ch-text-secondary: #A8A8A8;
  --ch-text-muted: #747474;

  --ch-accent: #35C978;
  --ch-accent-hover: #45D889;
  --ch-focus: #6F9DFF;
  --ch-danger: #D96B70;
  --ch-warning: #D0A24A;

  --ch-space-1: 4px;
  --ch-space-2: 8px;
  --ch-space-3: 12px;
  --ch-space-4: 16px;

  --ch-control-h: 29px;
  --ch-radius-sm: 3px;
  --ch-radius-md: 5px;
}
```

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
| 280–359 px | uma coluna, navegação por ícones, avançado fechado |
| 360–559 px | uma coluna padrão, labels completas |
| 560+ px | divisão opcional apenas quando reduz navegação |

Nunca use scroll horizontal. Em altura reduzida, apenas a região de conteúdo rola; a ação principal permanece acessível.

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
