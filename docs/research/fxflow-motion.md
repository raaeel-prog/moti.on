# Motion Flow — correção e adaptação do FxFlow

Data: 2026-09-13. Host verificado: After Effects 2026, 26.5x89, macOS.

## Resultado

A ferramenta Suavização abre o editor ao clicar, inclusive no modo rápido. O usuário pode arrastar as alças, as hastes e a curva, ajustar X/Y numericamente, escolher entre 28 curvas, ver o movimento, salvar curvas pessoais e usar favoritos. Aplicar com sucesso volta para Ferramentas; erro ou ausência de alterações mantém o editor aberto.

O modo Criar animação cria os pares de keyframes no tempo atual com duração em quadros, para opacidade, escala, posição e rotação. A posição usa deslocamentos em relação à posição atual; Z é preservado e eixos separados são suportados. Intervalos com keyframes existentes, camadas bloqueadas e expressões ativas são recusados antes de escrever.

## Origem e decisões

Referência do próprio usuário: `/Users/rael/Documents/FX STUDIO/src/tools/fxflow` e `jsx/after-effects/fxflow.jsx`. Vídeo de referência: `/Users/rael/Desktop/Correção Keyframes flow.mov`. A análise considerou a fala e os quadros do vídeo: abrir o gráfico rapidamente, conseguir arrastar e fechar o editor após aplicar.

As curvas, a ideia de prévias e a criação rápida foram adaptadas à interface DOM/TypeScript, aos tokens, à localização e à ponte de comandos do Motion. Nenhuma dependência de runtime nova. O comando `ae.keys.ease.apply` continua compatível com os seis argumentos existentes; `build` é opcional e validado no host. O modo de criação não apaga a animação que já existe no intervalo.

## Falhas corrigidas

- Arraste CEP: alguns eventos de ponteiro não eram entregues. Fallback temporário de mouse, captura e limpeza no fim do gesto resolvem o caso reproduzido no AE. O editor usa coordenadas locais do SVG, incluindo escala e margens.
- Curvas com ultrapassagem: o enquadramento mantém ambas as alças visíveis e aceita Y de -1 a 2.
- Captura de opacidade, escala e rotação: `keyRoving` é consultado somente em propriedades espaciais, conforme o comportamento medido no AE instalado.
- Ease temporal pode promover interpolação LINEAR a BEZIER no AE. Aplicação e restauração reaplicam os tipos de entrada/saída corretos após escrever o ease.
- Linear usa interpolação LINEAR nativa. Seleções múltiplas alteram os segmentos entre keyframes selecionados consecutivos e preservam os lados externos.
- Falha parcial na criação restaura keyframes e valores estáticos das propriedades inicialmente sem animação.

## Evidência

| Verificação | Resultado |
| --- | --- |
| Build e TypeScript | PASS |
| Lint dos arquivos alterados e subconjunto ExtendScript | PASS |
| Validação estrutural, contraste e validação de skills | PASS |
| Testes focados em Ease, criação, tipos e editor | 37/37 PASS |
| Browser: larguras 280/360/480/720, sem overflow/erro | PASS |
| Browser: fallback mouse CEP, fim de captura, overshoot, salvar/recarregar/apagar, favoritos, animação | PASS |
| AE real: aplicação em quatro tipos, tempos/valores/seleção/CTI, linear, restauração, proteção de intervalo, criação e eixos separados | 29/29 PASS |
| Painel CEP real: arrastar alça e haste | PASS, mudança visual e numérica observada |
| Painel CEP real: Aplicar e fechar editor | PASS, mensagem de 2 keyframes; leitura nativa confirmou influência 95,4 e alteração da interpolação |
| Desfazer com atalho no host | NOT RUN; usuário retomou a edição, sem interferir no histórico. Snapshot/restauração foi validado no host. |
| Check geral do repositório | FAIL: 3 erros de lint de MotionGroupedControls fora desta correção |
| Suíte completa | 1180/1202 PASS; 22 falhas em controles agrupados e expectativas de artefatos/globais |

O resultado valida esta correção do Flow no ambiente acima; não certifica os demais módulos nem outras versões/sistemas. A conversão espacial usa a distância entre pontos, como na implementação anterior; não foi comprovada equivalência visual em trajetórias espaciais curvas.

## Arquivos de evidência e entrega

- `artifacts/fxflow/host-smoke.jsx` e `host-results.json`: verificações reproduzíveis no host, em composição temporária removida ao final.
- `artifacts/fxflow/ui-host-applied.json`: leitura da aplicação pelo painel real.
- `artifacts/fxflow/ui-280.png`, `ui-360.png`, `ui-480.png`, `ui-720.png`: responsividade.
- `artifacts/fxflow/verification/`: logs do checkpoint.
- Instalado em `/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae` e painel recarregado.
- Backup da instalação anterior em `artifacts/install-backups/ae-20260913-194411/previous`.
