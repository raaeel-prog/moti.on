# Etapa 4 — seletores em Light DOM

Status: **IMPLEMENTED_NOT_HOST_VERIFIED**.

`selectField()` agora cria `<moti-dropdown>` quando o documento permite o registro nativo. Os consumidores existentes no AE, no Premiere e nas preferências compartilhadas adotam o componente sem alterar suas chamadas. O retorno continua sendo o contêiner `.ch-field.ch-field--select`, contendo label, controle e descrição. Não houve mudança nos adapters, comandos ou formatos persistidos.

## Implementação e compatibilidade

- `packages/ui-core/src/elements/dropdown-view.ts`: apresentação e interação compartilhadas. Mantém o select nativo, menu no body, teclado, IDs e callbacks. A lista inicial é copiada, impedindo que uma alteração posterior no array externo autorize opções não renderizadas. Listas vazias, opções repetidas, placeholders e valores atuais ausentes continuam permitidos.
- `packages/ui-core/src/elements/moti-dropdown.ts`: registro lazy no realm do documento; construtor sem mutações de DOM; `configure(options)` uma única vez. Propriedades/atributos value, label, description, disabled e disabled-reason atualizam os mesmos controles. Atributos incompletos bloqueiam interação até recuperação. `focus()` encaminha para o controle visível. Desconexão fecha menu/listeners, e reconexão conserva a configuração.
- `packages/ui-core/src/shell.ts` e `index.ts`: wrapper compatível, exports existentes e registro novo. O shell compartilha o proprietário de menu com o componente e encerra o portal antes de redesenhar.
- `packages/ui-core/tests/moti-dropdown.test.mjs` e `shell.test.mjs`: validação, fallback, isolamento por documento, callbacks antigos, teclado e regressão de foco.

Custom Elements e overlay têm gates independentes. Sem `HTMLElement`/registry, com colisão de nome ou registro/construção parcial, o wrapper usa `div`. Sem as capacidades de overlay já exigidas pelo seletor anterior, mantém o select nativo visível. Nenhum polyfill, flag de Spectrum/CSS ou Shadow DOM foi introduzido. Motivo de desabilitação continua podendo usar descrição ou rótulo como fallback.

A configuração inicial recebe opções e callback em JavaScript; esta etapa não implementa interpretação declarativa de `<option>` dentro de `<moti-dropdown>`. Mudanças programáticas de valor não disparam `onChange`.

## Correções verificadas

1. Opções de menu fechado/substituído e controles removidos não confirmam alterações. Remover o componente fecha seu portal imediatamente; o fallback preserva a observação de remoção quando disponível.
2. Resize fecha o menu sem passar um objeto Window para `Node.contains`.
3. Reabrir durante a animação cancela o timer antigo, atualiza `aria-selected` e limpa a posição vertical oposta.
4. Restauração de foco procura primeiro `data-focus-key` na região inteira; o ID do select oculto não intercepta mais o foco do botão visível após trocar idioma/tema.
5. Mudanças emitidas pelo select nativo atualizam o rótulo do botão e o atributo de valor antes do callback do consumidor.

## Evidência

Artefatos em `artifacts/web-components-stage4/`; hashes dos bundles, geometria, timestamps e listas de verificações estão nos relatórios JSON. Chromium **151.0.7922.34**, macOS/darwin. As APIs Adobe foram simuladas apenas na fronteira dos testes de navegador.

| Verificação | Resultado |
|---|---|
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| ESLint dos arquivos alterados de código/testes | PASS |
| `npm run validate` | PASS |
| `npm run a11y:contrast` | PASS, 88 pares |
| `npm run skills:validate` | PASS, 14 skills / 31 arquivos / 42 avaliações |
| `node scripts/check-extendscript.mjs` | PASS, 77 arquivos |
| Testes focados de campos, dropdown, shell, preferências, tema e ciclo dos clientes | PASS, 113/113 |
| `node artifacts/web-components-stage4/verify-dropdown.mjs` | PASS, 32/32, 32 capturas |
| `node artifacts/web-components-stage4/verify-panels.mjs` | PASS, 45/45, 32 capturas |
| `npm run check` | FAIL: os mesmos 4 erros de lint do baseline |
| `npm test` | FAIL: 1.774 testes, 1.725 PASS, as mesmas 49 falhas nominais do baseline |
| Adobe After Effects CEP real | NOT RUN |
| Adobe Premiere UXP real | NOT RUN |

As 32 verificações isoladas incluem construção nativa real, realms, reconexão, validação, seleção, Enter/Espaço/setas/Home/End/Escape/Tab, foco, reversão de animação, fechamento externo/scroll/resize e paridade geométrica/visual com fallback. As 45 verificações dos bundles incluem Settings em PT/EN, dark/light e larguras 280/360/480/720; idioma, tema e densidade persistem e recuperam foco; navegação e atualização de contexto descartam ações antigas.

Durante QA, a primeira leitura periódica de contexto do AE redesenhava a tela no meio da captura. A instrumentação confirmou que `shell.rerender()` encerrava o menu corretamente. O teste aguarda essa leitura inicial e também provoca uma mudança posterior de contexto para verificar o descarte. Registro diagnóstico: `browser-panels-poll-diagnostic.log`. A fixture de reabertura desativa somente a transição artificial do posicionamento do campo de teste; a animação real de saída do menu continua testada.

Os 4 erros de lint preexistentes permanecem em `host-adapter.ts` (2), `main.ts` do AE (1) e `text-vertical-pulse.test.mjs` (1). `tests-summary.json` compara as falhas nominais com a etapa 3: nenhuma adicionada ou removida. Não representam aprovação da suíte global.

## Host real e reversão

Ainda é necessário abrir os painéis em AE CEP e Premiere UXP, confirmar o fallback efetivamente disponível, trocar idioma/tema/densidade, percorrer seletores por teclado, redimensionar e navegar durante menu aberto. Registrar versões reais e resultado. Não houve instalação ou publicação nesta etapa.

Workspace sem Git: `source-before/` guarda os arquivos preexistentes alterados; `changes.diff` e `changed-files.json` identificam o restante para revisão/reversão. Os demais builders continuam disponíveis para as próximas etapas.
