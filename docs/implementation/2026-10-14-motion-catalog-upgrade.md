# Catálogo de motion: auditoria, melhorias e presets novos — 14/10/2026

Quarta leva do estudo do Animation Composer 4 e do BadFX (`docs/research/2026-10-12-ac4-badfx-rea.md`). Esta leva reaplicou as técnicas novas do motor aos presets antigos e acrescentou estruturas de movimento que os chips, as direções e as curvas não alcançam. Nada de terceiros foi copiado.

## Auditoria (dados da prévia)

As medições usaram a mesma `librarySample` da galeria, nas opções padrão de cada receita a 30 fps, sobre as 237 receitas.

- **Composição do catálogo.** 113 receitas de texto e 61 transições de camada; o resto são loops, looks e câmera.
- **Velocidade.** 19 transições passavam de 40 px/frame (a 1080 px) ou de 8°/frame, e nenhuma ligava motion blur.
- **Quique fixo.** Quatro presets usavam o quique fixo de Penner, sem controle ao vivo: Expansão com impacto, Virada com impacto, Deslizamento glitch e Órbita agressiva.
- **Quase-duplicata.** Havia uma: a Panorâmica cinematográfica subia 150 px na vertical, com distância de 0,023 até a Chegada em arco. Uma panorâmica deveria deslizar na horizontal.
- **Bug do host.** Em modo contínuo, a compensação do pivô (centro da transição e borda) usava uma onda de fase diferente da que gira a camada. Nenhum preset caía nesse caso, mas um pêndulo em loop cairia.

## Melhorias nos presets existentes

| Preset | Antes | Agora |
|---|---|---|
| Expansão com impacto, Virada com impacto, Deslizamento glitch, Órbita agressiva | Quique fixo de Penner | Quique (`settle-hop`) ajustado à curva antiga: 48% de altura, 3 quiques e 78% de perda, com erro médio de 0,036. Ganha Altura, Quiques e Perda ao vivo. A saída passa a ser uma antecipação única |
| Panorâmica cinematográfica | Subia 150 px, curva Suave, 24 frames | Desliza 240 px na horizontal com leve aproximação (106% → 100%), curva Cauda longa, 40 frames |
| 24 transições rápidas | Motion blur desligado | Motion blur ligado por padrão (`MOTION_BLUR_BY_DEFAULT`); o usuário pode desmarcar. A lista é a medida: um teste a mantém igual ao conjunto que passa de 40 px ou 8° por frame |

Camadas que já têm esses presets mantêm as expressões até o próximo Ajustar ou Restaurar, como sempre.

## Presets novos (coleção Impulso, agora 20)

| Preset | Tipo | Técnica |
|---|---|---|
| Dobradiça / Hinge Swing | Transição 2D | Gira 75° pela borda escolhida em Direção (padrão: esquerda), com Ricochete e fade |
| Pêndulo contínuo / Swinging Loop | Loop | Balança ±14° em torno do Centro da transição acima da camada, como uma placa pendurada; Velocidade 60% |
| Batida / Heartbeat | Loop | Nova onda `heartbeat`: batida forte, batida mais fraca e descanso a cada segundo, nos dois eixos juntos e sem emenda |
| Giro de moeda / Coin Spin | Loop 3D | Gira em Y a 180°/s numa camada 3D, pela Velocidade |

## Correção no host

`layerAnimation` ganhou `rotationWeight(axis)`, a única fonte do peso de cada eixo de rotação. As compensações de pivô (centro da transição e borda, em 2D e 3D) giram exatamente pelo mesmo ângulo da rotação, também em modo contínuo. Com a correção revertida, o teste do pêndulo em loop falha.

## Testes

- **Novo** `apps/after-effects-cep/tests/motion-catalog-quality.test.mjs`, que transforma a auditoria em regras:
  - motion blur igual ao conjunto medido;
  - nenhuma quase-duplicata (distância menor que 0,04) com o mesmo efeito;
  - quiques antigos fiéis à curva anterior;
  - panorâmica horizontal.
- `preset-momentum.test.mjs` (+4): borda parada na dobradiça nas quatro direções, centro parado no pêndulo em loop, batida igual e periódica nos dois eixos, giro de moeda em °/s.
- `motion-library-math.test.mjs` (+1): onda `heartbeat`.
- Contagens atualizadas de propósito: catálogo 241, galeria 252, Impulso 20 (11 em 2D, 5 em 3D, 4 em efeitos), transições da prévia 164.

## Evidência

| Item | Status |
|---|---|
| Testes focados (qualidade, Impulso, matemática, galeria) | PASS |
| `npm run check` | PASS — 2.440/2.440. O teste de gestos `native-gesture.test.mjs` foi corrigido: exigia no máximo 2 atualizações num laço que no Windows dura cerca de 310 ms, por causa dos timers de ~15,6 ms. Agora mede o contrato real, no máximo uma atualização a cada 100 ms do arraste, e passou 5 de 5 vezes isolado |
| After Effects real 26.5x89/Windows, `scripts/verify-catalog-upgrade.jsx` | PASS — 7/7. A borda da Dobradiça (quatro direções) e o centro do Pêndulo contínuo ficaram parados (erro de 1,1e-13). O Pêndulo contínuo balança ±14°. A Batida chega a 112,7% nos dois eixos, repete a cada segundo e descansa em 100%. O Giro de moeda gira a 180°/s e a 90°/s com Velocidade 50%. Os quatro quiques antigos têm controles ao vivo 48/3/78, e mudar a Altura muda o quadro (opacidade 76,8 → 95,2). A Panorâmica vai de 720 a 960 px em X sem mexer em Y. Uma transição rápida liga o motion blur e uma lenta não mexe nos switches. A primeira rodada acusou 6/7: o script concatenava numa string o array devolvido pelo AE. Ele passou a copiar os números, e a segunda rodada deu 7/7 |
| Painel instalado, macOS | NOT RUN |
