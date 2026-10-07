# Etapas 5–7 — avisos, controles e sobreposições em Light DOM

Status: **IMPLEMENTED_NOT_HOST_VERIFIED**.

As etapas 5, 6 e 7 migram `createAlert`, `createBadge`, `createSliderField`, `createPopover` e `createDrawer` para elementos `moti-*`, com apresentação compartilhada entre o Custom Element e o fallback nativo. As factories continuam aceitando as mesmas opções e retornando os mesmos controladores; os consumidores existentes de alertas e badges nos painéis não precisaram mudar. A implementação das etapas 6 e 7 já havia sido iniciada pelo usuário; esta revisão fechou validação, ciclo de vida e regressões antes do build de teste.

## Comportamento entregue

- `<moti-alert>` conserva ações, aviso assertivo opcional, fechamento animado, descarte e retorno de foco. Ações de um aviso fechado ou removido deixam de chamar o consumidor; remover o aviso cancela o fechamento pendente. `<moti-badge>` conserva rótulo visível, tom e opção de ícone, sem virar região viva.
- `<moti-slider>` conserva intervalo, passo, valor, campo numérico, teclado, callbacks e estados. Atributos reativos atualizam a view, inclusive quando descrições opcionais são removidas. Alterações inválidas bloqueiam interação sem aplicar parcialmente limites ou apresentação; referências de controles desconectados não enviam eventos ao consumidor.
- `<moti-popover>` e `<moti-drawer>` conservam abertura, fechamento, foco, Escape, backdrop quando aplicável e timers. A desconexão encerra a interação e cancela o trabalho pendente; a reabertura não substitui o foco de origem. Configuração inválida é recusada antes de mover conteúdo ou alterar a raiz. As tags nativas exibem cartões em bloco com a mesma largura da view HTML; o drawer preserva a classe CSS usada pelo layout existente.
- O registro é sob demanda e isolado por documento. Quando Custom Elements não estão disponíveis, há colisão de nome ou a construção falha, as factories usam a view HTML de fallback. A validação ocorre antes de tentar registrar ou montar o elemento. Os imports do pacote não exigem um DOM global.

Não houve alteração nos adapters Adobe, comandos, formatos persistidos ou contratos de Undo. `components.ts` ainda contém builders para quick tiles, grupos de chips, skeleton, spinner e estado vazio; esta entrega **não** declara a migração de todo o `ui-core` como concluída. Slider, popover e drawer ainda não têm consumidores de produto fora dos testes; suas factories e exports estão disponíveis para uso posterior.

## Verificação

| Gate | Resultado |
|---|---|
| `npm run check` (lint, typecheck, build, validate, contraste, testes e skills) | PASS |
| Build em `dist/` para os clientes AE/Premiere e ExtendScript | PASS |
| Suíte completa, incluindo contratos e componentes | PASS, 1.820/1.820; 0 FAIL, 0 SKIP |
| Contraste normativo | PASS, 88 pares |
| Validação de skills | PASS, 14 skills / 31 arquivos / 42 avaliações |
| Chromium: avisos, badge, slider, popover e drawer | PASS, 13/13; 16 capturas em dark/light, 280/360/480/720 px |
| Chromium: regressão do dropdown | PASS, 32/32; 32 capturas |
| Chromium: bundles dos painéis AE/Premiere | PASS, 45/45; 32 capturas |
| After Effects CEP real | NOT RUN |
| Premiere Pro UXP real | NOT RUN |

O resultado completo do gate está em `artifacts/refactor-final-audit/final-check.log`; `final-full-tests.log` registra uma execução intermediária e não é o resultado final. O QA usou Chromium 151.0.7922.34. Os relatórios estão em `artifacts/refactor-final-audit/browser-stage5-7-results.md`, `browser-regression-dropdown/browser-dropdown-results.md` e `browser-regression-panels/browser-panels-results.md`. A fronteira Adobe foi simulada no navegador: não houve abertura de projeto, escrita em arquivo ou execução nos hosts reais.

O backup dos arquivos anteriores à revisão está em `artifacts/refactor-final-audit/source-before/`; o da etapa 5 está em `artifacts/web-components-stage5/source-before/`. Antes de instalar ou publicar, testar tema, idioma, largura de 280/360/480/720 px, navegação por teclado, foco e remoção durante animação no CEP e UXP reais, registrando host, versão e resultado.
