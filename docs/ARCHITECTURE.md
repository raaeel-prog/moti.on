# Arquitetura

## Objetivo

Manter um único produto, embora os hosts usem runtimes diferentes:

- **Premiere Pro:** UXP, JavaScript moderno, chamadas assíncronas e DOM próprio do Premiere.
- **After Effects:** CEP para a interface e ExtendScript para o DOM do aplicativo.
- **Compartilhado:** contrato de mensagens, formatação, regras de negócio puras, textos, temas e, futuramente, cliente de API/licenciamento.

## Fluxo

```text
UI do painel
   │
   ├── Premiere UXP ──> adapter UXP ──> premierepro API
   │
   └── After Effects CEP ──> CSInterface.evalScript ──> adapter ExtendScript ──> app.project

Ambos retornam:
{ ok, data, error }
```

## Separação recomendada quando o produto crescer

```text
packages/
  core/                 regras puras, modelos e validações
  ui/                   componentes e design tokens
  api-client/           autenticação, licença, telemetria opcional
  contracts/            DTOs e envelopes de resposta
apps/
  premiere-uxp/         shell UXP + adapter do Premiere
  after-effects-cep/    shell CEP + adapter ExtendScript
native/
  shared-cpp/           algoritmos nativos compartilhados
  premiere-uxpaddon/    wrapper híbrido, quando necessário
  ae-effect/            wrapper do SDK nativo do After Effects
```

## Quando adicionar C++

Use C++ somente quando houver processamento de frames, áudio, visão computacional, codecs, integração com hardware ou outro trabalho que não deva ficar em JavaScript. Um painel de automação comum não precisa começar nativo.

Se o produto for um **efeito visual**, a arquitetura muda: o núcleo deve nascer em C++ pelo SDK de plug-ins do After Effects, com compatibilidade planejada para Premiere Pro. A interface de painel pode continuar separada.

## Requisitos de produção ainda não implementados neste starter

- autenticação e licença;
- atualização automática ou canal de distribuição;
- assinatura de ZXP/CCX e notarização de binários nativos;
- telemetria com consentimento;
- crash/error reporting;
- localização;
- testes dentro de versões reais dos hosts em Windows e macOS;
- política de migração de dados e configurações;
- documentação de suporte e privacidade.

---

## Estrutura real hoje, e o que ainda não existe

O master spec §7 descreve a árvore de destino completa do monorepo. Este repositório **não** a cria inteira: a §0.5 proíbe deixar placeholder, e um diretório vazio com um `package.json` de uma linha é exatamente isso. Um esqueleto de quatorze packages vazios faria o projeto parecer muito mais adiantado do que está, e o `npm run check` passaria por cima deles sem verificar nada.

A regra é: **cada diretório nasce na issue que primeiro precisa dele, já com conteúdo e teste.**

### Existe agora (CHMS-002)

| Caminho | Conteúdo |
|---|---|
| `apps/premiere-uxp/` | Painel UXP, manifest, adapter do Premiere |
| `apps/after-effects-cep/` | Painel CEP, manifest CSXS, host ExtendScript, tipos |
| `packages/contracts/legacy/` | Envelope de resposta UMD compartilhado pelos dois hosts |
| `packages/ui-core/src/` | CSS do painel |

### Ainda não existe, e a issue que o cria

| Caminho previsto na §7 | Criado por | Por quê ainda não |
|---|---|---|
| `packages/contracts/src/` | CHMS-003 | Tipos, schemas e códigos de erro do protocolo v1 |
| `packages/command-registry/` | CHMS-004 / CHMS-005 | Descriptors e o cliente de comandos |
| `packages/capability-matrix/` | CHMS-006 | Probes e tiers de suporte por host |
| `packages/logging/` | CHMS-007 | Logger, ring buffer e redaction |
| `packages/ui-tokens/` | CHMS-008 | Tokens canônicos gerados |
| `packages/test-fixtures/` | CHMS-005 | Fake do módulo `premierepro` para os testes do adapter |
| `packages/rig-metadata/` | CHMS-009 | O *tipo* nasce em contracts no CHMS-003; o comportamento só no CHMS-009 |
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

### Camada de host do After Effects: por que é JavaScript escrito à mão

O host não é compilado a partir de TypeScript, e isso não é escolha de conveniência. O target `ES3` do `tsc` foi descontinuado no TypeScript 5.0 e removido na 5.5; o esbuild não emite ES3; e no TypeScript 6.0, usado aqui, até `target: "ES5"` passou a emitir `TS5107` como descontinuado, com remoção anunciada para a 7.0 — o mesmo valendo para `module: "None"` e `moduleResolution: "classic"`. Não existe caminho suportado de TypeScript para o subconjunto que o ExtendScript aceita, e a tendência do ecossistema é fechar esse caminho ainda mais.

Mesmo quando o target existia, a saída `ES5` do `tsc` emitia helpers que o ExtendScript não possui — `__extends` usa `Object.setPrototypeOf`. "Saída ES5" nunca foi sinônimo de "saída segura para ExtendScript".

A segurança vem de três verificações independentes:

1. **`apps/after-effects-cep/tsconfig.host.json`** roda `checkJs` sobre os `.jsx` com `lib: ["ES5"]`. É o `lib`, e não o `target`, que remove `Object.keys`, `Array.prototype.map`, `Promise` e `JSON` do que o código pode usar. Os tipos das APIs do After Effects vêm de `host/types/extendscript.d.ts`, declarado deliberadamente parcial: só entra símbolo que o código realmente chama.
2. **`scripts/check-extendscript.mjs`** cobre a sintaxe, que nenhum `lib` alcança: arrow function, `let`, `const`, `class`, template literal, spread, optional chaining. Ele normaliza comentários e literais antes de varrer, e tem teste positivo e negativo próprio em `tests/extendscript-subset.test.mjs` — um scanner sem teste dá falsa sensação de proteção.
3. **`node --check`** sobre o arquivo montado, em `scripts/validate.mjs`.

Para que 1 e 3 sejam possíveis, a diretiva `#target aftereffects` saiu do arquivo-fonte: ela não é JavaScript válido e impedia qualquer parser de ler o host. Agora é emitida por `scripts/build-extendscript.mjs`, exatamente uma vez, no topo do arquivo montado. Esse script também é o mecanismo de concatenação que o CHMS-004 vai usar quando o host virar vários arquivos — o ExtendScript não tem módulos, então a única composição possível é concatenar numa ordem declarada explicitamente, nunca por glob.
