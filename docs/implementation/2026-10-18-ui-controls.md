# Continuação de UI/UX — 18/10/2026

O refinamento é original, baseado no [estudo focal de controles](../research/2026-10-18-ui-controls-followup.md). As oito perguntas têm evidências estáticas e REA identificadas; a execução dinâmica dos fornecedores permanece NOT RUN. Não foram copiados código, ícones ou assets proprietários.

## Implementação

- **Checkbox:** controle nativo com caixa visual de 14 px, label/alvo de pelo menos 24 px, seleção azul, foco e desabilitado. O campo numérico deixava Motion blur com largura indevida; a folha AE corrige a herança sem trocar seu contrato.
- **Sliders:** preenchimento proporcional ao valor e estados de hover/arraste/erro; reset inativo no padrão. A posição e o valor acompanham o número. Seleção mista mantém o slider absoluto desabilitado; digitação e arraste numérico conservam seu contrato existente. Não se calcula média artificial.
- **Expansão/foco:** estado aberto separado dos parâmetros e dos rascunhos, por instância/fase/chave, apenas na sessão. O slider continua aberto após a atualização do host e o foco retorna ao mesmo controle para continuar pelas setas. Outro controle que recebeu foco não é interrompido.
- **Confirmação:** digitar e clicar em reset/checkbox aguarda a ação de destino antes de confirmar. Se o gesto envolve duas fases, os dois payloads são preparados antes de substituir a view, e a fila confirma cada fase com a inspeção atualizada do mesmo alvo/instância. Trocar a fase ou a seleção aborta o próximo ajuste com aviso. Cada fase continua com sua operação própria de Undo; o botão Ambos continua uma única aplicação, sem alteração do contrato.
- **Precisão:** Sobreposição e Elasticidade aceitam frações. A exibição curta não reescreve valores de host não tocados; Escape restaura o valor original sem criar alteração pendente.
- **Configurações:** cinco grupos preservados, títulos semanticamente associados, labels 12 px, descrições 11 px, ações locais compactas e Ajuda em linhas. Preferências e IDs permanecem os mesmos.

Os botões flutuantes, o azul funcional, a seleção de card sem aplicar, os tiles de Ferramentas e a geometria/animação card–popover permanecem preservados. Não foi criado botão Aplicar ajustes no editor de fases. Os fluxos de câmera, presets pessoais e demais editores mantêm suas ações próprias. Nenhum contrato ou comando Adobe foi alterado.

## Arquivos

| Grupo | Arquivos |
|---|---|
| UI AE | `preset-phase-editor.ts`, `preset-workspace.ts`, `views/settings-view.ts` |
| Kit | `number-disclosure.ts`, `ae-refinement.css`, nova `ae-settings.css` |
| Build | `scripts/build.mjs`, apenas composição do CSS AE |
| Testes | phase-editor/workspace/settings, proteção de CSS AE e roteiro de navegador |
| Host/contratos | Sem alterações desta rodada |
| Docs | Estudo, plano, esta entrega e changelog |

## Verificação

Comandos e logs ficam em `C:/dev/preset-study/ui-controls-next/`. Capturas e relatório do navegador ficam em `C:/dev/Moti.on-ui-controls-next/artifacts/ui-controls-next/`.

- `npm.cmd run check`: consultar `check-delivery.log` para o resultado integral e contagem final. Inclui lint, tipos, build, validação, contraste e suíte completa.
- Testes focados: **102/102 PASS** em `focused-queue-final.log` (editor/workspace/Configurações/CSS), incluindo as duas fases, preservação de foco, fase substituída e precisão.
- Navegador: **23 verificações PASS**, componentes reais e respostas de host explicitamente simuladas, `browser-delivery2.log`. Roteiro ampliado com Configurações pt/en, clique pelo label/Space, repetição por teclado, fila entre fases, seleção/favoritos/busca e imagens em 280/360/480/720 px e 280×280. Pixels dos tiles protegidos e junção card–popover comparados ao CSS anterior.
- `npm.cmd audit --json`: **zero vulnerabilidades**, `audit-final.json`.
- Runtime AE desta rodada: **NOT RUN**. Observação por Computer Use mostrou o After Effects 2026 ocupado executando `build-fixtures.jsx` e gerando/renderizando prévias de outra tarefa. Não se cancelou a execução, trocou projeto ou forçou reload.
- Runtime Premiere: **NOT RUN**; não recebe as folhas AE. O teste de distribuição verifica que seu CSS continua prefixo compartilhado sem regras AE.

Os testes de navegador não constituem evidência de execução de comandos Adobe. A prova real da rodada de 16/10 continua identificada na entrega anterior, sem ser promovida a validação destas mudanças.

## Integração/instalação

Trabalho iniciado em cópia isolada que incluiu 1.584 arquivos fonte, inclusive modificados/novos do checkout compartilhado. O manifesto SHA-256 inicial está em `C:/dev/preset-study/ui-controls-next/source-manifest.json`. A integração tem backup e hash guard por arquivo e registra o recibo; não substitui a árvore inteira.

A atualização oficial desta rodada é limitada ao bundle do cliente e tema; host, assets, conta e preferências são preservados. O recibo de instalação registra hashes e backup. O painel carregado continua com o JavaScript anterior até ser reaberto, sem interromper o trabalho que estava em execução no AE. Instalação e validação no host são registradas separadamente.

Integração: **16 arquivos verificados**, recibo `integration-receipt.json`. Instalação: **2 arquivos verificados**, 4 arquivos de host/conta preservados, recibo `official-install-receipt.json`. Backup oficial: `C:/dev/preset-study/ui-controls-next/official-ui-backup-20261018-122938`. Não houve atualização de versão, assinatura, push ou publicação; esta é atualização local de desenvolvimento da interface oficial.

## Limites reais

É necessário validar os novos controles no AE após a tarefa de prévias terminar: clique/Space no checkbox, dois incrementos no slider aberto, Escape, confirmação entre Entrada/Saída e Undo por ajuste. A geometria do controle foi revisada no navegador, mas DPI e renderização CEP atuais não foram aferidos. O estudo dos fornecedores continua parcial quanto a execução dinâmica e acessibilidade assistiva.
