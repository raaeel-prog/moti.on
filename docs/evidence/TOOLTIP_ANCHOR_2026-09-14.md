# Dicas da biblioteca — 2026-09-14

Pedido: aproximar o nome/descrição do botão e usar entrada/saída com escala suave, conforme o áudio da gravação de 07:26:21.

A dica usava coordenadas de viewport dentro de um ancestral transformado pela animação da view. Agora a biblioteca é o bloco de referência e os cálculos descontam sua posição. Mede-se offsetWidth/offsetHeight, sem escala, antes de abrir. Dica e menu aparecem 6 px abaixo, ou acima quando necessário; o limite lateral é o da biblioteca. A origem da escala aponta para o botão. Entrada ease-out e saída ease-in, 140 ms; espera inicial de 250 ms mantida sem somar o atraso CSS. Click/scroll/dispose fecham imediatamente; saída de mouse/foco permite a transição. O tooltip não captura cliques.

Arquivos:
- UI CEP: `apps/after-effects-cep/client/src/quick-library.ts`.
- Layout compartilhado: `packages/ui-core/src/theme.css` (classes da biblioteca CEP).
- Movimento: `packages/ui-motion/src/motion.css` (variante da biblioteca e redução de movimento).
- Testes: `apps/after-effects-cep/tests/quick-library.test.mjs`.
- Documentação: changelog, QA matrix e este relatório.

Sem mudança de contrato, APIs Adobe ou dados do projeto. A variante está restrita às classes da biblioteca CEP. A pasta recebida não contém .git; não foi possível criar branch.

## Evidência

`artifacts/tooltip-fix/280.png`, `360.png`, `480.png`, `720.png`: biblioteca real montada em fixture de navegador com ancestral animado e deslocado. Medição de 6,0 px em todas as larguras, dentro do painel. Fixture usa itens fictícios apenas para testar UI, sem executar comandos Adobe. Matriz completa de alturas/DPI e observação temporal da animação no host: NOT RUN.

After Effects 2026, macOS: aplicativo aberto, projeto sem título. Atualização instalada com backup em `artifacts/install-backups/ae-20260914-073346/previous`. Tentativas de interação foram interrompidas porque o usuário estava operando o aplicativo. Não se afirma verificação controlada do novo comportamento no host.

## VERIFICATION REPORT

Build:             PASS — npm run build (inclui tsc -b)
Static validation: PASS — npm run validate
Types/Lint:        FAIL no lint global; tipos e lint dos arquivos alterados PASS
Unit tests:        8/8 focados; suíte geral 1188/1210 passed
Contract tests:    incluídos na suíte geral; nenhum contrato alterado
Golden tests:      NOT APPLICABLE
AE host:           NOT RUN — validação controlada do patch pendente
Premiere host:     NOT RUN — biblioteca alterada é exclusiva do CEP
Performance:       NOT MEASURED
Packaging:         PASS — build e instalação dev local com backup

Overall: NOT READY para declarar verificação completa no host
Blocking evidence:
- Mesmos três erros de lint antes e depois: MotionGroupedControls em parallax-advanced.jsx e rig-effector.jsx; any em motion-host.d.ts.
- 22 falhas gerais relacionadas a controles de rigs e expectativas do build, fora desta mudança; já registradas no checkpoint Motion Flow de 13/09.
- Interação controlada no AE e matriz DPI ainda pendentes.

Outros checks: contraste PASS (68 pares); skills PASS (14 skills/42 routing evals).
Status: IMPLEMENTED_NOT_HOST_VERIFIED.

Rollback: restaurar os três fontes de `artifacts/tooltip-fix/before/` e rebuild; ou restaurar o backup da extensão local.
