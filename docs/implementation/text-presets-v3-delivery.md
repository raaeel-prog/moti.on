# Primeira leva de texto do Moti.on

Implementação na branch `feat/text-presets-rea`, em `C:/dev/Moti.on-text-presets`. A base local de Momentum foi preservada no commit `c8151cf`; o patch do checkout compartilhado permaneceu idêntico ao snapshot inicial de 80.114 bytes. Não houve push nem publicação.

## Biblioteca entregue

São 108 receitas próprias: 96 transições e 12 efeitos contínuos. Vinte receitas usam 3D real por segmento. A galeria organiza Caracteres, Palavras, Linhas e Effects, com filtros de dimensão e família. Os IDs são estáveis e os valores, expressões, vídeos e posters foram produzidos para o Moti.on.

| Área | Receitas | Cobertura |
|---|---:|---|
| Núcleo 2D | 48 | Fade, Position, Rotate e Scale: quatro variantes por família, em caracteres, palavras e linhas |
| Transições 3D | 18 | Profundidade, aproximação, rotação X/Y/Z e escala com pivôs locais |
| Tracking, revelação, typewriter e decode | 24 | Duas variantes por família e unidade |
| Combinações | 6 | Posição + rotação e foco + espaçamento, nas três unidades |
| Effects | 12 | Movimento, rotação, escala, tracking, skew, blur, cor, flicker e decode; duas receitas 3D |

Cada camada admite IN, OUT e um `textEffect` independente. Os comandos de ajuste, reset e remoção do efeito não aceitam fase, duração de transição ou marcadores. Inspeção, cópia e variantes salvas permitem escolher o componente. A raiz v3 migra rigs antigos durante edição; componentes restantes preservam suas identidades e controles.

O preflight verifica agrupamento, propriedade das expressões e capacidade 3D antes de alterar a camada. A remoção final restaura o estado capturado; alterações parciais têm rollback. Source Text e estilos continuam editáveis. Conflitos com agrupamento e animadores existentes são recusados, com diagnóstico, quando não é possível preservar o rig.

## Estudo das referências

BadFX 1.0.4: foram localizados e aplicados no AE os 48 FFX de texto instalados, com observação dos animadores, seletores, propriedades, agrupamento e características das expressões. A inspeção detalhada registra também controles, keyframes e easing. A matriz gerada em `text-presets-v3-coverage.json` liga essas observações às famílias próprias. Os FFX e suas expressões não entram no produto.

A leitura real encontrou `threeDPerChar` ativo em 13 dos 48 presets e agrupamento nativo 1/2/3 para caracteres/palavras/linhas. Portanto, os nomes das quatro famílias não bastam para classificá-las como 2D. Fade 01, por exemplo, usa controles In/Out com keyframes -100 → 100: entrada de 0 a 0,6339518 s e saída de 1,368042 a 2,001994 s no FFX importado. Position e Rotate também combinam escala, skew, blur ou rotação, conforme variante. Esses resultados motivam cobertura por propriedade e acabamento, além do nome da família.

Animation Composer 4.2.6: a análise dirigida pelo REA completou a leitura de seis arquivos JavaScript, mas não resolveu a identificação semântica dos arquivos nativos opacos. A análise nativa ampla atingiu o timeout; não se tomou o diretório de produto `3300` como prova do pacote Text Presets.

No painel instalado, a seleção de Text Presets mostrou quatro itens: **Ease Fade Separately 3**, **Ease Fade Together 3**, **Ease Position & Rotate & Scale Y 1** e **Ease Position & Rotate & Scale Randomly 2**. Isso registra os itens visíveis nessa seleção, sem afirmar o inventário completo dos subdiretórios. O primeiro foi aplicado, em From Start / In, ao texto descartável: o AE expôs Range Selector, Opacity, controle Reversed Order e um marcador TR In em 0,80078125 s. Essa observação substitui inferências sobre a estrutura dessa família; as fórmulas internas e o inventário completo do pacote continuam sem confirmação.

O [catálogo público oficial](https://misterhorse.com/products/text-presets/42) organiza Characters, Words, Lines e Effects. Ele foi usado para mapear famílias de posição, rotação, escala, tracking, máscaras, typewriter, decode, combinações e efeitos contínuos. Catálogo público e conteúdo instalado têm evidências separadas. A implementação própria não declara equivalência matemática nem reprodução exata de todos os presets comerciais.

O uso dos Text Animators e do 3D por caractere segue a [documentação da Adobe](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html) e foi confirmado por probe no AE 26.5x89. Agrupamento, Anchor Point 3D, Position 3D, Scale 3D e Rotation X/Y/Z foram testados no host.

## Propriedades e acabamento

| Família | Implementação própria | Diferenças úteis |
|---|---|---|
| Fade | Opacity, seletor de expressão, blur opcional | Cascata, ordem inversa, centro e dispersão determinística |
| Position | Position 3D, Opacity, Blur | Subida, queda, lateral e chegada com oscilação amortecida |
| Rotate | Rotation Z e Anchor Point 3D | Pivô local, balanço, inversão e distribuição aleatória |
| Scale | Scale 3D, Opacity, Tracking opcional | Expansão, redução, abertura horizontal e vertical |
| 3D | Profundidade e Rotation X/Y/Z por segmento | Perspectiva do host, agrupamento e pivôs coerentes |
| Tracking | Text Tracking Amount | Espalhamento e compressão com timing independente |
| Revelação | Máscara nativa e movimento por segmento | Janela vertical ou lateral; não equivale a todas as máscaras do catálogo comercial |
| Typewriter | Opacity com degrau temporal por unidade | Direção normal e reversa |
| Decode | Character Offset e seleção temporal | Resolução e rolagem; texto fonte preservado |
| Combinações | Animadores complementares | Movimento + giro e blur + tracking |
| Effects | Função periódica contínua e controles próprios | Velocidade, intensidade, ordem, seed e overlap conforme receita; sem cues IN/OUT |

Timing e easing usam as funções existentes da biblioteca, compartilhadas com a simulação: progressão por unidade, stagger, overlap, compressão de janelas curtas, seed e easing escolhido. Efeitos contínuos usam tempo independente dos marcadores. O 3D da simulação é uma aproximação SVG; perspectiva, layout tipográfico, máscaras e blur finais são avaliados no render do Adobe.

## Previews

Cada variante exposta possui um MP4 original e um JPG: **108 vídeos + 108 posters**, mais o manifesto. Fixture: 480 × 270, 24 fps, quatro segundos, ArialMT 52 px, `Make it\rMoti.on`, Classic 3D, motion blur 180° e fundo Onyx. O manifesto guarda receita, parâmetros, fixture, versão do host e hash do motor de texto. Alterações nessas entradas invalidam o cache.

A simulação permite editar o texto e os parâmetros imediatamente. O modo Render AE identifica a configuração gravada e não finge refletir mudanças locais. Há reprodução, scrub, carregamento sob demanda, pausa fora da área visível e descarte de recursos. A revisão local `artifacts/text-presets/original-families-review.mp4` reúne doze exemplos renderizados.

As comparações locais do BadFX usam texto, fonte, enquadramento, cor, fps e duração equivalentes. Os controles importados permanecem nos defaults da referência, e os vídeos próprios usam defaults das receitas: diferenças de timing são registradas, sem uma falsa alegação de equivalência quadro a quadro. Esses renders de estudo ficam fora do pacote.

## Evidência de validação

| Verificação | Estado | Evidência local |
|---|---|---|
| Check completo integrado | PASS — 2.391/2.391 | `integration-check-delivery-2.log` |
| Contratos, migração, lifecycle, 3D e previews automatizados | PASS | Incluídos no check completo |
| Probe nativo AE 2026 | PASS | `ae-capabilities.json` |
| Aplicação e avaliação das 108 receitas em oito tempos | PASS | `fixture-report.json` |
| Render de todas as variantes | PASS — 108 | `render-summary.json` e manifesto dos assets |
| Lifecycle real: oito fixtures | PASS | `ae-lifecycle.json` |
| Undo real, uma ação Ctrl+Z | PASS | `ae-undo-verify.json` |
| UI PT/EN: 280, 360, 480 e 720 px | PASS — oito configurações | `ui-qa.json` e screenshots |
| BadFX: aplicação e observação de 48 FFX | PASS | `badfx-host-study.json` |
| Composer: um preset instalado aplicado e observado | PASS, cobertura limitada | `composer-host-study.json` e `composer-ui-catalog.txt` |
| Instalação do candidato e painel CEP no Adobe | NOT RUN | Nenhuma inferência a partir dos testes de browser ou do host script |
| Outros patches do AE, macOS e clean-machine | NOT RUN | Sem alegação de suporte validado nessa matriz |
| Assinatura e publicação | NOT RUN | Pacote local de desenvolvimento; distribuição final em HOLD |

As fixtures reais cobrem texto curto, multilinha, paragraph text, acentos e Unicode, estilos mistos, parenting, animações existentes de Source Text/Position e taxas de 23,976 a 60 fps. Elas exercitam IN + OUT + efeito, ajustes, substituição individual, remoção e falha parcial. A prova de Undo confirma remoção das duas transições 3D em uma ação, com restauração do texto, seleção, controles, marcadores e flags 3D.

O check inicial encontrou uma ambiguidade ES3 já existente no Momentum. Ela foi corrigida, junto da composição de uma expressão com pivô negativo. Uma rodada final detectou uma asserção de timers dependente de carga em um teste de gestos existente; a asserção agora mede o limite de 10 Hz pelo tempo real. A repetição e o check completo passaram.

A auditoria npm registra dez vulnerabilidades preexistentes (nove high e uma critical) no grafo associado ao Site separado; a contagem permaneceu igual à baseline. O pacote CEP não contém `node_modules` nem o Site. Não houve atualização indiscriminada de dependências. PostCSS foi declarado e fixado porque os testes já o utilizavam; o restante do lockfile foi preservado.

## Reprodução e rollback

```powershell
npm.cmd ci --ignore-scripts --no-audit --no-fund
npm.cmd run check
node scripts/text-presets-render.mjs --probe --prepare --render
node scripts/text-presets-lifecycle.mjs
node scripts/text-presets-badfx-study.mjs --comparisons
node scripts/text-presets-visual-review.mjs --badfx
```

Os scripts usam `MOTION_AE_DIRECTORY`, `MOTION_FFMPEG` e `MOTION_BADFX_TEMPLATES` para outras instalações. Browser QA usa `MOTION_PLAYWRIGHT_MODULE` e `MOTION_CHROME`, com o servidor de preview na porta 4178. A fixture de Undo requer uma instância própria, confirmação de projeto vazio, aplicação, uma ação real pela interface e leitura pelo modo verify; não automatiza Undo por API interna.

Os scripts de criação abortam diante de projeto existente. As operações da fixture de Undo só aceitam o caminho do projeto criado por elas. O pacote deve ser gerado depois do commit imutável, a partir de fonte limpa, pelo script de candidato local. Instalação de desenvolvimento, se executada posteriormente, deve guardar a extensão anterior para rollback. O checkout original não precisa ser sobrescrito para revisar ou instalar o candidato.
