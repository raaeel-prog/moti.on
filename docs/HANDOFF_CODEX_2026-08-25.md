# Handoff Codex — 2026-08-25

Este documento registra o ponto de continuidade do branch `Codex`. Ele separa o que foi implementado e provado do que ainda depende de host Adobe, plataforma ou fases posteriores do produto.

## Entregue neste ciclo

- CHMS-001 a CHMS-008: contrato v1, quatro JSON Schemas Draft 2020-12, validadores CSP-safe, command registry, capability matrix, logging com redaction, shells compartilhados e adapters separados para After Effects CEP e Premiere Pro UXP.
- After Effects: bootstrap explícito e obrigatório por `$.evalFile`, single-flight por adapter, recarga segura do engine, retry somente de leitura, limite fail-closed do `evalScript`, dispatcher allowlisted, preflight e Undo coerente.
- Premiere Pro: leitura honesta de versão/locale, probes por símbolos públicos, lifecycle do painel, fronteira `lockedAccess` → `executeTransaction` e exportação explícita de diagnóstico pelo picker UXP.
- UI compartilhada: base `#1D1D1D`, uma tarefa dominante por view, i18n pt-BR/en-US, navegação e estados acessíveis, além dos modos 280/360/480/720 px.
- CHMS-009: núcleo puro de metadata de rigs com create/read/update/remove/migrate, JSON canônico, UTF-8, base64url, SHA-256 e planos inline/sidecar sem I/O.
- Documentação de arquitetura, instalação, limitações, pesquisa oficial e gates atualizada com estados literais `PASS`, `FAIL` e `NOT RUN`.

## Evidência automatizada

| Verificação | Resultado em 2026-08-25 |
|---|---|
| `npm.cmd run check` | `PASS`: lint, typecheck, build, validate, 326/326 testes e skills validate |
| Testes focados de CHMS-009 | `PASS`: 24/24, incluídos no gate integrado |
| `npm.cmd audit --audit-level=high` | `PASS`: 0 vulnerabilidades conhecidas no snapshot verificado |
| `git diff --check` | `PASS`: nenhuma inconsistência de whitespace |

O `PASS` automatizado não substitui execução em host Adobe.

## Evidência no After Effects real

Ambiente medido: After Effects `26.3x87`, CEP `12.0.1`, Windows 11, em 2026-08-25.

- `PASS`: instalação do bundle gerado e abertura do painel sem modal.
- `FAIL` histórico corrigido: `<ScriptPath>` gerava modal de sintaxe na linha 1; o manifest passou a omiti-lo e o mesmo host script carregou pelo mecanismo oficial `CSInterface.evalScript` + `$.evalFile`.
- `PASS`: estado inicial da Verificação do sistema permanece ocioso até ação do usuário.
- `PASS`: `ae.context.read`, capability probe e System Check com ausências futuras reportadas honestamente.
- `PASS`: round-trip de português, japonês, emoji, aspas e barras.
- `PASS`: criação de `Moti.on Demo` e remoção integral com um único Ctrl+Z.
- `FAIL` encontrado e corrigido: CEP reportou `pt_BR`, enquanto a resolução do Undo esperava `pt-BR`.
- `PASS` após rebuild/reinstalação: `Edit > Undo` exibiu `Desfazer Moti.on: criar composição de teste`.
- `PASS` parcial visual: painel operável em largura compacta próxima de 280 px, base escura, uma view dominante e sem overflow horizontal aparente.

Esta evidência vale somente para a combinação acima. AE 25.x, outras versões 26.x e macOS continuam `NOT RUN`.

## Evidência ainda não executada

- Premiere Pro real: carregamento pelo UXP Developer Tool, contexto, versão/locale, capabilities, picker salvo/cancelado, CSP e comportamento da transação continuam `NOT RUN`. O UXP Developer Tool não estava disponível nesta máquina durante o ciclo.
- Matriz visual completa: 360/480/720 px, 100/125/150/200% de escala, teclado completo, foco, leitor de tela e screenshots comparáveis continuam `NOT RUN`.
- Browser preview: `NOT RUN`; testes DOM existem, mas não houve revisão visual no browser.
- CHMS-009 no host: adapter para `Layer.comment`, limite real em bytes, sidecar atômico, corrupção, migração, Undo e persistência após reabrir `.aep` continuam `NOT RUN`.
- Transporte por arquivo para payloads AE acima de 60.000 caracteres codificados ainda não foi implementado.
- Diagnóstico por clipboard no CEP está implementado, mas a cópia e a inspeção do conteúdo no host real continuam `NOT RUN`; o Premiere usa picker explícito e também aguarda prova real.

## Próxima sequência recomendada

1. Instalar/abrir o UXP Developer Tool 2.2+ e executar integralmente o roteiro Premiere em `docs/INSTALLATION.md`.
2. Repetir o roteiro AE nas versões/plataformas restantes e completar largura, DPI, teclado e acessibilidade.
3. Implementar a camada de host do CHMS-009: leitura/escrita delimitada de `Layer.comment`, sidecar com escrita/rename/remoção atômicos e uma fronteira única de Undo.
4. Só então iniciar os rigs visuais e operações Apply/Adjust/Bake/Remove previstas no master spec.
5. Antes de release, fechar assinatura/notarização, SBOM, checksums, instalação/upgrade/uninstall e matriz de hosts.

## Comandos para retomar

```powershell
npm.cmd install
npm.cmd run check
& .\scripts\install-ae-dev.ps1 -EnableDebugMode
git status --short --branch
```

Para o Premiere, siga o carregamento pelo UXP Developer Tool descrito em `docs/INSTALLATION.md`; não use QE, automação de UI ou APIs privadas como atalho.

## Estado agregado

A fundação P0 está implementada e o caminho After Effects foi provado parcialmente em um host real. O P0 não está fechado para a matriz declarada enquanto o build atual não for executado no Premiere real e nas demais combinações de host/plataforma. CHMS-009 está `IMPLEMENTED_NOT_HOST_VERIFIED`: o núcleo puro existe, mas não há ainda rig visual nem persistência de host.
