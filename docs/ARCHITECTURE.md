# Arquitetura

## Objetivo

Manter um único produto, embora os hosts usem runtimes diferentes:

- **Premiere Pro:** UXP, JavaScript moderno, chamadas assíncronas e DOM próprio do Premiere.
- **After Effects:** CEP para a interface e ExtendScript para o DOM do aplicativo.
- **Compartilhado:** contrato e registro de comandos, matriz de capacidades, logging redigido, textos, temas e componentes de interface; cliente de API/licenciamento permanece futuro.

## Fluxo

```text
UI do painel
   │
   ├── Premiere UXP ──> adapter UXP ──> premierepro API
   │
   └── After Effects CEP ──> CSInterface.evalScript ──> adapter ExtendScript ──> app.project

Ambos retornam o contrato v1:
{ protocolVersion, requestId, ok, data, warnings, error, timing }
```

## Árvore de destino quando o produto crescer

```text
packages/
  contracts/            DTOs, envelopes e schemas
  command-registry/      catálogo e cliente de comandos
  capability-matrix/     fatos, findings e tiers
  ui-core/               shell e componentes compartilhados
  ui-tokens/             artefatos de tokens quando a separação se justificar
  rig-metadata/          identidade e migração dos rigs
  expression-library/    templates de expressão
  keyframe-core/         keyframes compartilhados
  preset-schema/         presets declarativos
  caption-core/          captions semânticas
  asset-sdk/             providers de assets
  license-client/        autenticação/licença
  logging/               diagnóstico redigido
  test-fixtures/         doubles e fixtures compartilhadas
apps/
  premiere-uxp/         shell UXP + adapter do Premiere
  after-effects-cep/    shell CEP + adapter ExtendScript
native/
  core/                 algoritmos nativos compartilhados
  premiere-addon/       wrapper híbrido, quando necessário
  ae-companion/         integração nativa do After Effects
  whisper/              transcrição offline
services/
  api/                   BFF e API do produto
  worker/                jobs assíncronos
  database/              schema e migrações
presets/                 conteúdo versionado do produto
installers/              empacotamento Windows/macOS
```

A árvore normativa completa está no master spec §7. A seção de inventário abaixo distingue o que já existe do que ainda é apenas destino.

## Quando adicionar C++

Use C++ somente quando houver processamento de frames, áudio, visão computacional, codecs, integração com hardware ou outro trabalho que não deva ficar em JavaScript. Um painel de automação comum não precisa começar nativo.

Se o produto for um **efeito visual**, a arquitetura muda: o núcleo deve nascer em C++ pelo SDK de plug-ins do After Effects, com compatibilidade planejada para Premiere Pro. A interface de painel pode continuar separada.

## Requisitos de produção ainda não implementados

- autenticação e licença;
- atualização automática ou canal de distribuição;
- assinatura de ZXP/CCX e notarização de binários nativos;
- telemetria com consentimento;
- crash reporting externo; o logging local redigido e o bundle de suporte já existem;
- idiomas além de pt-BR e en-US;
- testes dentro de versões reais dos hosts em Windows e macOS;
- política de migração de dados e configurações;
- documentação de suporte e privacidade.

---

## Estrutura real hoje, e o que ainda não existe

O master spec §7 descreve a árvore de destino completa do monorepo. Este repositório **não** a cria inteira: a §0.5 proíbe deixar placeholder, e um diretório vazio com um `package.json` de uma linha é exatamente isso. Um esqueleto de quatorze packages vazios faria o projeto parecer muito mais adiantado do que está, e o `npm run check` passaria por cima deles sem verificar nada.

A regra é: **cada diretório nasce na issue que primeiro precisa dele, já com conteúdo e teste.**

### Estrutura que existe agora

| Caminho | Conteúdo |
|---|---|
| `apps/premiere-uxp/` | Painel UXP, manifest, adapter do Premiere |
| `apps/after-effects-cep/` | Painel CEP, manifest CSXS, host ExtendScript, tipos |
| `packages/contracts/src/` | Protocolo v1, erros tipados, capabilities e serialização segura para `evalScript` |
| `packages/contracts/schemas/` | Quatro JSON Schemas v1 em Draft 2020-12: request, response, capabilities e rig metadata |
| `packages/contracts/legacy/` | Compatibilidade UMD com o envelope legado |
| `packages/command-registry/` | Descriptors allowlisted, geração ES5 e cliente correlacionado por `requestId` |
| `packages/capability-matrix/` | Probes por símbolo, tiers e cache somente de sessão |
| `packages/logging/` | Logger estruturado, redaction na escrita, rotação e bundle de suporte |
| `packages/rig-metadata/` | Núcleo puro de create/read/update/remove/migrate, serialização canônica, SHA-256 e planos inline/sidecar |
| `packages/test-fixtures/` | Doubles reutilizáveis do módulo do Premiere |
| `packages/ui-core/` | Shell, tokens, CSS, componentes, i18n pt-BR/en-US e testes de DOM |

O aceite automatizado de CHMS-003 está implementado. Ajv 8 é dependência somente de desenvolvimento: valida os quatro artefatos Draft 2020-12 e gera um módulo standalone durante o build. O runtime consome esse módulo sem Ajv, `eval`, `Function`, `require` ou import dinâmico. Antes da validação do schema, os guards profundos recusam ciclos, valores não JSON, números não finitos, protótipos inesperados, getters que lançam e profundidade excessiva.

### Ainda não existe, e quando deve nascer

| Caminho previsto na §7 | Marco de criação | Por quê ainda não |
|---|---|---|
| `packages/ui-tokens/` | Follow-up de CHMS-008 ou ADR que altere a §7 | Os tokens estão co-localizados em `packages/ui-core`; o package previsto no master spec ainda não existe |
| `packages/expression-library/` | CHMS-011 | Motor de templates de expressão |
| `packages/keyframe-core/` | CHMS-012 | Serialização de keyframes |
| `packages/preset-schema/` | CHMS-021 | Presets declarativos |
| `packages/asset-sdk/` | CHMS-029 | Provider Pexels |
| `packages/license-client/` | CHMS-034 | Cliente de licença |
| `packages/caption-core/` | CHMS-041 | CaptionDocument e importadores |
| `services/` | CHMS-028 | Backend, banco e OpenAPI |
| `native/` | CHMS-035 | Núcleo C++ |
| `presets/` | CHMS-021 | Primeiro conjunto de presets reais |
| `installers/` | CHMS-049 | Empacotamento e assinatura |

### Fronteira do núcleo de metadata de rigs

`packages/rig-metadata/` é deliberadamente puro. Ele cria, lê, atualiza, remove e migra o bloco `[MOTION_META_V1]`, preserva o texto do usuário fora do span gerenciado e produz JSON canônico em UTF-8, base64url sem padding e integridade SHA-256. A escolha inline/sidecar recebe o limite em bytes do adapter e devolve um plano; o package não toca `Layer.comment` nem o filesystem.

Essa separação mantém as mutações Adobe na camada de host: o adapter futuro será responsável por ler e gravar `Layer.comment`, executar escrita/rename/remoção atômicos do sidecar e envolver tudo num Undo coerente. O núcleo puro tem **24/24 testes focados `PASS`**; integração, persistência, Undo e reabertura no After Effects real continuam `NOT RUN`. Portanto, CHMS-009 está `IMPLEMENTED_NOT_HOST_VERIFIED`, não concluído como feature visual ou de host.

### Camada de host do After Effects: por que é JavaScript escrito à mão

O host não é compilado a partir de TypeScript, e isso não é escolha de conveniência. O target `ES3` do `tsc` foi descontinuado no TypeScript 5.0 e removido na 5.5; o esbuild não emite ES3; e no TypeScript 6.0, usado aqui, até `target: "ES5"` passou a emitir `TS5107` como descontinuado, com remoção anunciada para a 7.0 — o mesmo valendo para `module: "None"` e `moduleResolution: "classic"`. Não existe caminho suportado de TypeScript para o subconjunto que o ExtendScript aceita, e a tendência do ecossistema é fechar esse caminho ainda mais.

Mesmo quando o target existia, a saída `ES5` do `tsc` emitia helpers que o ExtendScript não possui — `__extends` usa `Object.setPrototypeOf`. "Saída ES5" nunca foi sinônimo de "saída segura para ExtendScript".

A segurança vem de três verificações independentes:

1. **`apps/after-effects-cep/tsconfig.host.json`** roda `checkJs` sobre os `.jsx` com `lib: ["ES5"]`. É o `lib`, e não o `target`, que remove `Object.keys`, `Array.prototype.map`, `Promise` e `JSON` do que o código pode usar. Os tipos das APIs do After Effects vêm de `host/types/extendscript.d.ts`, declarado deliberadamente parcial: só entra símbolo que o código realmente chama.
2. **`scripts/check-extendscript.mjs`** cobre a sintaxe, que nenhum `lib` alcança: arrow function, `let`, `const`, `class`, template literal, spread, optional chaining. Ele normaliza comentários e literais antes de varrer, e tem teste positivo e negativo próprio em `tests/extendscript-subset.test.mjs` — um scanner sem teste dá falsa sensação de proteção.
3. **`node --check`** sobre o arquivo montado, em `scripts/validate.mjs`.

Para que 1 e 3 sejam possíveis, a diretiva `#target aftereffects` saiu do arquivo-fonte: ela não é JavaScript válido e impedia qualquer parser JavaScript comum de ler o host. Agora é emitida por `scripts/build-extendscript.mjs`, exatamente uma vez, no topo do arquivo montado. O mesmo script concatena os módulos do host na ordem declarada explicitamente — o ExtendScript não tem módulos, portanto a montagem nunca depende de glob. No AE 26.3x87, o carregamento automático desse bundle por `<ScriptPath>` produziu um modal de sintaxe na linha 1, enquanto `$.evalFile` aceitou o mesmo arquivo. Como o XSD torna `ScriptPath` opcional e o Cookbook oficial documenta as duas estratégias, o manifest passou a omiti-lo e o adapter assumiu um bootstrap explícito único; ver `docs/research/after-effects-cep-bootstrap.md`.

## Estado de verificação

Arquitetura implementada não é sinônimo de integração aprovada. Para o worktree atual:

| Evidência | Status | Escopo |
|---|---|---|
| Testes e validações dos commits já registrados | `PASS` | Evidência histórica, válida somente para os snapshots daqueles commits |
| Aceite automatizado de CHMS-003 (JSON Schemas/validadores) | `PASS` | Quatro schemas, geração standalone e guards profundos exercitados no check integrado |
| Núcleo puro de CHMS-009 | `PASS` | 24/24 testes focados; integração `Layer.comment`/filesystem/Undo permanece `NOT RUN` |
| `npm.cmd run check` do conjunto integrado | `PASS` | Em 2026-08-25: lint, typecheck, build, validate, 326/326 testes e skills validate |
| Carregamento dos artefatos atuais no After Effects | `PASS` parcial | AE 26.3x87/CEP 12.0.1/Windows 11: inicialização limpa, contexto, capabilities, Unicode, criação da demo, rótulo de Undo pt-BR e Undo em um passo; outras versões/plataformas continuam `NOT RUN` |
| Carregamento dos artefatos atuais no Premiere Pro | `NOT RUN` | A pesquisa oficial não substitui execução no host |
| Revisão visual no browser | `NOT RUN` | Nenhum browser controlável estava conectado neste ciclo |
| Revisão visual no After Effects | `PASS` parcial | Captura e interação em largura compacta próxima de 280 px, sem overflow horizontal; 360/480/720, DPI, teclado e leitor de tela continuam `NOT RUN` |

Os procedimentos e critérios ficam em [`INSTALLATION.md`](INSTALLATION.md), [`HOST_LIMITATIONS.md`](HOST_LIMITATIONS.md) e [`VERIFICATION_GATES.md`](VERIFICATION_GATES.md).
