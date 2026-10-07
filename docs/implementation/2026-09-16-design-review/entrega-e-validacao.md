# Design, edição e biblioteca pessoal — entrega

Implementado e instalado em 16/09/2026. Baseado nos dois vídeos enviados (21:03:51 e 21:06:55).

## O que entrou

- **Pastas hierárquicas:** Motion 2D/3D/efeitos, texto por caracteres/palavras/linhas/efeitos, Studio, curvas e câmera; expandir/recolher, etiquetas de oito cores com herança nos filhos, busca, favoritos e recentes. Divisor entre categorias e miniaturas continua arrastável e acessível pelo teclado.
- **Visual:** superfícies escuras, linhas compactas, pastas e títulos separados; Moti.on mantém sua marca, ícones e presets originais. Ferramentas recebeu acabamento coerente e conserva as 47 ferramentas, 18 atalhos e nove posições de anchor.
- **Prévia:** autoplay coordenado em um único ciclo de desenho, somente nas miniaturas visíveis; pausa, tamanho ajustável e movimento reduzido respeitado. Controles de navegação não modificam o projeto.
- **Aplicação:** In, Out e Ambos aplicam diretamente; duplo clique também aplica. O menu ≡ mantém direção, parâmetros e restaurar padrão.
- **Presets → Editar:** identifica a camada e o preset aplicado, lê os controles nativos e oferece sliders + campos precisos. Aplicar ajustes usa um Undo. Troca de seleção não reutiliza o alvo anterior; alterações externas exigem recarregar. Controles com keyframes/expressão são preservados e editados no AE.
- **Minha biblioteca:** adicionar pasta local de `.ffx`, subpastas, busca, atualizar e remover referência; duplo clique ou Aplicar .ffx. Arquivos permanecem no local original. O arquivo é aplicado no tempo atual com suas configurações salvas. Seus parâmetros são editados em Controles do efeito; não há prévia animada inventada para arquivos pessoais.

A coleção de 105 itens e as curvas de movimento não foram alteradas nesta revisão. No vídeo 2, títulos cinematográficos aparecem como referência; a fala prioriza as funcionalidades da biblioteca e do editor.

## Vídeos e transcrição

- `video-1-transcricao.txt/.json` e `video-2-transcricao.txt/.json`: transcrição automática local com timestamps.
- 3.839 + 4.218 = **8.057 frames decodificados e indexados**. A inspeção visual acompanhou a duração completa em 15 folhas de contato (um frame por segundo mais mudanças relevantes) e ampliações dos controles. Isso não equivale a alegar leitura visual individual de 8.057 imagens quase idênticas.
- Evidência decisiva: vídeo 2, 17–23s mostra etiquetas de pastas; 34–40s mostra In/Out/Both; 59–68s mostra My Library/Add Folder. Vídeo 1, 41–60s pede preservar quadrados e atalhos de Ferramentas.
- Índices, métricas por frame, folhas e imagens estão em `artifacts/design-review/video-1/` e `video-2/`.

## Arquivos alterados

| Área | Fontes principais |
|---|---|
| UI | `apps/after-effects-cep/client/src/preset-gallery.ts`, `preset-workspace.ts`, `main.ts` |
| Tema/preferências | `packages/ui-core/src/theme.css`, `panel-preferences.ts` |
| Contratos | `packages/contracts/src/preset-workspace.ts`, `index.ts`, schema de request e validador gerado |
| Registro | `packages/command-registry/src/descriptors.ts`, `undo-labels.ts`, descriptors gerados |
| After Effects | `host/src/commands/preset-library.jsx`, `personal-preset-library.jsx`, ordem do build ExtendScript |
| Testes | novos testes de contratos/registry, `preset-workspace-host.test.mjs`, `preset-preferences.test.mjs`; integração Home, fake DOM CEP e cobertura de comandos atualizados |
| Documentação | plano, transcrições, este relatório, pesquisa de APIs, MASTER_BUILD_SPEC e CHANGELOG |

## Verificação

| Verificação | Resultado |
|---|---|
| `npm run check` | **FAIL** no teste geral: **1.227 PASS / 22 FAIL / 1.249**. As 22 falhas são exatamente as anteriores; zero novas. Lint, tipos, build, validação e contraste passaram. |
| `npm run skills:validate` | **PASS** |
| Novos testes de contratos/registry + host + preferências | **PASS**; validação estrita, tokens e persistência sem alterar preferências existentes |
| `node artifacts/design-review/verify-ui.mjs` | **PASS**: pastas/etiquetas, direção, duplo clique, In/Out/Ambos, divisor, autoplay visível, pausa, reduced motion, stale edit, seleção e biblioteca |
| Capturas 280×640, 360×720, 480×800, 720×900 | **PASS** em navegador local; sem overflow horizontal, ações visíveis |
| `verify-native.jsx` pelo scripting público | **17/17 PASS**, AE **26.5x89** no macOS: controles reais, conflitos, edição, .ffx Unicode, aliases, arquivo inválido, duas camadas, tempo/seleção, tokens e remoção de referência |
| Undo de Ajustar preset | **PASS** em interação nativa: 100 → 63 → Undo → 100 |
| Undo da aplicação pessoal | **NOT RUN** até confirmação final. Aplicação mudou 4→5 efeitos; a interação foi interrompida quando o aplicativo indicou uso concorrente, e a composição de QA foi removida. |
| Seletor gráfico Adicionar pasta | **NOT RUN** na matriz nativa; descoberta/listagem/aplicação foram exercidas com raiz de fixture aprovada |
| Painel real CEP | **PASS** para carregamento e presença do novo Navegar/Editar, árvore, slider e autoplay; matriz interativa completa nativa **NOT RUN** |
| Instalação | **PASS**, 66 arquivos comparados por SHA-256 com o build |

Resultados detalhados: `artifacts/design-review/host-results.json`, `ui-results.json`, `undo-results.json`, `regression-comparison.json`, `install-verification.json` e logs de checks. As falhas preexistentes envolvem testes antigos de controles agrupados e inventários de build/globais; não foram silenciadas nem alteradas por esta entrega.

## Compatibilidade e limites

Comandos de biblioteca pessoal exigem AE 25+ e capacidades nativas. Editor limita-se a uma camada gerenciada desbloqueada, com identidade e valores atuais. Até 20 raízes, 1.000 presets e profundidade oito; varredura limitada. Só `.ffx` emitidos pelo catálogo podem ser aplicados. O bridge não aceita caminhos nem scripts. Sem upload ou serviços remotos.

[Decisão e fontes de APIs](../../research/preset-workspace-local-library.md). O guia de scripting indicado pela própria Adobe é mantido em docsforadobe; sua proveniência foi registrada, e os caminhos críticos foram exercidos no aplicativo real.

## Instalação e reversão

Instalado em `/Users/rael/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`.

Backup anterior: `artifacts/install-backups/ae-20260916-225555/previous`.
Fonte anterior: `artifacts/design-review/source-before/source.tgz`.

O novo painel já foi observado aberto no AE. Se uma instância antiga continuar aberta, feche e reabra somente o painel Moti.on. Não é necessário reiniciar o After Effects nem salvar/alterar projetos para carregar a interface.
