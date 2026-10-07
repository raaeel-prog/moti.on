# Correção das entradas e da galeria — 16/09/2026

## Pedido e decisões confirmadas

Gravação e JSON de 15/09/2026 às 19:16:29. A transcrição fornecida foi organizada em `transcricao.md`; quadros do vídeo foram inspecionados. O usuário confirmou no chat: divisor entre **categorias e miniaturas**, e início invisível tanto **nas miniaturas quanto na camada aplicada**.

## Implementado

- Categorias na lateral da galeria. Divisor arrastável; setas esquerda/direita ajustam em 8 px, Home/End alcançam limites e duplo clique restaura 132 px. Largura limitada ao espaço disponível e lembrada na navegação durante a sessão.
- Botão **≡** em cada card abre ajustes sobre a galeria. Escolha de direção, demais parâmetros e refinamento ficam nessa sobreposição; selecionar/ver prévia não abre mais um inspetor permanente. Fechar, Escape e clique externo dispensam a sobreposição; Escape devolve foco ao botão.
- Aplicar continua explícito. Trocar direção e editar parâmetros altera somente o rascunho/prévia até clicar **Aplicar à seleção**. Escolher direção reinicia a prévia.
- Miniaturas paradas mostram a animação em repouso, legível. Hover/clique reinicia pelo primeiro frame; cada trecho do movimento tem ao menos 1,4 s de demonstração, com pausa legível e reset entre ciclos. Essa escala de demonstração não altera a duração enviada ao AE. Movimento reduzido mantém a miniatura parada.
- As 15 transições antigas que tinham `fade: false` agora têm `fade: true`. Assim, as **59 transições** iniciam invisíveis no padrão de intensidade de 100%. A opacidade acompanha o progresso da transição, separada da oscilação de movimento; a ondulação de linhas não deixa resíduo visível nas extremidades.
- Os 29 efeitos contínuos/estáticos, IDs, curvas, durações e demais dados das receitas foram preservados. O teste de digest antigo permanece, normalizando explicitamente somente as 15 alterações de fade autorizadas.

Para presets já aplicados: selecionar a camada, escolher novamente o mesmo preset e clicar Aplicar. Expressões já gravadas no projeto não são substituídas automaticamente ao abrir o painel.

## Arquivos

UI: `apps/after-effects-cep/client/src/preset-gallery.ts`, `motion-library-preview.ts`, `packages/ui-core/src/theme.css`.

Compartilhado: `packages/contracts/src/motion-library.ts`; testes de catálogo e compatibilidade em `packages/contracts/tests/`.

Host: `apps/after-effects-cep/host/src/commands/preset-library.jsx`; bundle gerado pelo build.

Testes novos: `apps/after-effects-cep/tests/motion-library-preview.test.mjs` e fixtures em `artifacts/preset-preview-fix/`. Backups de fontes em `source-before/` nessa pasta. Contrato integrado do agente responsável em `/private/tmp/motion-entry-contract`.

## Verificação

| Teste | Resultado | Evidência em artifacts/preset-preview-fix |
|---|---|---|
| Build, lint, tipos, validação, contraste | PASS | `check.log` |
| Suíte completa | 1215/1237 PASS; 22 falhas anteriores | `check.log`, `regression-comparison.json` |
| Novos testes de relógio, visibilidade e direção das prévias | 3/3 PASS na suíte final | `check.log` |
| Validação de skills | PASS | `skills.log` |
| 88 presets: aplicar, avaliar expressões em 31 tempos, ajustar, remover | PASS no AE | `host-results.json`, `verify-library.jsx` |
| 59 primeiros frames das transições | Todos com canal alfa máximo 0 | `first-frame-results.json`, `renders/*-first.png` |
| 59 renders em repouso | Gerados | `renders/*-rest.png` |
| Reaplicar sobre instância da versão antiga | 4/4 PASS, controles sem duplicação, texto/comentário preservados | `migration-results.json`, `verify-migration.jsx` |
| Primeiro frame após migração | 4/4 transparentes | `migration-*.png`, `first-frame-results.json` |
| UI em 280×640, 360×720, 480×800, 720×900 | PASS em Chromium: divisor, sobreposição, direção, payload, reset, Escape/foco, busca, movimento reduzido, Apply visível | `ui-results.json`, `ui-*.png` |
| Instalação local | PASS, 66 arquivos iguais ao build | `install-verification.json`, `install.log` |
| Desfazer desta revisão | NOT RUN conclusivo: rótulo exato de Undo indisponível na tentativa; não executado Undo genérico | `undo-results.json` |
| Inspeção visual da nova UI dentro do CEP | NOT RUN: automação expôs janela vazia “Sem Título” e árvore de menu desatualizada | browser QA acima não é evidência de UI no CEP |

Host real: **After Effects 26.5x89**, macOS-26.6.2-arm64-arm-64bit. Testes usaram composições temporárias próprias e restauraram a composição anteriormente ativa; não salvaram nem sobrescreveram o projeto do usuário. A migração cobriu Chegada em arco, Palavras sob recorte, Linhas decifradas, Linhas vibrantes (IDs `arc-arrival`, `word-curtain`, `line-resolve`, `lively-lines`).

O teste de visibilidade encontrou primeiro um resíduo de opacidade da oscilação em `lively-lines`; a asserção foi mantida e passou após separar `fadeWeight`. A suíte final tem zero falhas novas em relação à entrega Studio.

SHA-256 do host instalado: `128ed74cfda84299fb605ad1e66db4915cbcb1367949c9c434a4525dcce1f31f`.

## Instalação e limites

Instalado em `~/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`. Reabrir o painel para carregar a interface nova. Backup da instalação anterior: /Users/rael/Documents/ChatGPT/Moti.on/implementation/artifacts/install-backups/ae-20260916-122944/previous

- Intensidade zero continua desativando a contribuição do preset; a garantia de primeiro frame invisível usa o padrão 100%.
- Conflitos com expressões editadas pelo usuário continuam recusados, preservando seu trabalho.
- Não foram testados Premiere, Windows, reabertura de `.aep` ou reinicialização do AE. Atualização local de desenvolvimento; não é publicação assinada.
- As mesmas 22 falhas preexistentes mantêm o gate geral de release vermelho. Undo desta revisão e inspeção da UI no CEP permanecem sem confirmação, conforme tabela.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1215/1237 passed (22 preexisting failures)
Contract tests:    PASS — catalog, compatibility, preview timing/direction
Golden tests:      PASS — first-frame alpha and browser screenshots
AE host:           PASS — 26.5x89/macOS/native presets and migration; Undo NOT RUN
Premiere host:     NOT RUN — outside this AE request
Performance:       NOT MEASURED
Packaging:         PASS — reversible local dev install and checksums

Overall: NOT READY for production release; development update installed
Blocking evidence:
- 22 preexisting failures in the repository-wide suite.
- Native Undo and native CEP visual inspection not conclusively verified this revision.
```
