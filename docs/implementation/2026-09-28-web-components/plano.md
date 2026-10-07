# Migração gradual para Web Components — botão

## Escopo
Concluir a primeira fatia iniciada por Hugo: `createActionButton` passa a montar `moti-button` quando o documento oferece registro nativo. Preservar o controller, o botão HTML interno, o CSS Light DOM, todos os estados, explicações, IDs, callbacks e teclado. `shell.button`, campos e overlays ficam para fatias posteriores.

## Implementação
- Extrair primitivas internas e apresentação do botão, compartilhadas entre Custom Element e fallback DOM.
- Registro explícito por documento, sem acesso a HTMLElement/customElements no import. Constructor sem filhos/atributos; montagem idempotente fora dele.
- Atributos/propriedades reativos e métodos atômicos de estado/indisponibilidade.
- Wrapper compatível e fallback `span` para documento sem as capacidades necessárias.
- Testes de contrato, import sem DOM e ciclo de vida em navegador real; documentação e changelog.

## Invariantes e riscos
`success` continua acionável; `loading` e `unsupported` bloqueiam. Motivos continuam visíveis e associados ao botão. UXP não é navegador completo; não ativar flags Spectrum/CSS como efeito colateral. Nenhuma alteração nos comandos, presets, adapters ou projetos Adobe.

## Verificação
Baseline: `npm run check` FAIL no lint, cinco erros preexistentes (quatro fora da migração, um no protótipo moti-button). Log em artifacts/web-components-20260928/baseline-check.log. Reexecutar check completo e os gates subsequentes separadamente caso o lint alheio continue bloqueando. Testar teclado, estados, reconexão, registro repetido, documento isolado e fallback. QA visual em 280/360/480/720 px. Host Adobe real: marcar NOT RUN se não executado; build/browser não substituem essa evidência.

## Reversão
Checkout não possui `.git`; fontes originais preservados em `artifacts/web-components-20260928/source-before/`. Restaurar esses arquivos e remover somente os arquivos novos desta etapa, depois recompilar. Não inicializar Git nem alterar instalações Adobe nesta etapa.
