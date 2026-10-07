# Correção do Parallax — análise do vídeo de 13/09/2026

## O que o vídeo mostra

- 00:01–00:50: os dois atalhos antigos recusam as precomps do PSD. A mensagem exige imagens estáticas. O bloqueio era do Moti.on, antes da criação do rig.
- 01:09–01:24: um clique no Brazu cria uma câmera vinculada a um null.
- 01:25–01:48: o Position do null move a câmera; planos separados em Z mantêm o enquadramento inicial e apresentam deslocamento relativo durante o movimento.
- 01:49–02:08: a compensação é feita por expressão na escala das camadas.
- 02:09–02:34: pedido de uma única ferramenta Parallax, com esse mesmo fluxo.

## Implementação

Uma única entrada Parallax cria câmera e null 3D. A câmera fica vinculada ao null; o usuário pode selecionar o null, pressionar P e mover/animar Position. As opções de profundidade e movimento permanecem dentro da mesma ferramenta. Repetir o clique simples reutiliza o rig, preservando os ajustes manuais de Z.

O filtro por arquivo estático foi removido: precomps, PSD, PNG, vídeo, texto, formas e sólidos são aceitos como planos visuais. Animação dentro de uma precomp continua funcionando. A conversão inicial ainda pressupõe camadas 2D sem parent e transformações externas estáticas; câmeras preexistentes, track mattes, transformações recolhidas e composições incompatíveis precisam ser resolvidos antes. Isso não representa suporte irrestrito a toda configuração possível de timeline.

A expressão enviada equivale matematicamente a `value * (1 + Z / zoom)`. O Moti.on implementa sua própria expressão legível, com a distância de referência congelada na criação. A escala X/Y acompanha Z; outra expressão compensa Position X/Y em torno do centro da composição, incluindo elementos fora do centro. Mover a câmera pelo null não recalcula essa referência e, portanto, preserva o efeito de profundidade. O Z efetivo é limitado a -90% da distância de referência para evitar inversão do plano.

## Verificação

After Effects 26.5x89: sete verificações passaram com PNG, PSD e duas precomps com conteúdo animado. Foram medidos cantos e âncoras antes/depois, com rotação, escala não uniforme e espelhamento. Erro máximo: 0,0000362 pixel. Movimento lateral de 100 pelo null: primeiro plano deslocou 133,33 pixels e fundo 100 pixels. Alteração manual de Z manteve enquadramento. Reaplicação, ajuste de profundidade, remoção/restauração e proteção de animação existente também passaram.

Evidência: `artifacts/native/parallax-v3-results.json`. O teste cria uma composição própria; não modifica a arte original do usuário. Persistência após fechar/reabrir o After Effects não foi validada nesta rodada.

## Entrega

Instalado em 13/09/2026 às 12:36, com backup da versão anterior em `artifacts/install-backups/ae-20260913-123645/previous`. Verificação completa: 1.185 testes passaram. Painel aberto no After Effects e clique no Parallax confirmado pela mensagem de reutilização do rig, sem duplicar câmera/null. O código desta entrega está na pasta `implementation`. Os ajustes de espaçamento anteriores foram preservados.

## Transcrição automática

Transcrição local do áudio, com tempos em segundos. Nomes e algumas palavras foram reconhecidos incorretamente pelo transcritor (por exemplo, “brazo” se refere a Brazu e “perto” provavelmente a “aperto”). O trecho 23–34 s sobre bloqueio/seleção tem palavras incertas; a análise acima usa também os quadros do vídeo.

[1.0–9.3] Então, Chati, aqui é o plugin, o parallax lá, ele não está funcionando, ainda no PSD.
[9.3–14.2] Antes que você fez lá no shape, ele não está funcionando no PSD, o parallax completo, né?
[14.2–23.5] Eu venho aqui em criar rig, perto, ele dá aquele erro ali, ele não consegue criar o movimento suave, o erro.
[23.5–29.9] Era para ele aceitar, criar aqui com esses objetos selecionados, deu um control A, bloqueio e tudo ali,
[29.9–33.6] para não ter ordem, o control A ele seleciona tudo de vez, né?
[33.6–38.9] E aí ele não funciona, nem o parallax completo e nem esse outro parallax aqui, ó.
[38.9–47.5] Ele fala que não foi possível aplicar, porque tem que selecionar imagens e estáticas ou algo do tipo, entendeu?
[47.5–50.0] Não estava funcionando ainda perfeitamente.
[50.0–56.3] Aí se a gente venha aqui no do brazo, olha como que funciona o do brazo aqui, ó.
[56.3–58.3] Deixa eu fazer o login aqui, tá?
[59.5–63.5] Vou só fazer login rapidinho, pronto.
[63.5–68.7] Fezemos o login, deixa eu fechar aqui, pronto.
[68.7–73.3] O parallax, ele funciona assim, tá tudo selecionado lá, né?
[73.3–75.3] Eu só vou apertar aqui em paralax, ó.
[75.3–84.4] Pronto, você viu que ele já criou a câmera aqui e o nulo com o controle de câmera alinhada ao nulo, tá vendo?
[84.9–89.5] Aí, aqui eu pego P nesse position aqui do nulo.
[89.5–95.1] Você pode ver que se eu aproximar, ó, ele já fez o efeito paralax para a gente, entendeu?
[95.1–97.1] É isso o efeito aqui, ó.
[97.1–105.1] E você for ver as camadas aqui, as camadas elas estão todas afastadas uma da outra, tá vendo?
[105.1–108.3] E mantendo toda a escala original.
[108.3–115.5] É como se ele setasse em cada coisa que foi selecionado pré-compia aqui para fazer o paralax.
[115.5–117.5] Uma escala, tá vendo?
[119.5–121.5] Como é que fala? Uma expressão na escala.
[121.5–123.5] É essa expressão aqui, ó.
[123.5–126.5] Vou até mandar junto aí para você dar uma analisada, beleza?
[126.5–128.5] É isso que faz o paralax funcionar.
[128.5–130.5] E um detalhe importante.
[130.5–132.5] No meu lado tem dois paralax, né?
[132.5–134.5] Um completo e um...
[134.5–136.5] Você só clica lá.
[137.5–143.5] Vamos deixar apenas um, tá? Focar apenas um que funciona desse jeito igual do braço aqui, ó.
[143.5–145.5] Perto e paralax.
[145.5–151.5] Ele vai criar todos esses dois negócios aqui, o controle de câmera e o nulo.
[151.5–153.5] E aí funciona perfeitamente.
