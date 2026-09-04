
---
title: "Master Build Specification — CrossHost Motion Suite"
document_version: "1.0.0"
status: "Implementation-ready"
last_verified: "2026-08-24"
language: "pt-BR"
target_agents:
  - "Claude Code"
  - "OpenAI Codex"
source_repository: "adobe-crosshost-plugin-starter"
temporary_product_code: "CHMS"
---

# Master Build Specification — CrossHost Motion Suite

> **Documento normativo para implementação.** Este arquivo deve ser lido integralmente pelo agente de desenvolvimento antes de alterar o repositório. Ele transforma o escopo funcional em arquitetura, contratos, regras de segurança, critérios de aceite, testes e sequência de execução.
>
> O nome **CrossHost Motion Suite** e o código **CHMS** são temporários. Antes da publicação, substituir marca, namespace, ícones, domínio, identificadores e dados comerciais.

## 0. Ordem obrigatória para Claude Code ou Codex

O agente deve seguir esta ordem:

1. Inspecionar o repositório inteiro, incluindo `README.md`, manifests, scripts, testes e documentação.
2. Executar `npm run check` antes de qualquer alteração e registrar o resultado.
3. Criar uma branch de trabalho e manter a base existente carregável no After Effects e no Premiere Pro.
4. Implementar por fases e por comandos pequenos. Cada pull request deve ser executável, testável e reversível.
5. Nunca deixar `TODO`, botão sem ação, mock silencioso, provider fictício, resposta hardcoded ou tratamento genérico que oculte erro.
6. Nunca usar APIs privadas, QE DOM, menu command não validado ou comportamento dependente de idioma sem um adapter isolado, teste por versão e fallback explícito.
7. Não declarar uma função como concluída apenas porque compila. Ela só está concluída quando passa pelos critérios de aceite deste documento dentro do host real.
8. Não copiar código, interface, presets, identidade visual ou assets proprietários de plugins de referência. O plugin Flow é referência apenas para a ideia de uma curva Bézier editável.
9. Atualizar este documento, o changelog, a matriz de capacidades e os testes sempre que uma decisão de arquitetura mudar.
10. Ao encontrar uma limitação real da API, implementar detecção de capacidade e fallback honesto; jamais simular sucesso.

### Primeiros comandos esperados

```bash
npm install
npm run check
git status
```

Ao migrar para workspaces, os comandos finais obrigatórios serão:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run validate
npm run package:dev
```

---

## 1. Objetivo do produto

Construir uma suíte comercial para **After Effects** e **Premiere Pro** com quatro pilares:

1. **Motion toolkit para After Effects**: expressões, rigs, keyframes, shape layers, composição, parallax e transições.
2. **Biblioteca de assets online**: pesquisa, preview, licenciamento, download, cache e importação.
3. **Legendas automáticas com IA**: leitura de transcrições existentes, transcrição offline, animações dinâmicas e aplicação opcional de SFX.
4. **Fundação de produto**: autenticação, licença, banco de dados, atualização, telemetria opcional, logs, segurança, testes, distribuição e suporte a versões.

O resultado não é um único script. É uma suíte híbrida com shells e adapters específicos para cada host, código compartilhado, backend e módulos nativos opcionais.

---

## 2. Definição operacional de “100% funcional”

Neste projeto, **100% funcional** significa simultaneamente:

- todos os botões visíveis executam uma operação real;
- cada operação valida seleção, tipo de camada, composição/sequência, permissões e versão do host;
- operações destrutivas exibem prévia ou confirmação;
- alterações no projeto entram no histórico de Undo do host como uma ação coerente;
- nenhuma função substitui expressão, keyframe, efeito, parent ou arquivo sem consentimento explícito;
- erros são tipados, legíveis e incluem ação corretiva;
- tarefas longas possuem progresso e cancelamento;
- o plugin não congela a interface em operações previsivelmente longas;
- o plugin funciona em instalações reais, não apenas em testes unitários;
- dados sensíveis não ficam expostos no bundle;
- assets mantêm licença e atribuição;
- funções offline continuam offline;
- funções dependentes de rede falham de forma controlada;
- um comando repetido não duplica rigs acidentalmente quando o modo esperado é “ajustar”;
- cada feature possui testes unitários, testes de contrato e pelo menos um teste dentro do host;
- os pacotes finais são assinados e instaláveis;
- a matriz de compatibilidade publicada corresponde à matriz realmente testada.

**É proibido usar a expressão “100% funcional” no release até todos os gates da seção “Definition of Done” estarem aprovados.**

---

## 3. Normalização do escopo recebido

As seguintes normalizações são obrigatórias:

| Entrada original | Nome canônico | Decisão |
|---|---|---|
| `Radom` | `Random` | Correção de grafia. |
| `Fade ligh` | `Fade Light` | Correção de grafia. |
| `Kinect` | `Kinetic` | No núcleo, será uma animação cinética/overshoot. Integração com sensor Microsoft Kinect será módulo experimental separado e não faz parte do MVP. |
| `Inverse Layer` | `Reverse Layer Order` | Interpretação padrão: inverter a ordem das camadas selecionadas, preservando relações. |
| `AI to Vector` | `Illustrator to Vector` | Interpretação padrão: converter layer proveniente de arquivo `.ai` em shape layer editável. |
| `Clips` como provider | `UNRESOLVED_PROVIDER` | Não há provider inequívoco definido. O primeiro provider de vídeo será Pexels. Só integrar “Clips” quando serviço, API e termos forem identificados. |

### Distribuição por host

| Módulo | After Effects | Premiere Pro | Backend/nativo |
|---|---:|---:|---:|
| Toolkit de animação e layers | Completo | Não aplicável no MVP | — |
| Alinhador de Anchor Point | Completo | — | — |
| Suavizador de keyframes | Completo | Compatível apenas onde a API expuser keyframes | — |
| Parallax avançado | Completo | — | Análise opcional |
| Transições de câmera | Completo | Presets equivalentes poderão ser MOGRT/efeitos em fase posterior | — |
| Assets | Completo | Completo | Obrigatório |
| AI Captions | Completo | Completo | Obrigatório para transcrição offline |
| SFX automáticos | Completo | Completo | Catálogo e regras |
| Licença, releases e feature flags | Completo | Completo | Obrigatório |

---

## 4. Compatibilidade e arquitetura Adobe

### 4.1 After Effects

- Shell principal: **CEP 12 + HTML/CSS/JavaScript + ExtendScript**.
- Target inicial: **After Effects 25.0 ou posterior**, com matriz de testes por versão.
- O código executado no host deve permanecer compatível com o runtime ExtendScript: sintaxe ES3/ES5 restrita, sem `Promise`, arrow function, `let`, `const`, optional chaining ou APIs modernas não garantidas.
- O painel pode usar build moderno, mas o bundle final deve respeitar o Chromium integrado ao CEP 12.
- O onboarding precisa verificar e explicar a preferência **Allow Scripts To Write Files And Access Network** quando uma operação depender de escrita ou rede.
- Não presumir que UXP esteja disponível no After Effects para este produto.

### 4.2 Premiere Pro

- Shell principal: **UXP**.
- Compatibilidade básica: **Premiere Pro 25.6+**.
- Suporte completo recomendado: **Premiere Pro 26.3+**, pois há APIs adicionais de transcrição e caption tracks.
- Módulo nativo híbrido: **Premiere Pro 26.2+**, usando `.uxpaddon`.
- Todas as mutações devem usar o modelo oficial de `Action`, `project.lockedAccess()` e `project.executeTransaction()` quando exigido pela API.
- Proibir QE DOM e qualquer API interna não documentada.

### 4.3 Níveis de suporte

| Nível | Premiere | Comportamento |
|---|---|---|
| Full | 26.3+ | Assets, MOGRTs, transcrição offline, import/export de transcript e recursos adicionais detectados. |
| Compatible | 26.2 | Assets, MOGRTs e addon nativo; transcript conforme APIs disponíveis. |
| Baseline | 25.6–26.1 | Assets, MOGRTs e transcript import/export documentado; sem addon híbrido. |
| Unsupported | <25.6 | Bloquear carregamento ou apresentar mensagem de atualização. |

O plugin deve usar **feature detection**, não apenas comparação de versão.

---

## 5. Estado atual do repositório e estratégia de migração

A base recebida já contém:

```text
src/shared/
src/premiere-uxp/
src/after-effects-cep/
scripts/
tests/
dist/
docs/
.github/workflows/
```

Ela já executa leitura de contexto nos dois hosts e cria uma composição de demonstração no After Effects. Essa base não deve ser descartada.

### Migração obrigatória sem quebra

1. Congelar a versão atual como tag `starter-0.1.0`.
2. Adicionar testes de regressão para os fluxos existentes.
3. Migrar gradualmente para npm workspaces.
4. Manter aliases ou scripts de compatibilidade até o novo build gerar os mesmos artefatos em `dist/`.
5. Só remover a estrutura antiga depois de os dois shells carregarem no host e os testes de instalação passarem.

---

## 6. Arquitetura-alvo

```text
┌─────────────────────────────────────────────────────────────────────┐
│                           UI COMPARTILHADA                           │
│ command palette · tabs · forms · presets · progress · notifications │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ CommandRequest
                    ┌──────────┴──────────┐
                    │ Shared Command Bus  │
                    │ contracts + guards  │
                    └──────────┬──────────┘
                 ┌─────────────┴─────────────┐
                 │                           │
      ┌──────────▼──────────┐     ┌──────────▼──────────┐
      │ AE Host Adapter     │     │ Premiere UXP Adapter│
      │ CEP + ExtendScript  │     │ UXP + Actions       │
      └──────────┬──────────┘     └──────────┬──────────┘
                 │                           │
                 └─────────────┬─────────────┘
                               │ NativeJob / HTTP
              ┌────────────────┴────────────────┐
              │                                 │
   ┌──────────▼──────────┐           ┌──────────▼──────────┐
   │ Native Core         │           │ First-party Backend │
   │ whisper/audio/math  │           │ auth/assets/license │
   │ signed binaries     │           │ styles/releases     │
   └─────────────────────┘           └─────────────────────┘
```

### Princípios

- **Host adapters finos**: apenas validação do contexto e chamada da API Adobe.
- **Regras de negócio compartilhadas**: schemas, presets, nomes, validações e resultados.
- **Offline-first para IA**: mídia não sai da máquina por padrão.
- **Roteamento por política do provider**: Pexels, Unsplash e providers com segredo passam pelo BFF próprio; GIPHY usa chamadas diretas do client quando exigido pelos termos, sem proxy ou caching não aprovado.
- **Permissão mínima**: domínio allowlist, file picker em vez de full access e addon apenas no pacote que precisa dele.
- **Capability-driven UI**: a interface habilita somente o que o host realmente suporta.
- **Reversibilidade**: rigs identificáveis, ajustáveis, “bakeáveis” e removíveis.

---

## 7. Estrutura de monorepo

```text
/
├── apps/
│   ├── after-effects-cep/
│   │   ├── CSXS/manifest.xml
│   │   ├── client/
│   │   ├── host/
│   │   ├── assets/
│   │   └── tests/
│   └── premiere-uxp/
│       ├── manifest.json
│       ├── client/
│       ├── host/
│       ├── assets/
│       └── tests/
├── packages/
│   ├── contracts/
│   ├── command-registry/
│   ├── capability-matrix/
│   ├── ui-core/
│   ├── ui-tokens/
│   ├── expression-library/
│   ├── preset-schema/
│   ├── rig-metadata/
│   ├── keyframe-core/
│   ├── caption-core/
│   ├── asset-sdk/
│   ├── license-client/
│   ├── logging/
│   └── test-fixtures/
├── native/
│   ├── core/
│   │   ├── include/
│   │   ├── src/
│   │   └── tests/
│   ├── premiere-addon/
│   ├── ae-companion/
│   ├── whisper/
│   └── model-manifests/
├── services/
│   ├── api/
│   ├── worker/
│   └── database/
├── presets/
│   ├── ae/
│   ├── expressions/
│   ├── camera-transitions/
│   ├── caption-styles/
│   ├── mogrt/
│   ├── shapes/
│   └── sfx-rules/
├── installers/
│   ├── windows/
│   └── macos/
├── docs/
│   ├── MASTER_BUILD_SPEC.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── PRIVACY.md
│   ├── PROVIDER_COMPLIANCE.md
│   ├── RELEASE.md
│   └── QA_MATRIX.md
├── scripts/
├── tests/
├── package.json
├── package-lock.json
├── AGENTS.md
└── CHANGELOG.md
```

### Ferramentas recomendadas

- npm workspaces;
- TypeScript em código compartilhado e UXP/CEP client;
- JavaScript ES3 restrito no ExtendScript;
- esbuild para bundles;
- ESLint, incluindo regras oficiais do Premiere quando aplicáveis;
- `node:test` ou Vitest para testes unitários;
- JSON Schema/Ajv para contratos;
- CMake + Ninja para C++;
- Fastify + PostgreSQL para backend;
- OpenAPI 3.1 para API;
- S3-compatible object storage para catálogo próprio;
- CI em GitHub Actions e runners próprios para testes Adobe reais.

Não introduzir framework UI pesado até um spike provar compatibilidade nos dois shells. A implementação padrão será **TypeScript + DOM simples + componentes próprios pequenos**, com tokens visuais compartilhados.

---

## 8. Contrato de comandos

Toda função deve ser registrada e chamada por um único dispatcher.

```ts
export type HostId = "after-effects" | "premiere-pro";

export interface CommandRequest<TArgs = unknown> {
  protocolVersion: 1;
  requestId: string;
  command: string;
  args: TArgs;
  context: {
    host: HostId;
    hostVersion: string;
    projectFingerprint?: string;
    activeItemId?: string;
  };
  options?: {
    dryRun?: boolean;
    allowDestructive?: boolean;
    preserveSelection?: boolean;
  };
}

export interface CommandWarning {
  code: string;
  message: string;
  details?: unknown;
}

export interface CommandFailure {
  code: string;
  message: string;
  recoverable: boolean;
  action?: string;
  details?: unknown;
}

export interface CommandResponse<TData = unknown> {
  protocolVersion: 1;
  requestId: string;
  ok: boolean;
  data: TData | null;
  warnings: CommandWarning[];
  error: CommandFailure | null;
  timing?: {
    startedAt: string;
    durationMs: number;
  };
}
```

### Regras do dispatcher

- AE expõe somente `CrossHostAE.dispatch(serializedRequest)`.
- O client CEP nunca concatena código arbitrário em `evalScript`.
- Strings devem ser serializadas e escapadas por uma função testada.
- Payloads grandes, como transcrições, usam arquivos temporários assinados por checksum, não strings gigantes em `evalScript`.
- Premiere registra comandos no mesmo catálogo, mas resolve-os por adapter UXP.
- Cada comando declara `requirements`, `destructive`, `supportsDryRun`, `supportsCancel` e `undoLabel`.
- O resultado nunca retorna `ok: true` quando nenhuma alteração esperada ocorreu.

### Códigos de erro mínimos

```text
NO_ACTIVE_PROJECT
NO_ACTIVE_COMP
NO_ACTIVE_SEQUENCE
NO_SELECTION
INVALID_SELECTION_TYPE
UNSUPPORTED_HOST_VERSION
CAPABILITY_UNAVAILABLE
PERMISSION_DENIED
NETWORK_UNAVAILABLE
PROVIDER_ERROR
LICENSE_REQUIRED
MODEL_NOT_INSTALLED
NATIVE_SERVICE_UNAVAILABLE
INVALID_PRESET
EXPRESSION_CONFLICT
KEYFRAME_CONFLICT
TRACK_CONFLICT
ASSET_LICENSE_BLOCKED
USER_CANCELLED
HOST_OPERATION_FAILED
ROLLBACK_FAILED
INTERNAL_ERROR
```

---

## 9. Matriz de capacidades

Criar um objeto imutável por sessão:

```ts
export interface HostCapabilities {
  host: HostId;
  hostVersion: string;
  hasProject: boolean;
  hasActiveComp?: boolean;
  hasActiveSequence?: boolean;
  canWriteFiles: boolean;
  canAccessNetwork: boolean;
  canUseNativeAddon: boolean;
  canReachCompanion: boolean;
  canInsertMogrt: boolean;
  canReadTranscript: boolean;
  canImportTranscript: boolean;
  canQueryTranscriptLanguages: boolean;
  canReadCaptionTracks: boolean;
  expressionEngine?: "javascript" | "legacy" | "unknown";
}
```

- Executar probe no carregamento e quando projeto/host mudar.
- Cachear apenas por sessão.
- Exibir diagnóstico em **Settings → System Check**.
- Cada botão desabilitado deve explicar exatamente qual requisito falta.
- Nenhuma feature deve depender apenas de `parseFloat(hostVersion)`.

---

## 10. Modelo de transação e Undo

### After Effects

Toda mutação deve usar:

```jsx
function withUndoGroup(label, callback) {
  app.beginUndoGroup(label);
  try {
    return callback();
  } finally {
    app.endUndoGroup();
  }
}
```

Além disso:

- capturar e restaurar seleção, item ativo e CTI quando a função não pretende mudá-los;
- validar tudo antes de abrir o Undo Group;
- evitar centenas de chamadas `evalScript`; executar um comando em uma única transação;
- registrar quais objetos foram criados para rollback interno se ocorrer erro parcial.

### Premiere Pro

- Criar `Action` dentro de `project.lockedAccess()`.
- Executar alterações relacionadas em um único `executeTransaction()`.
- Não guardar referências de Action para uso posterior.
- Preservar seleção e playhead quando não fizer parte do resultado.
- Inserções de MOGRT, clips e SFX devem ser determinísticas e registradas no resultado.

---

## 11. Identificação, metadata e idempotência de rigs

Objetos gerados pela suíte devem carregar metadata versionada.

```ts
export interface RigMetadata {
  schemaVersion: 1;
  rigId: string;
  rigType: string;
  pluginVersion: string;
  createdAt: string;
  controllerLayerUuid?: string;
  memberLayerUuids: string[];
  presetId?: string;
  userOverrides?: Record<string, unknown>;
}
```

### After Effects

- Gerar UUID e armazenar bloco delimitado no comentário da layer sem apagar comentário do usuário.
- Formato:

```text
[CHMS_META_V1]
<base64url-json>
[/CHMS_META_V1]
```

- Se a metadata exceder limite seguro, gravar em sidecar local indexado por projeto e manter apenas `rigId` no comentário.
- Nunca usar somente o nome da layer como identificador.
- O comando **Adjust** localiza o rig por metadata.
- O comando **Clean** remove apenas itens marcados pela suíte, salvo confirmação explícita para conteúdo externo.

### Premiere

- Usar IDs documentados quando disponíveis.
- Manter sidecar por fingerprint do projeto para dados que não cabem no item.
- Não depender de índice de track como identidade persistente.
- MOGRTs devem incluir um campo interno de versão/preset.

---

## 12. Segurança de expressões

- Usar `matchName` para propriedades e efeitos.
- Escapar nomes de layers e controles.
- Evitar referências frágeis por nome quando um controller UUID puder ser resolvido.
- Nunca substituir expressão existente por padrão.
- Modos de conflito:
  - `skip`;
  - `replace-with-backup`;
  - `wrap-when-safe`.
- Guardar a expressão anterior na metadata para restauração.
- Gerar expressões compatíveis com o engine detectado.
- Não usar `eval()` em expressões.
- Cada template recebe snapshot test e teste dentro do After Effects.
- Inserir cabeçalho de versão, com o id do comando que gerou a expressão:

```js
// MOTION_EXPRESSION v1 | ae.expression.wiggle
```

  O prefixo vem de `EXPRESSION_HEADER` em `packages/contracts/src/rig-metadata.ts`
  e não pode ser reescrito aqui: ele já está gravado nos projetos dos usuários, e
  é por ele que o painel reconhece a própria expressão. O texto anterior desta
  linha dizia `CHMS_EXPRESSION v1 | ae.animate.wiggle`, com o prefixo anterior ao
  rebranding e um id que o host nunca registrou — ver a nota do §13.

---

## 13. Catálogo de comandos

| ID | Função | Host | Fase |
|---|---|---|---|
| `ae.animate.parallax.quick` | Parallax — Quick Rig | After Effects | P2 |
| `ae.expression.wiggle` | Wiggle | After Effects | P1 |
| `ae.expression.flicker` | Flicker | After Effects | P1 |
| `ae.style.neon` | Neon | After Effects | P3 |
| `ae.audio.beat` | Beat | After Effects | P5 |
| `ae.text.box` | Text Box | After Effects | P1 |
| `ae.time.controller` | Time | After Effects | P2 |
| `ae.animate.inertial` | Inertial | After Effects | P1 |
| `ae.animate.jump` | Jump | After Effects | P1 |
| `ae.expression.loopout` | LoopOut | After Effects | P1 |
| `ae.expression.smooth` | Smooth | After Effects | P1 |
| `ae.keys.cut` | CutKeys | After Effects | P1 |
| `ae.keys.delay` | Delay | After Effects | P1 |
| `ae.animate.kinetic` | Kinetic | After Effects | P2 |
| `ae.time.marker-loop` | Marker Loop | After Effects | P2 |
| `ae.3d.orbit` | Orbit | After Effects | P2 |
| `ae.3d.look-at` | Look At | After Effects | P2 |
| `ae.rig.effector` | Effector | After Effects | P3 |
| `ae.layer.create-null` | Create Null | After Effects | P1 |
| `ae.keys.copy` | Copy Keys | After Effects | P1 |
| `ae.shape.trim-path` | Trim Path | After Effects | P2 |
| `ae.shape.break` | Break Shape | After Effects | P3 |
| `ae.layer.flip` | Flip | After Effects | P1 |
| `ae.shape.library` | Shapes | After Effects | P2 |
| `ae.vector.text-to-vector` | Text to Vector | After Effects | P4 |
| `ae.vector.ai-to-vector` | Illustrator to Vector | After Effects | P3 |
| `ae.effect.echo` | Echo | After Effects | P2 |
| `ae.3d.cylinder` | Cylinder | After Effects | P3 |
| `ae.effect.glitch` | Glitch | After Effects | P3 |
| `ae.effect.particles` | Particles | After Effects | P4 |
| `ae.asset.texture` | Texture | After Effects | P4 |
| `ae.effect.wave` | Wave | After Effects | P3 |
| `ae.effect.tile` | Tile | After Effects | P3 |
| `ae.3d.cube` | Cube | After Effects | P3 |
| `ae.layer.parent` | Parent Layer | After Effects | P1 |
| `ae.layer.rename` | Rename Layer | After Effects | P1 |
| `ae.layer.reverse-order` | Reverse Layer Order | After Effects | P1 |
| `ae.project.clean` | Clean | After Effects | P4 |
| `ae.comp.fast-edit` | Fast Edit — Composition | After Effects | P2 |

> **Wiggle e Flicker são `ae.expression.*`, e não `ae.animate.*`.** A tabela
> acima já traz os ids corrigidos. O §13 original — e o Addendum A, que é
> anexado sem alterações e travado por hash — catalogam `ae.animate.wiggle` e
> `ae.animate.flicker`; o host registra `ae.expression.wiggle` e
> `ae.expression.flicker` desde a primeira implementação, ao lado de
> `ae.expression.loopout` e `ae.expression.smooth`.
>
> A divergência foi resolvida a favor do código, e não da spec, por um motivo
> concreto: **o id do comando é gravado dentro do projeto do usuário**, no
> cabeçalho `// MOTION_EXPRESSION v1 | <id>` que `expression-templates.jsx`
> escreve em cada expressão gerenciada. É por esse cabeçalho que o painel
> reconhece a própria expressão para oferecer Ajustar e Remover, e para detectar
> conflito com expressão escrita pelo usuário. Renomear o comando faria o painel
> deixar de reconhecer toda expressão já aplicada em todo projeto existente:
> elas passariam a parecer expressão de terceiro, e o Remover pararia de
> funcionar nelas. Um nome mais bonito não paga esse preço.
>
> **Esta tabela é só do After Effects.** Os três comandos do Premiere que já
> existem — `pr.context.read`, `pr.capability.probe` e `pr.diagnostics.selfTest`
> — não estão catalogados em lugar nenhum desta spec: o Premiere aparece como
> arquitetura (§4.2, §22) e como limite de API (§20.3), nunca como catálogo de
> comandos. A lacuna fica registrada aqui e em
> `tests/catalogo-de-comandos.test.mjs`; fechá-la é escrever a seção que falta,
> e não acrescentar linhas `pr.*` a uma tabela que se declara do After Effects.
>
> `tests/catalogo-de-comandos.test.mjs` prende esta tabela ao registro
> executável nas duas direções, para a próxima divergência aparecer no CI em vez
> de numa auditoria manual.

### `ae.animate.parallax.quick` — Parallax — Quick Rig

- **Host:** After Effects
- **Pré-condição/seleção:** Duas ou mais layers 2D/3D em uma composição.
- **Inputs mínimos:** `depthStep, strength, orderMode, createCamera, preserveFraming, controllerName.`
- **Comportamento:** Cria rig 2.5D rápido, converte layers para 3D quando necessário, distribui profundidade, cria câmera e controller e preserva aproximadamente o enquadramento inicial.
- **Implementação obrigatória:** Usar câmera e nulls nativos, compensação de escala pela distância à câmera, metadata de rig e expressões versionadas. Se já existir rig selecionado, entrar em modo Adjust em vez de duplicar.
- **Critério de aceite:** Com três layers de tamanhos diferentes, o primeiro frame permanece visualmente equivalente e o movimento do controller produz profundidade distinta. Um Undo remove todo o rig.

### `ae.expression.wiggle` — Wiggle

- **Host:** After Effects
- **Pré-condição/seleção:** Propriedades numéricas/vetoriais selecionadas; fallback opcional para Position das layers selecionadas.
- **Inputs mínimos:** `frequency, amplitude, seed, dimensions, temporalPhase, posterizeFps, conflictMode.`
- **Comportamento:** Aplica wiggle controlável e reprodutível. Deve oferecer frequência/amplitude separadas e seed estável.
- **Implementação obrigatória:** Criar sliders/angle controls em controller opcional e expressão com `seedRandom`. Tratar dimensões separadas e rejeitar propriedades não interpoláveis. Preservar expressão existente conforme conflictMode.
- **Critério de aceite:** Mesmos inputs e seed geram o mesmo movimento após reabrir o projeto; valores não excedem limites específicos da propriedade quando configurados.

### `ae.expression.flicker` — Flicker

- **Host:** After Effects
- **Pré-condição/seleção:** Layers ou propriedades Opacity/Exposure/Glow Intensity.
- **Inputs mínimos:** `mode, frequency, minValue, maxValue, seed, holdFrames, probability.`
- **Comportamento:** Gera flicker em modos noise, random-hold e strobe, com limites claros e preview.
- **Implementação obrigatória:** Expressão ou keyframes baked. Clampar resultados; usar seed deterministicamente; não aplicar valores negativos onde inválidos.
- **Critério de aceite:** O modo hold mantém valor pelo número de frames informado e Bake reproduz o preview dentro da tolerância de amostragem.

### `ae.style.neon` — Neon

- **Host:** After Effects
- **Pré-condição/seleção:** Text layers, shape layers ou footage com alpha.
- **Inputs mínimos:** `mode, coreColor, glowColor, strokeWidth, glowRadius, intensity, flicker, precompose.`
- **Comportamento:** Cria aparência neon editável com núcleo, stroke e glow, mantendo a fonte editável quando possível.
- **Implementação obrigatória:** Preferir efeitos nativos por matchName e shape strokes. Stack mode pode duplicar layers identificadas. Não rasterizar texto sem opção explícita.
- **Critério de aceite:** Alterar o texto original atualiza o neon no modo editável; Clean remove apenas as layers auxiliares do rig.

### `ae.audio.beat` — Beat

- **Host:** After Effects
- **Pré-condição/seleção:** Uma layer com áudio ou um arquivo de áudio selecionado no projeto.
- **Inputs mínimos:** `analysisRange, sensitivity, minIntervalMs, bpmRange, outputMarkers, outputSlider, subdivision.`
- **Comportamento:** Analisa onsets/BPM e cria markers e/ou keyframes de amplitude normalizada.
- **Implementação obrigatória:** Usar o native audio analyzer. Não depender de `app.executeCommand` localizado. A análise ocorre fora do Undo; somente a escrita dos resultados entra em um Undo Group.
- **Critério de aceite:** Fixture de áudio conhecida produz markers dentro de uma tolerância de um frame; cancelamento não altera o projeto.

### `ae.text.box` — Text Box

- **Host:** After Effects
- **Pré-condição/seleção:** Uma ou mais text layers.
- **Inputs mínimos:** `paddingX, paddingY, roundness, fill, stroke, anchorMode, multilineMode, createPerLayer.`
- **Comportamento:** Cria caixa de shape responsiva atrás do texto e acompanha `sourceRectAtTime`.
- **Implementação obrigatória:** Shape rectangle com Size/Position dirigidos por expressão, parent preservando transform e ordem logo abaixo do texto. Tratar baseline, multiline e texto vazio.
- **Critério de aceite:** Alterar conteúdo, fontSize e alinhamento mantém padding visual. A caixa não salta ao primeiro caractere em animação de texto.

### `ae.time.controller` — Time

- **Host:** After Effects
- **Pré-condição/seleção:** Footage/precomps ou propriedades animadas.
- **Inputs mínimos:** `offsetFrames, speedPercent, reverse, freeze, freezeFrame, applyTo.`
- **Comportamento:** Adiciona um controlador unificado de tempo: offset, velocidade, reverse e freeze.
- **Implementação obrigatória:** Para AV layers, habilitar Time Remap de forma segura. Para propriedades, usar `valueAtTime()`. Não combinar automaticamente com Time Remap existente sem consentimento.
- **Critério de aceite:** Speed 50% dobra a duração aparente; Reverse preserva in/out; remover o rig restaura o estado anterior salvo.

### `ae.animate.inertial` — Inertial

- **Host:** After Effects
- **Pré-condição/seleção:** Propriedades temporais numéricas/vetoriais com keyframes.
- **Inputs mínimos:** `amplitude, frequency, decay, maxDuration, startMode.`
- **Comportamento:** Adiciona overshoot/inércia após mudanças de velocidade ou após o último keyframe.
- **Implementação obrigatória:** Expressão baseada em velocity/último keyframe, protegida para zero keys, hold keys e dimensões. Clampar valores opcionais.
- **Critério de aceite:** Não gera NaN antes do primeiro keyframe e converge para o valor final no limite configurado.

### `ae.animate.jump` — Jump

- **Host:** After Effects
- **Pré-condição/seleção:** Layers 2D/3D.
- **Inputs mínimos:** `height, durationFrames, direction, squashStretch, anticipation, stagger.`
- **Comportamento:** Cria salto com arco, antecipação e squash/stretch opcionais ao redor do CTI.
- **Implementação obrigatória:** Gerar keyframes de Position e Scale em propriedades compatíveis. Considerar orientação do chão e parent transformations.
- **Critério de aceite:** A layer começa e termina no mesmo ponto; a altura máxima e duração correspondem aos inputs em 24/30/60 fps.

### `ae.expression.loopout` — LoopOut

- **Host:** After Effects
- **Pré-condição/seleção:** Propriedades com ao menos dois keyframes, exceto modo continue.
- **Inputs mínimos:** `type, numKeyframes, duration, useDuration, conflictMode.`
- **Comportamento:** Aplica `loopOut` cycle, pingpong, offset ou continue com escopo configurável.
- **Implementação obrigatória:** Template de expressão versionado e validação de keys. Mostrar preview da expressão e backup da anterior.
- **Critério de aceite:** Cada modo passa por fixture com valores escalares e vetoriais; propriedades sem keys são recusadas com mensagem útil.

### `ae.expression.smooth` — Smooth

- **Host:** After Effects
- **Pré-condição/seleção:** Propriedades temporais compatíveis.
- **Inputs mínimos:** `widthSeconds, samples, referenceTime, conflictMode.`
- **Comportamento:** Aplica suavização temporal por expressão sem alterar os keyframes originais.
- **Implementação obrigatória:** Usar `smooth()` com limites de samples e width. Não aplicar em TextDocument, markers ou propriedades discretas.
- **Critério de aceite:** A saída reduz variação em fixture ruidosa e a remoção restaura a expressão anterior.

### `ae.keys.cut` — CutKeys

- **Host:** After Effects
- **Pré-condição/seleção:** Propriedades com keyframes.
- **Inputs mínimos:** `rangeMode, startTime, endTime, includeBoundary, previewOnly.`
- **Comportamento:** Remove keyframes antes/depois do CTI, dentro/fora do work area ou entre markers.
- **Implementação obrigatória:** Primeiro calcular e exibir contagem; exigir `allowDestructive`. Remover em ordem decrescente de índice.
- **Critério de aceite:** Preview e execução retornam a mesma contagem; boundary behavior é testado em todos os modos.

### `ae.keys.delay` — Delay

- **Host:** After Effects
- **Pré-condição/seleção:** Duas ou mais layers ou propriedades com keyframes.
- **Inputs mínimos:** `delayFrames, order, reverse, randomSeed, spatialOrigin, shiftMode.`
- **Comportamento:** Escalona layer start times ou grupos de keyframes preservando o timing interno.
- **Implementação obrigatória:** Ordenação por índice, seleção, nome, distância ou random determinístico. `shiftMode` diferencia startTime de keyframes.
- **Critério de aceite:** A distância temporal entre keys de cada propriedade não muda e Random repete a ordem com o mesmo seed.

### `ae.animate.kinetic` — Kinetic

- **Host:** After Effects
- **Pré-condição/seleção:** Text layers ou layers visuais.
- **Inputs mínimos:** `direction, duration, overshoot, rotation, scale, opacity, stagger, splitMode.`
- **Comportamento:** Cria entrada/saída cinética com overshoot e stagger; para texto, pode operar por palavra, linha ou caractere.
- **Implementação obrigatória:** Text animators quando possível; layers auxiliares apenas quando necessário. Não se trata de captura Kinect.
- **Critério de aceite:** Texto editável permanece editável e o split mode selecionado mantém a leitura e o timing.

### `ae.time.marker-loop` — Marker Loop

- **Host:** After Effects
- **Pré-condição/seleção:** Footage ou precomp layer.
- **Inputs mínimos:** `inMarkerName, outMarkerName, loopType, autoCreateMarkers, clampToLayer.`
- **Comportamento:** Cria loop de Time Remap delimitado por markers, em cycle ou pingpong.
- **Implementação obrigatória:** Habilitar Time Remap, localizar markers por nome e aplicar expressão robusta. Não apagar markers do usuário.
- **Critério de aceite:** Mover `LOOP_IN`/`LOOP_OUT` altera o loop imediatamente; frames de borda não duplicam de forma visível.

### `ae.3d.orbit` — Orbit

- **Host:** After Effects
- **Pré-condição/seleção:** Layers 3D ou conversíveis.
- **Inputs mínimos:** `radius, speed, inclination, phase, targetMode, faceTarget, bake.`
- **Comportamento:** Faz layers orbitarem um alvo 3D com controller comum.
- **Implementação obrigatória:** Rig de null 3D e expressões de posição/orientação. Distribuição de fase opcional por índice.
- **Critério de aceite:** Raio permanece constante em fixture sem parent e Bake mantém trajetória dentro de tolerância subpixel.

### `ae.3d.look-at` — Look At

- **Host:** After Effects
- **Pré-condição/seleção:** Layers 3D ou câmera.
- **Inputs mínimos:** `targetLayer, forwardAxis, upAxis, offsetOrientation, constrainAxes.`
- **Comportamento:** Orienta layer/câmera para um alvo com correção de eixo.
- **Implementação obrigatória:** Expressão baseada em `lookAt()` e matrizes, com proteção quando alvo coincide com origem.
- **Critério de aceite:** Cada eixo frontal suportado aponta para o alvo em posições de teste e não gera NaN.

### `ae.rig.effector` — Effector

- **Host:** After Effects
- **Pré-condição/seleção:** Layers, text animators ou shape groups.
- **Inputs mínimos:** `effectorType, radius, falloffCurve, positionAmount, scaleAmount, rotationAmount, opacityAmount.`
- **Comportamento:** Aplica influência por distância em relação a um null/point controller.
- **Implementação obrigatória:** Controller com sliders e expressão de distância. Curvas linear, smoothstep e custom Bézier.
- **Critério de aceite:** Dentro do raio a influência segue a curva; fora do raio retorna exatamente ao valor base.

### `ae.layer.create-null` — Create Null

- **Host:** After Effects
- **Pré-condição/seleção:** Zero ou mais layers.
- **Inputs mínimos:** `placement, dimension, parentSelected, preserveWorldTransform, size, label.`
- **Comportamento:** Cria null no centro da composição, CTI, anchor médio ou bounds das layers; opcionalmente parenta seleção.
- **Implementação obrigatória:** Resolver bounds e transform matrices. Detectar ciclo de parent e preservar world transform.
- **Critério de aceite:** Parentar layers rotacionadas/escaladas não altera sua posição visual inicial.

### `ae.keys.copy` — Copy Keys

- **Host:** After Effects
- **Pré-condição/seleção:** Keyframes selecionados em propriedades compatíveis.
- **Inputs mínimos:** `pasteTime, mappingMode, relativeTiming, includeExpressions, includeTangents.`
- **Comportamento:** Copia e cola valores, interpolation, ease, tangents, roving e timing relativo.
- **Implementação obrigatória:** Clipboard interno JSON versionado; mapear por matchName e dimensão. Não depender do clipboard do sistema.
- **Critério de aceite:** Round-trip de keyframes mantém valores/eases/tangents dentro de tolerância e informa incompatibilidades por propriedade.

### `ae.shape.trim-path` — Trim Path

- **Host:** After Effects
- **Pré-condição/seleção:** Shape layers ou grupos selecionados.
- **Inputs mínimos:** `scope, start, end, offset, animate, durationFrames, reverse.`
- **Comportamento:** Adiciona ou ajusta Trim Paths e pode criar reveal animado no CTI.
- **Implementação obrigatória:** Usar matchNames de shape operators e evitar duplicação se operador CHMS já existir.
- **Critério de aceite:** Funciona com múltiplos grupos e o modo Adjust altera o operador existente.

### `ae.shape.break` — Break Shape

- **Host:** After Effects
- **Pré-condição/seleção:** Uma ou mais shape layers.
- **Inputs mínimos:** `recursive, keepOriginal, preserveAppearance, namingMode.`
- **Comportamento:** Separa grupos de shape em layers independentes, mantendo aparência, ordem e transform.
- **Implementação obrigatória:** Copiar contents e compor matrizes de Group Transform + Layer Transform. Tratar fills/strokes compartilhados.
- **Critério de aceite:** Comparação visual before/after em fixture fica dentro de 1 px de diferença e Undo restaura a original.

### `ae.layer.flip` — Flip

- **Host:** After Effects
- **Pré-condição/seleção:** Layers ou shape paths.
- **Inputs mínimos:** `axis, pivot, groupMode, preserveTextReadability.`
- **Comportamento:** Espelha horizontal/vertical em torno do anchor, bounds da seleção ou centro da comp.
- **Implementação obrigatória:** Para layers, combinar scale/position preservando pivot. Para paths, refletir vertices e tangents.
- **Critério de aceite:** Flip duplo retorna ao estado inicial dentro de tolerância numérica.

### `ae.shape.library` — Shapes

- **Host:** After Effects
- **Pré-condição/seleção:** Composição ativa.
- **Inputs mínimos:** `shapeType, size, fill, stroke, roundness, points, position, saveAsPreset.`
- **Comportamento:** Cria biblioteca de formas vetoriais editáveis: circle, rectangle, rounded rectangle, polygon, star, line, arrow e callout.
- **Implementação obrigatória:** Somente shape operators nativos; presets JSON versionados e sem assets proprietários.
- **Critério de aceite:** Cada shape é editável e mantém controles no controller ou no próprio grupo.

### `ae.vector.text-to-vector` — Text to Vector

- **Host:** After Effects
- **Pré-condição/seleção:** Text layers.
- **Inputs mínimos:** `keepOriginal, splitGroups, preserveStyles, conversionEngine.`
- **Comportamento:** Converte texto em outlines de shape, mantendo o original oculto por padrão.
- **Implementação obrigatória:** Preferir método documentado do host quando disponível. Fallback de produção: serviço nativo com HarfBuzz/FreeType e escrita de paths. Um command bridge de menu só pode ser usado se validado por host/idioma e protegido por capability.
- **Critério de aceite:** Fixtures de fontes autorizadas ficam visualmente equivalentes em 100% zoom; kerning, múltiplas linhas e alinhamento são testados.

### `ae.vector.ai-to-vector` — Illustrator to Vector

- **Host:** After Effects
- **Pré-condição/seleção:** AV layers cujo source é arquivo Illustrator compatível.
- **Inputs mínimos:** `keepOriginal, hideOriginal, explodeGroups, namingMode.`
- **Comportamento:** Cria shape layer a partir da layer Illustrator e mantém source original recuperável.
- **Implementação obrigatória:** Encapsular a conversão em `VectorConversionAdapter`. Usar uma API de scripting documentada somente se a Adobe a expuser e a capability confirmar. Enquanto a conversão existir apenas como comando de UI, usar `app.executeCommand()` com command ID whitelisted, mapeado e validado por versão/idioma, restaurando seleção; se o command não puder ser resolvido com segurança, bloquear antes de alterar o projeto.
- **Critério de aceite:** Uma layer `.ai` com fills, strokes e grupos simples converte sem deslocamento e mantém original oculto.

### `ae.effect.echo` — Echo

- **Host:** After Effects
- **Pré-condição/seleção:** Layers visuais.
- **Inputs mínimos:** `echoTime, numberOfEchoes, startingIntensity, decay, operator, animate.`
- **Comportamento:** Aplica e controla o efeito Echo com presets visuais.
- **Implementação obrigatória:** Resolver efeito nativo por matchName, criar controles e registrar valores anteriores.
- **Critério de aceite:** Preset pode ser ajustado e removido sem apagar efeitos preexistentes.

### `ae.3d.cylinder` — Cylinder

- **Host:** After Effects
- **Pré-condição/seleção:** Uma ou mais layers; uma layer pode ser duplicada N vezes.
- **Inputs mínimos:** `radius, height, count, faceMode, startAngle, arcDegrees, createCamera.`
- **Comportamento:** Distribui layers em superfície cilíndrica 3D com master controller.
- **Implementação obrigatória:** Posição trigonométrica, orientação inward/outward e metadata. Preservar fontes editáveis.
- **Critério de aceite:** Count layers ficam uniformemente distribuídas no arco e Adjust modifica raio sem recriação.

### `ae.effect.glitch` — Glitch

- **Host:** After Effects
- **Pré-condição/seleção:** Layers ou composição.
- **Inputs mínimos:** `mode, intensity, frequency, rgbSplit, displacement, frameHold, seed, duration.`
- **Comportamento:** Cria glitch contínuo ou one-shot usando apenas efeitos nativos e layers auxiliares marcadas.
- **Implementação obrigatória:** Adjustment layer/precomp, displacement, channel separation e timing controlados. Resolver efeitos por matchName e fornecer fallback.
- **Critério de aceite:** Desativar o controller zera o efeito e Clean remove o rig sem tocar outras adjustment layers.

### `ae.effect.particles` — Particles

- **Host:** After Effects
- **Pré-condição/seleção:** Composição ou layer emitter.
- **Inputs mínimos:** `preset, birthRate, longevity, velocity, gravity, particleSize, color, emitterMode.`
- **Comportamento:** Cria rig de partículas com presets básicos e emitter editável.
- **Implementação obrigatória:** Usar efeito nativo/bundled detectado por capability. Não exigir plugin de terceiros. Fallback simples de shape emitters apenas para presets suportados.
- **Critério de aceite:** Se o efeito requerido não existir, a UI bloqueia antes de alterar o projeto e informa requisito exato.

### `ae.asset.texture` — Texture

- **Host:** After Effects
- **Pré-condição/seleção:** Composição/layers e asset local ou online.
- **Inputs mínimos:** `assetIdOrPath, fitMode, blendMode, opacity, tint, loop, tile, applyAs.`
- **Comportamento:** Importa e aplica textura como overlay, matte ou displacement source.
- **Implementação obrigatória:** Usar asset pipeline, sidecar de licença, cache com checksum e importação idempotente.
- **Critério de aceite:** Reaplicar o mesmo asset reutiliza o footage item/cache e mantém attribution ledger.

### `ae.effect.wave` — Wave

- **Host:** After Effects
- **Pré-condição/seleção:** Layers, shape layers ou propriedades.
- **Inputs mínimos:** `mode, amplitude, frequency, speed, direction, phase, falloff.`
- **Comportamento:** Cria ondulação por efeito visual ou por movimento transform.
- **Implementação obrigatória:** Modo effect usa efeito nativo detectado; modo transform usa expressão. Paths avançados usam amostragem controlada.
- **Critério de aceite:** Amplitude zero retorna exatamente à aparência original; Bake mantém o movimento.

### `ae.effect.tile` — Tile

- **Host:** After Effects
- **Pré-condição/seleção:** Layers visuais.
- **Inputs mínimos:** `mode, outputWidth, outputHeight, mirrorEdges, gridRows, gridColumns, spacing.`
- **Comportamento:** Expande bordas por efeito ou cria grade real de duplicatas.
- **Implementação obrigatória:** Effect mode com Motion Tile/CC RepeTile por capability; grid mode com rig e metadata.
- **Critério de aceite:** Aumentar output size não cria seam em fixture com mirror e Adjust atualiza o rig existente.

### `ae.3d.cube` — Cube

- **Host:** After Effects
- **Pré-condição/seleção:** Seis layers ou uma layer para duplicação.
- **Inputs mínimos:** `size, sourceMode, faceFit, createCamera, controllerOrientation, keepSources.`
- **Comportamento:** Monta cubo 3D com seis faces, controller e câmera opcional.
- **Implementação obrigatória:** Precomps por face quando necessário, posicionamento ±size/2 e orientação correta.
- **Critério de aceite:** As faces se encontram sem gaps em fixture quadrada e o controller gira o conjunto como unidade.

### `ae.layer.parent` — Parent Layer

- **Host:** After Effects
- **Pré-condição/seleção:** Layers filhas e uma layer alvo explícita.
- **Inputs mínimos:** `targetLayer, preserveWorldTransform, unparent, chainMode.`
- **Comportamento:** Parenta/desparenta em lote sem alterar aparência e impede ciclos.
- **Implementação obrigatória:** Matriz de transform e validação de hierarchy. Não assumir que a última layer selecionada é alvo sem opção UI clara.
- **Critério de aceite:** World transform antes/depois é equivalente para 2D, 3D e parents aninhados.

### `ae.layer.rename` — Rename Layer

- **Host:** After Effects
- **Pré-condição/seleção:** Layers selecionadas ou composição.
- **Inputs mínimos:** `scope, prefix, suffix, find, replace, regex, counterStart, padding, sourceName, preview.`
- **Comportamento:** Renomeia em lote com preview e regras combináveis.
- **Implementação obrigatória:** Regex validada, contador determinístico e escape. Renomear source/project item somente por opção separada.
- **Critério de aceite:** Preview lista exatamente os nomes finais e Undo restaura todos os nomes.

### `ae.layer.reverse-order` — Reverse Layer Order

- **Host:** After Effects
- **Pré-condição/seleção:** Duas ou mais layers.
- **Inputs mínimos:** `scope, preserveTrackMattes, preserveParents, reverseTimingToo.`
- **Comportamento:** Inverte a ordem de stack das layers; timing só muda se checkbox explícito.
- **Implementação obrigatória:** Mover layers de forma estável, revalidar matte/parent e abortar antes da mutação quando não for possível preservar relações.
- **Critério de aceite:** Ordem é invertida e referências permanecem válidas em fixtures com parent e track matte.

### `ae.project.clean` — Clean

- **Host:** After Effects
- **Pré-condição/seleção:** Projeto, composição ou rigs selecionados.
- **Inputs mínimos:** `scanOnly, orphanedChmsObjects, emptyShapeGroups, brokenExpressions, unusedFootage, missingFiles, removeConfirmed.`
- **Comportamento:** Audita primeiro e remove apenas itens escolhidos. Padrão é scan-only.
- **Implementação obrigatória:** Classificar findings por risco e origem. Nunca apagar conteúdo não marcado pela suíte automaticamente.
- **Critério de aceite:** Scan não altera projeto; remoção exige seleção explícita e gera relatório de objetos removidos.

### `ae.comp.fast-edit` — Fast Edit — Composition

- **Host:** After Effects
- **Pré-condição/seleção:** Composição ativa.
- **Inputs mínimos:** `operation, duration, frameRate, width, height, workArea, cropBounds, shiftToZero, precomposeOptions.`
- **Comportamento:** Centraliza operações rápidas: trim comp to work area, duração, fps, resolução, crop to selected bounds, fit layers, shift layers to zero e precompose.
- **Implementação obrigatória:** Cada operação é um subcomando com dry-run e validação. Não combinar mudanças sem resumo.
- **Critério de aceite:** Cada subcomando possui fixture; crop e shift preservam aparência no frame inicial.

---

## 14. Alinhador de Anchor Point

### 14.1 Comando

```text
ae.anchor.align
```

### 14.2 Interface

- grade 3×3;
- modos `Normal`, `Reverse`, `Convex`, `Concave`, `Random`;
- source de bounds: visual, source, mask, shape path ou seleção;
- CTI atual ou tempo fixo;
- checkbox `Preserve visual position`;
- seed para Random;
- botão `Preview` e botão `Apply`.

### 14.3 Semântica exata dos modos

#### Normal

Move o anchor para um dos nove pontos do bounds calculado:

```text
top-left     top-center     top-right
mid-left     center         mid-right
bottom-left  bottom-center  bottom-right
```

#### Reverse

Usa o ponto oposto ao escolhido em relação ao centro. Exemplo: top-left torna-se bottom-right.

#### Convex

Para shape/mask path:

1. calcular o convex hull dos vertices no tempo atual;
2. filtrar o quadrante/direção correspondente ao ponto da grade;
3. escolher o vertex extremo mais distante do centroid;
4. se não houver path, usar o extremo do visual bounds e emitir warning `CONVEX_FALLBACK_TO_BOUNDS`.

#### Concave

Para shape/mask path:

1. identificar vertices côncavos pelo sinal do cross product em relação à winding;
2. filtrar pelo quadrante escolhido;
3. selecionar o vertex côncavo com maior profundidade em relação ao convex hull;
4. se não houver concavidade, usar o ponto do bounds mais próximo e emitir warning `NO_CONCAVE_VERTEX`.

#### Random

Escolhe um candidato válido de forma determinística usando `seed`. Candidatos podem ser os nove pontos do bounds ou vertices do path conforme source escolhido.

### 14.4 Cálculo de bounds

- Text e Shape: `sourceRectAtTime()` quando aplicável;
- AVLayer: dimensão do source, máscaras e transforms;
- múltiplas layers: união em comp space;
- shape group: considerar Group Transform;
- parent hierarchy: matriz completa;
- collapsed transformations/continuous rasterization: testar e informar limitação quando a API não permitir precisão;
- incluir stroke/extents apenas quando `includeExtents=true`.

### 14.5 Preservação visual

Mover o anchor altera a origem do transform. Para manter a aparência:

1. calcular delta antigo→novo em layer space;
2. transformar o vetor pela matriz de scale/rotation/orientation e parents;
3. compensar Position;
4. para Position com dimensões separadas, gravar componentes;
5. para layers 3D, usar matriz 4×4 e preservar world transform.

Não usar expressão temporária em produção se a mesma operação puder ser resolvida por matriz.

### 14.6 Aceite

- 2D simples;
- layer rotacionada;
- scale negativo;
- parent com scale/rotation;
- text alinhado à esquerda/centro/direita;
- shape group com transform;
- layer 3D parentada;
- múltiplas layers;
- paths convexos e côncavos;
- Random reprodutível;
- um Undo para toda a seleção;
- diferença visual máxima: 0,5 px em fixtures 2D e tolerância documentada em 3D.

---

## 15. Suavizador de keyframes com curva editável

### 15.1 Objetivo

Criar uma experiência semelhante ao conceito de editores de easing por curva, sem copiar o Flow. O usuário manipula uma curva cúbica Bézier e aplica o resultado aos keyframes selecionados.

### 15.2 Comandos

```text
ae.keys.ease.apply
ae.keys.ease.save-preset
ae.keys.ease.delete-preset
ae.keys.duplicate
ae.keys.reverse
ae.keys.duplicate-reverse
ae.keys.duplicate-reverse-move-end
ae.keys.send-start
ae.keys.send-end
```

### 15.3 Modelo da curva

```ts
export interface CubicBezierCurve {
  x1: number; // 0..1
  y1: number; // pode exceder 0..1 para overshoot
  x2: number; // 0..1
  y2: number; // pode exceder 0..1
}
```

- canvas/SVG com handles arrastáveis;
- inputs numéricos;
- grid e preview de movimento;
- presets: Linear, Ease, Ease In, Ease Out, Ease In Out, Expo, Back, Elastic aproximado;
- histórico Undo/Redo apenas da UI;
- salvar preset local e sincronizar com conta opcionalmente;
- acessível por teclado.

### 15.4 Conversão para KeyframeEase

Para um segmento de duração `dt` e diferença de valor `dv`:

```text
outSlope = y1 / x1
inSlope  = (1 - y2) / (1 - x2)

outSpeed = outSlope * dv / dt
inSpeed  = inSlope  * dv / dt

outInfluence = clamp(x1 * 100, 0.1, 100)
inInfluence  = clamp((1 - x2) * 100, 0.1, 100)
```

Regras:

- calcular por dimensão;
- `dt <= 0` é erro;
- `dv == 0` usa speed 0 e mantém influence;
- aplicar `BEZIER` apenas onde suportado;
- keyframes Hold são convertidos somente após confirmação;
- spatial tangents não mudam por padrão;
- roving keyframes são preservados;
- propriedades discretas são recusadas;
- selecionar um único keyframe aplica easing de entrada/saída conforme contexto e UI.

### 15.5 Operações de keyframe

#### Duplicar

Duplica o conjunto selecionado mantendo intervalos. Destino padrão: primeiro key copiado no CTI; opção: após último key selecionado.

#### Inverter

Inverte a ordem temporal dos keyframes dentro do intervalo, mantendo os timestamps do intervalo. Valores, interpolation, ease e tangents acompanham seus keyframes.

#### Duplicar + Inverter

Cria uma cópia reversa imediatamente após o último key selecionado, evitando duplicar o key de fronteira quando isso produzir frame repetido.

#### Duplicar + Inverter + Mover para final da timeline

Cria a cópia reversa e desloca o grupo para que o último key termine no final da composição ou no outPoint da layer, conforme opção.

#### Enviar ao começo

Desloca o grupo para que o primeiro key fique em `0`, no inPoint da layer ou no início do work area.

#### Enviar ao final

Desloca o grupo para que o último key fique no fim da composição, outPoint ou fim do work area.


#### Onde cada operação da §15.5 vive

| Operação da §15.5                    | Comando                                          |
|--------------------------------------|--------------------------------------------------|
| Duplicar                             | `ae.keys.clone` com `mode: "repeat"`             |
| Inverter                             | `ae.keys.reverse`                                |
| Duplicar + Inverter                  | `ae.keys.clone` com `mode: "mirror"`             |
| Enviar ao começo                     | `ae.keys.send-to-edge` com `edge: "start"`       |
| Enviar ao final                      | `ae.keys.send-to-edge` com `edge: "end"`         |
| Duplicar + Inverter + Mover ao final  | **ausente** — ver abaixo                        |

`ae.keys.send-to-edge` implementa as duas últimas linhas num comando só porque
elas são a mesma conta com o sinal trocado, e o argumento `reference`
(`comp` \| `layer` \| `workArea`) cobre as três âncoras que o texto da §15.5
enumera. O grupo se move rígido, que é o "relative timing" da §15.6, e o comando
recusa com `KEYFRAME_CONFLICT` — **antes** de escrever — quando o deslocamento
cruzaria um keyframe não selecionado.

A composição "Duplicar + Inverter + Mover para o final" continua ausente de
propósito: ela é `ae.keys.clone` seguido de `ae.keys.send-to-edge`, e encadear
os dois no host produziria **dois** grupos de Undo para um pedido só, o que o §8
proíbe. Fazê-la direito exige um comando composto que abra um Undo e chame as
duas rotinas internamente — trabalho que só vale depois que o painel tiver um
lugar para operações compostas.

### 15.6 Dados preservados

- value;
- in/out temporal interpolation;
- in/out temporal ease;
- temporal continuous;
- temporal auto Bézier;
- spatial continuous/auto Bézier;
- in/out spatial tangents;
- roving;
- key label quando a versão do host expuser;
- relative timing.

### 15.7 Aceite

- scalar, 2D, 3D e color;
- dimensões separadas;
- keys lineares, hold e Bézier;
- spatial properties;
- grupo em múltiplas propriedades/layers;
- curvas com overshoot;
- operações no primeiro/último frame;
- nenhum key perdido por colisão sem warning;
- preview de curva corresponde visualmente ao easing aplicado;
- um Undo por operação.

---

## 16. Parallax avançado

### 16.1 Subcomandos

```text
ae.parallax.create
ae.parallax.auto-focus
ae.parallax.wiggle
ae.parallax.create-null
ae.parallax.set-focus
ae.parallax.zoom
ae.parallax.bake
ae.parallax.adjust
ae.parallax.remove
```

### 16.2 Rig padrão

```text
CHMS | PARALLAX | MASTER
CHMS | PARALLAX | CAMERA
CHMS | PARALLAX | CAMERA RIG
CHMS | PARALLAX | TARGET
CHMS | PARALLAX | FOCUS
<member layers>
```

Controles mínimos:

- Depth Strength;
- Camera X/Y/Z;
- Target X/Y/Z;
- Focus Distance;
- Aperture;
- Blur Level;
- Zoom;
- Wiggle Frequency;
- Wiggle Position;
- Wiggle Rotation;
- Layer Depth Step;
- Preserve Scale.

### 16.3 Create

- aceitar layers já separadas ou um conjunto preparado;
- converter para 3D;
- distribuir Z por ordem, luminance/depth map opcional ou valores manuais;
- criar câmera coerente com comp;
- compensar scale para preservar tamanho inicial;
- gerar metadata por member layer;
- não mover layers bloqueadas sem desbloqueio explícito.

### 16.4 Auto Focus

- alvo pode ser layer, null ou ponto 3D;
- dirigir `focusDistance` pela distância câmera→alvo;
- suportar smoothing;
- se Depth of Field estiver desligado, oferecer habilitar.

### 16.5 Wiggle

Wiggle específico do rig, separado do Wiggle genérico:

- posição da camera rig;
- orientação/point of interest;
- seed;
- frequência/amplitude;
- opção handheld com noise de baixa frequência.

### 16.6 Null

Cria ou repara controller/master null e reconecta membros por UUID.

### 16.7 Focus

Define target/focus atual. Deve aceitar layer selecionada e preservar o master controller.

### 16.8 Zoom

- modo Camera Zoom;
- modo Dolly Z;
- keyframes ao redor do CTI;
- compensação opcional para manter foco.

### 16.9 Bake

- intervalo: work area, layer span ou custom;
- step em frames;
- amostrar propriedades com expressão;
- gravar keys;
- remover expressão;
- opção remover controllers somente se não houver dependências;
- mostrar estimativa de quantidade de keys;
- cancelável antes da escrita; durante escrita, rollback se ocorrer erro.

### 16.10 Adjust

Localiza rig existente por metadata e preenche a UI. Nunca cria novo rig silenciosamente.

### 16.11 Aceite

- 2, 5 e 20 layers;
- 16:9, vertical e resolução custom;
- câmera existente;
- parent hierarchy;
- Depth of Field;
- Bake em 24/25/30/60 fps;
- reabrir projeto e ajustar;
- duplicar composição sem colisão de UUID;
- remoção restaura members conforme backup.

---

## 17. Presets de transição de câmera

### 17.1 Catálogo

#### Blur & Fade

```text
camera.blur-lens
camera.blur-gaussian
camera.fade-dark
camera.fade-light
camera.fade-dark-blur-lens
camera.fade-light-blur-lens
camera.exposure-light
```

#### Distort

```text
camera.distort
camera.distort-rotation
camera.distort-shake
camera.distort-rotation-shake
```

### 17.2 Contrato do preset

```ts
export interface CameraTransitionPreset {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  host: "after-effects";
  durationFramesDefault: number;
  anchor: "center-on-cti" | "start-at-cti" | "end-at-cti";
  requiredEffects: Array<{
    matchName: string;
    optionalFallbackMatchName?: string;
  }>;
  controls: Array<{
    id: string;
    type: "number" | "boolean" | "color" | "select";
    default: unknown;
    min?: number;
    max?: number;
  }>;
  keyframePlan: unknown;
}
```

### 17.3 Implementação

- usar adjustment layer ou solid/precomp conforme preset;
- criar camada com duração exata da transição;
- start/mid/end keys calculados por frames;
- easing configurável pelo mesmo motor do suavizador;
- efeitos resolvidos por matchName;
- se Lens Blur não estiver disponível, permitir fallback Gaussian somente com warning visível;
- não depender de plugins de terceiros;
- presets combinados usam um controller;
- `Distort & Rot & Shake` combina distorção, transform rotation e shake de forma parametrizada;
- `Fade Dark` e `Fade Light` devem usar solid/opacity ou exposure sem alterar permanentemente a footage;
- o preset pode ser reaplicado em modo Adjust.

### 17.4 Inputs comuns

```text
durationFrames
intensity
direction
midpoint
easeCurve
seed
motionBlur
applyToSelectionOrComp
```

### 17.5 Aceite

- 24/25/30/50/60 fps;
- CTI próximo ao início/fim da comp;
- duas transições adjacentes;
- ajuste posterior;
- remoção;
- fallback controlado;
- render sem missing effect;
- um Undo.

---

## 18. Assets online e banco de dados

### 18.1 Objetivo

Pesquisar, visualizar, licenciar, baixar, registrar e importar assets sem expor chaves de providers nem violar termos.

### 18.2 Providers iniciais

| Tipo | Provider | Status de produto |
|---|---|---|
| GIFs/stickers | GIPHY | Preview e integração apenas conforme aprovação de caching/importação; exibir `Powered By GIPHY`. |
| Imagens | Pexels | Provider inicial. |
| Vídeos | Pexels | Provider inicial. |
| Imagens | Unsplash | Opcional, com hotlink de preview, download tracking e atribuição. |
| SFX | Catálogo próprio licenciado | Provider padrão recomendado. |
| SFX | Freesound | Opcional; filtrar licença por item e obter licença de API comercial antes de uso comercial. |
| Música | Catálogo próprio/licenciado | Não integrar serviço sem direito claro de redistribuição/importação. |
| `Clips` | Não identificado | Não implementar até o produto/API exato ser definido. |

### 18.3 Roteamento e chaves

Fluxo padrão para providers com credencial secreta:

```text
Plugin Adobe → API própria/BFF → Provider externo
```

Nunca:

```text
Plugin Adobe → Provider externo com secret embutido
```

Exceção obrigatória por termos:

```text
Plugin Adobe → GIPHY API/media diretamente
```

Para GIPHY:

- não usar o backend como proxy de API ou mídia;
- usar uma chave de aplicação dedicada/production key conforme o fluxo oficial;
- tratar essa chave de client conforme os termos do provider, sem reutilizá-la como segredo de servidor;
- manter entitlement, favoritos e telemetria próprios no backend sem retransmitir a mídia;
- permitir os domínios GIPHY no manifest apenas no build que habilita o provider.

O plugin pode receber URLs temporárias/signed URLs e metadados normalizados de providers atendidos pelo BFF, mas nunca um provider secret.

### 18.4 Taxonomia interna

```text
overlay-textures
light-leaks
grunge-overlays
noise
film-burn
film-grain
dust-scratches
lens-flares
bokeh
paper
vhs
glitch
smoke
particles
transitions
gifs
images
videos
sfx
music
```

Cada item pode ter múltiplas categorias, tags e orientation.

### 18.5 Modelo normalizado

```ts
export interface AssetItem {
  id: string;
  provider: string;
  providerAssetId: string;
  type: "image" | "video" | "gif" | "audio";
  title: string;
  description?: string;
  previewUrl: string;
  previewMimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  author: {
    name: string;
    url?: string;
  };
  sourceUrl: string;
  license: {
    code: string;
    label: string;
    url: string;
    commercialUse: boolean | "unknown";
    attributionRequired: boolean;
    restrictions?: string[];
  };
  attributionText: string;
  download: {
    mode: "direct" | "signed" | "provider-tracked" | "blocked";
    expiresAt?: string;
  };
}
```

### 18.6 Fluxo de importação

1. usuário pesquisa;
2. backend consulta provider e normaliza;
3. painel mostra preview e attribution;
4. usuário clica `Import`;
5. backend registra import intent e executa o endpoint obrigatório do provider;
6. backend entrega URL permitida;
7. plugin baixa para cache de projeto;
8. plugin valida MIME, extensão, tamanho e SHA-256;
9. plugin importa para o host;
10. plugin escreve sidecar `.chms-asset.json`;
11. backend registra attribution/download;
12. UI oferece copiar créditos.

### 18.7 Cache

- diretório por projeto e provider;
- LRU configurável;
- checksum e deduplicação;
- nunca cachear GIPHY sem aprovação expressa;
- limpar cache não remove arquivos já incorporados ao projeto;
- offline mode mostra itens locais;
- assets com URL expirada são renovados via backend.

### 18.8 Compliance por provider

#### GIPHY

- mostrar marca `Powered By GIPHY` de forma conspícua na área de uso;
- fazer requests de API e mídia diretamente do client, sem proxy pelo backend;
- não modificar URLs retornadas;
- não cachear mídia ou cópias sem aprovação explícita;
- não misturar resultados GIPHY com conteúdo de outros providers no mesmo grid;
- solicitar production key antes do lançamento;
- por padrão, bloquear `Import` de cópia local enquanto não houver autorização de caching; permitir apenas preview/abertura e o fluxo oficialmente aprovado.

#### Pexels

- preservar links e crédito do fotógrafo quando possível;
- respeitar limites da API;
- não replicar o produto principal do provider;
- solicitar aumento de limite apenas após demo e attribution corretos.

#### Unsplash

- hotlink da URL retornada no grid;
- chamar download tracking quando a ação do usuário constituir download/importação;
- atribuir fotógrafo e Unsplash com links adequados;
- secret key somente no backend;
- usar apenas endpoints públicos documentados.

#### Freesound

- licença pertence a cada sound;
- filtrar por licença compatível com o uso do usuário;
- armazenar attribution;
- não oferecer a API em produto comercial sem licença/termos adequados;
- catálogo próprio é o caminho padrão para SFX automáticos.

### 18.9 UI

- busca com debounce;
- tabs por tipo;
- filtros de orientation, resolução, duração, cor, provider e licença;
- preview sem autoplay de áudio;
- skeleton/loading;
- estado offline;
- favoritos e coleções;
- indicador de crédito/licença;
- botão `Import`, `Download to folder`, `Copy credit`;
- progresso e cancelamento.

### 18.10 Importação no After Effects

- criar folder `CHMS Assets/<category>`;
- reutilizar FootageItem por checksum;
- aplicar Texture opcionalmente;
- preservar frame rate/alpha interpretation quando aplicável;
- não alterar interpretation global sem consentimento.

### 18.11 Importação no Premiere

- importar para bin `CHMS Assets/<category>`;
- inserir no CTI apenas quando usuário escolher;
- escolher track e modo insert/overwrite;
- áudio em track dedicada opcional;
- usar Action/transaction;
- retornar IDs dos itens inseridos.

---

## 19. Backend, autenticação e banco

### 19.1 Serviços

```text
services/api       REST/OpenAPI, auth, assets, license, styles
services/worker    ingest, thumbnails, checksums, catalog processing
services/database  migrations, seeds, policies
```

### 19.2 Endpoints mínimos

```http
POST /v1/auth/device/start
POST /v1/auth/device/poll
POST /v1/auth/refresh
POST /v1/auth/logout

POST /v1/licenses/activate
POST /v1/licenses/deactivate
GET  /v1/licenses/status

GET  /v1/assets/search
GET  /v1/assets/{id}
POST /v1/assets/{id}/import-intent
POST /v1/assets/{id}/attribution
GET  /v1/assets/categories
GET  /v1/assets/favorites
POST /v1/assets/favorites/{id}
DELETE /v1/assets/favorites/{id}

GET  /v1/presets
GET  /v1/caption-styles
GET  /v1/sfx/rules
GET  /v1/releases/current
GET  /v1/feature-flags
POST /v1/telemetry/batch
```

### 19.3 Tabelas mínimas

```text
users
accounts
licenses
license_devices
refresh_sessions
plugin_releases
feature_flags
asset_providers
asset_categories
asset_items
asset_item_categories
asset_licenses
asset_downloads
asset_attributions
favorites
collections
collection_items
caption_styles
caption_style_versions
sfx_items
sfx_rules
model_manifests
telemetry_events
audit_log
```

### 19.4 Campos críticos

- IDs UUID;
- timestamps UTC;
- soft delete quando necessário;
- provider payload bruto somente quando permitido e com retenção limitada;
- license snapshot no momento do download;
- attribution snapshot;
- release semver;
- checksum SHA-256;
- idempotency key em mutações;
- audit log para license/download.

### 19.5 Autenticação

- OAuth 2.1 Device Authorization ou PKCE via navegador;
- access token curto;
- refresh token rotacionado;
- token local em secure storage;
- no CEP, usar companion/OS keychain para segredo persistente; se indisponível, sessão temporária;
- offline lease assinado por Ed25519 com expiração e grace period definida pelo negócio;
- dispositivo revogável no painel da conta;
- não vincular licença a dado hardware invasivo.

---

## 20. AI Captions — arquitetura completa

### 20.1 Objetivos

- aproveitar transcript existente do Premiere quando disponível;
- importar SRT/VTT/JSON;
- transcrever localmente com IA offline;
- gerar captions semânticas;
- gerar captions visuais animadas;
- aplicar SFX opcionais nos pontos relevantes;
- operar no After Effects e Premiere;
- manter mídia local por padrão.

### 20.2 Modos de entrada

```text
premiere-existing-transcript
premiere-selected-clips
premiere-sequence-range
after-effects-selected-audio-layer
after-effects-active-comp-range
subtitle-file
caption-json
```

### 20.3 Limite da API do Premiere

O adapter não deve afirmar que consegue iniciar a transcrição nativa do Premiere se não existir método oficial documentado para isso.

Comportamento:

- usar `Transcript.exportToJSON()` para dados existentes;
- usar `Transcript.importFromJSON()` e `createImportTextSegmentsAction()` para importar quando apropriado;
- usar `hasTranscript()` e `querySupportedLanguages()` apenas quando a capability existir;
- ler caption tracks quando a API expuser os dados necessários;
- não usar QE DOM para acionar Speech to Text;
- se não houver transcript, oferecer transcrição offline ou importação de arquivo.

### 20.4 Engine offline

Default recomendado: **whisper.cpp**.

Motivos arquiteturais:

- C/C++;
- Windows, macOS Intel e Apple Silicon;
- CPU e acelerações disponíveis conforme build;
- word-level timestamps disponíveis;
- integração possível com addon do Premiere e companion do After Effects.

Regras:

- fixar commit/tag exato; nunca seguir `main` em produção;
- registrar licença e notices;
- modelos são downloads separados;
- cada modelo possui manifest assinado e SHA-256;
- usuário vê tamanho antes do download;
- download é cancelável e retomável;
- modelo não é executável;
- excluir modelo não apaga transcrições;
- nunca baixar silenciosamente;
- idioma auto ou explícito;
- VAD opcional;
- word timestamps obrigatórios para estilos dinâmicos.

### 20.5 Integração nativa

#### Premiere 26.2+

- `.uxpaddon` carrega o core C++;
- expõe API assíncrona:
  - `analyzeAudio`;
  - `transcribe`;
  - `cancelJob`;
  - `getModelInfo`;
  - `verifyModel`;
  - `healthCheck`.

#### After Effects

- companion assinado, instalado junto ao produto;
- serviço loopback em `127.0.0.1` ou IPC local;
- token efêmero por sessão;
- nunca escutar em interface externa;
- permitir health check e desligamento;
- logs sem conteúdo da transcrição por padrão.

### 20.6 Extração de áudio

Criar interface:

```ts
export interface AudioExtractionAdapter {
  extractToPcmWav(input: MediaRange, output: LocalPath): Promise<{
    sampleRate: 16000;
    channels: 1;
    bitDepth: 16;
    durationMs: number;
    sha256: string;
  }>;
}
```

Ordem preferida:

1. export/render oficial do host para WAV temporário;
2. decoder nativo próprio;
3. build FFmpeg/libav somente após revisão jurídica, preferencialmente LGPL e sem componentes GPL não aprovados.

Não chamar executável arbitrário encontrado no PATH.

### 20.7 Modelo de captions

```ts
export interface CaptionWord {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
  speakerId?: string;
  emphasis?: "none" | "low" | "medium" | "high";
}

export interface CaptionSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  words: CaptionWord[];
  speakerId?: string;
}

export interface CaptionDocument {
  schemaVersion: 1;
  language: string;
  source: "premiere" | "offline-whisper" | "srt" | "vtt" | "json";
  timebase: {
    fps: number;
    dropFrame: boolean;
  };
  segments: CaptionSegment[];
  metadata: {
    generatedAt: string;
    model?: string;
    sourceMediaHash?: string;
  };
}
```

### 20.8 Segmentação

Inputs:

```text
maxCharactersPerLine
maxLines
maxSegmentDurationMs
minSegmentDurationMs
maxWords
breakOnPunctuation
breakOnSilenceMs
keepPunctuation
orphanWordPolicy
safeArea
```

Algoritmo:

1. normalizar palavras e timestamps;
2. criar candidatos por silêncio/pontuação;
3. aplicar limites de linha e duração;
4. evitar segmento de uma palavra curta isolada;
5. snap para frame do host;
6. garantir `end > start`;
7. resolver overlaps;
8. preservar relação com words.

### 20.9 Estilos de animação

Catálogo inicial:

```text
caption.clean
caption.pop
caption.bounce
caption.scale-punch
caption.word-highlight
caption.karaoke
caption.slide
caption.typewriter
caption.punchline
caption.dynamic-emphasis
```

Cada estilo define:

- host outputs;
- MOGRT/template version;
- typography;
- safe area;
- max lines;
- entry/exit animation;
- active word behavior;
- colors;
- background box;
- per-word/segment mode;
- default easing;
- SFX tags;
- supported aspect ratios.

Não distribuir fontes sem licença. O style deve declarar fallbacks.

### 20.10 Saída no After Effects

Modos:

1. **Layer per segment**: simples e editável.
2. **Layer per word group**: estilos dinâmicos.
3. **Controller comp**: maior eficiência para projetos longos.
4. **MOGRT authoring**: composição preparada para exportação.

Regras:

- criar folder/comp `CHMS Captions`;
- usar tempo da comp;
- layers com metadata;
- preservar texto editável;
- style controls em null/controller;
- expressão mínima e performática;
- batch em uma chamada ExtendScript;
- para centenas de captions, usar temp JSON e progress chunking;
- output deve respeitar safe area e aspect ratio.

### 20.11 Saída no Premiere

Dois outputs independentes:

#### Semantic captions

- importar transcript/segments conforme API disponível;
- criar/usar caption track quando suportado;
- manter texto acessível/editável;
- não substituir track existente sem escolha.

#### Animated visual captions

- inserir MOGRT versionado por segmento;
- preencher parâmetros de texto e estilo via ComponentParam;
- posicionar no tempo exato;
- agrupar em video track `CHMS Captions`;
- reutilizar MOGRT path/library;
- permitir atualização de estilo sem perder texto;
- usar transação por lotes seguros, não uma transação gigante sem progresso.

### 20.12 SFX automático

O usuário deve habilitar explicitamente.

Pipeline:

1. analisar punctuation, emphasis, keywords, style events e word timing;
2. gerar `SfxCue`;
3. aplicar regras de densidade;
4. escolher item licenciado;
5. preview;
6. inserir no host;
7. registrar asset/attribution.

```ts
export interface SfxCue {
  id: string;
  timeMs: number;
  tag: string;
  intensity: number;
  preferredDurationMs?: number;
  offsetMs: number;
}
```

Controles:

```text
enabled
density
maxPerSecond
volumeDb
randomSeed
categories
keywordRules
punctuationRules
ducking
duckingAmountDb
minGapMs
trackName
```

Regras:

- track exclusiva `CHMS SFX`;
- nunca cobrir fala por volume excessivo;
- evitar repetição imediata do mesmo SFX;
- random determinístico;
- nenhuma mídia sem licença clara;
- preview/lista de cues antes de aplicar;
- remover/regenerar somente cues marcados pela suíte.

### 20.13 Qualidade e aceite

- import/export round-trip de CaptionDocument;
- snap para 23.976, 24, 25, 29.97 DF/NDF, 30, 50, 59.94 e 60;
- 1, 10 e 60 minutos de fixture;
- Portuguese e English;
- silêncio, música e múltiplos speakers;
- cancelamento em extração/transcrição;
- sem upload no modo offline;
- modelo inválido é bloqueado por checksum;
- MOGRT text corresponde exatamente ao documento;
- início/fim de cada visual caption dentro de um frame do timestamp normalizado;
- SFX em track dedicada e removível;
- reabrir projeto mantém vínculo e metadata.

---

## 21. Native Core

### 21.1 Responsabilidades

```text
audio decode/extraction
resampling
waveform/onset/BPM analysis
whisper inference
word timestamps
model verification
optional vector font outlining
heavy geometry/math
```

### 21.2 API versionada

```cpp
struct ChmsApiVersion {
  uint32_t major;
  uint32_t minor;
  uint32_t patch;
};

struct ChmsJobResult {
  bool ok;
  std::string json;
  std::string error_code;
  std::string error_message;
};
```

- ABI estável por major;
- sem exceptions atravessando boundary;
- memory ownership documentado;
- cancel token;
- callbacks de progresso;
- fuzz tests em parsers;
- paths UTF-8/UTF-16 tratados por plataforma;
- builds: Windows x64, macOS x64, macOS arm64;
- assinatura e notarização;
- symbol stripping no release, symbols privados arquivados.

### 21.3 Companion do After Effects

- instalador registra serviço/app;
- comunicação local autenticada;
- update coordenado com versão do plugin;
- protocolo health/version;
- sem auto-update independente sem assinatura;
- se companion estiver ausente, funções nativas ficam disabled e o restante do plugin continua funcional.

---

## 22. UI/UX

### 22.1 Navegação

```text
Home
Animate
Keyframes
Anchor
Parallax
Camera
Shapes
Layers
Assets
Captions
Settings
```

### 22.2 Home

- busca global/command palette;
- favoritos/recentes;
- contexto do host;
- status de licença;
- status do native service;
- update disponível;
- atalhos.

### 22.3 Padrões de interação

- botão principal nunca executa ação destrutiva sem sinalização;
- inputs persistem por feature;
- hover tooltip e help;
- preview quando relevante;
- Apply/Adjust/Remove separados;
- progress bar com etapa;
- Cancel;
- toast com resultado e botão Undo quando possível;
- warning de versão/capability no contexto da feature;
- nenhum modal bloqueante para mensagens comuns;
- suporte a painel estreito e largo;
- mínimo de 280 px;
- tema escuro/claro conforme host;
- escala de UI;
- pt-BR e en-US desde o início.

### 22.4 Acessibilidade

- ordem de tab;
- labels ARIA onde o runtime suportar;
- contraste;
- não depender apenas de cor;
- atalhos configuráveis;
- curva Bézier operável por teclado;
- motion preview reduzido quando preference `reduceMotion` estiver ativa.

---

## 23. Presets e schemas

### 23.1 Preset base

```ts
export interface PresetDefinition {
  schemaVersion: 1;
  id: string;
  version: string;
  displayName: Record<string, string>;
  category: string;
  hosts: HostId[];
  minHostVersion?: Record<HostId, string>;
  requirements: string[];
  controls: PresetControl[];
  operationPlan: unknown;
  preview?: {
    thumbnail: string;
    video?: string;
  };
  checksum: string;
  signature?: string;
}
```

### 23.2 Regras

- JSON canonicalizado antes do checksum;
- preset remoto assinado;
- migrações de schema;
- plugin não executa JavaScript vindo do servidor;
- operationPlan é declarativo e validado;
- expression templates são parte do bundle assinado ou pacote de preset assinado;
- rollback strategy declarada;
- cada preset possui fixture.

---

## 24. Permissões

### Premiere UXP

Solicitar somente o necessário:

```json
{
  "requiredPermissions": {
    "network": {
      "domains": [
        "https://api.example.com",
        "https://cdn.example.com"
      ]
    },
    "localFileSystem": "request",
    "launchProcess": {
      "schemes": ["https"]
    },
    "enableAddon": true
  }
}
```

Regras:

- `enableAddon` apenas no pacote Full/26.2+;
- não usar `"domains": "all"` em produção;
- não usar `fullAccess` se file picker/request resolver;
- `launchProcess` apenas para login/docs;
- não habilitar `allowCodeGenerationFromStrings`;
- CSP estrita;
- nenhum remote script;
- o build com GIPHY adiciona somente os domínios oficiais necessários e mantém o tráfego direto, sem proxy.

### After Effects CEP

- CSP com allowlist;
- Node integration desligado no client sempre que possível;
- comunicação com host pelo bridge;
- provider secrets ausentes;
- onboarding detecta preferência de file/network;
- companion escuta somente local;
- sanitizar todo HTML de dados remotos.

---

## 25. Privacidade

- transcrição offline é default;
- nenhum áudio, vídeo, frame, texto ou nome de projeto é enviado sem opt-in explícito;
- telemetria desativável;
- telemetria nunca inclui caption text, media path completo ou conteúdo;
- project fingerprint deve ser hash com salt local;
- logs redigem tokens, paths e texto;
- política de retenção documentada;
- export/delete account;
- consentimento separado para cloud transcription, se for criada no futuro;
- LGPD/GDPR review antes de lançamento.

---

## 26. Logging e observabilidade

### Log local

```json
{
  "timestamp": "ISO-8601",
  "level": "info|warn|error",
  "requestId": "uuid",
  "host": "after-effects",
  "hostVersion": "25.x",
  "command": "ae.expression.wiggle",
  "durationMs": 42,
  "result": "success",
  "errorCode": null
}
```

- rotação;
- limite de tamanho;
- export support bundle;
- redaction;
- botão Clear Logs;
- debug mode temporário;
- crash reports opt-in.

### Telemetria

Eventos agregados:

```text
plugin_started
feature_opened
command_succeeded
command_failed
native_job_completed
asset_imported
caption_pipeline_completed
```

Sem payload criativo.

---

## 27. Performance budgets

| Operação | Meta |
|---|---:|
| Primeira pintura do painel, warm | ≤ 1,5 s |
| Interação UI sem host | ≤ 100 ms |
| Atualizar contexto | ≤ 500 ms em projeto comum |
| Aplicar comando simples a 10 layers | ≤ 1 s, salvo host |
| Grid de assets | 60 fps de scroll em máquina de referência |
| Busca assets | debounce 250–400 ms |
| Long task | progresso em ≤ 500 ms |
| Cancelamento native job | reconhecer em ≤ 1 s |
| Bundle client por host | manter orçamento e registrar regressões |

Regras:

- batch host calls;
- virtualizar grid;
- thumbnails adequadas;
- não recalcular bounds por frame sem necessidade;
- não criar expressão O(n²);
- não inserir centenas de MOGRTs em uma transação sem chunks;
- usar worker/native para áudio e IA;
- benchmark fixtures no CI.

---

## 28. Testes

### 28.1 Unitários

- contracts;
- serializers;
- expression escaping;
- Bézier→KeyframeEase;
- timing/frame conversion;
- caption segmentation;
- asset license rules;
- cache/checksum;
- provider normalization;
- metadata parse/migrate;
- matrix math;
- random seed.

### 28.2 Contrato

- AE client ↔ ExtendScript;
- Premiere client ↔ adapter;
- plugin ↔ native;
- plugin ↔ backend;
- version negotiation;
- error codes.

### 28.3 Host integration

Fixtures After Effects:

```text
ae-empty.aep
ae-text-shapes.aep
ae-keyframes.aep
ae-3d-parented.aep
ae-parallax.aep
ae-captions-short.aep
ae-captions-long.aep
```

Fixtures Premiere:

```text
pr-empty.prproj
pr-assets.prproj
pr-transcript.prproj
pr-captions.prproj
pr-mogrt.prproj
pr-sfx.prproj
```

### 28.4 Golden tests

- render stills before/depois;
- tolerância por pixel;
- keyframe JSON snapshots;
- caption timing snapshots;
- project object counts;
- attribution sidecars.

### 28.5 Matriz mínima

| Host | Versões |
|---|---|
| After Effects | 25.0, último 25.x suportado, último 26.x suportado |
| Premiere | 25.6, 26.2, 26.3 e último patch suportado |
| Windows | Adobe-supported Windows em x64 |
| macOS | Adobe-supported macOS em Intel e Apple Silicon |

A matriz exata deve ser atualizada de acordo com os requisitos oficiais dos hosts no momento do release.

### 28.6 Testes negativos

- sem projeto;
- sem comp/sequência;
- seleção errada;
- layer locked;
- expressão existente;
- missing effect;
- rede offline;
- token expirado;
- provider rate limit;
- asset MIME falso;
- model checksum errado;
- companion incompatível;
- disco cheio;
- path Unicode;
- projeto não salvo;
- timebase drop-frame;
- undo após erro parcial.

---

## 29. CI/CD e distribuição

### 29.1 Pipeline

```text
install
lint
typecheck
unit tests
contract tests
build clients
build ExtendScript
validate manifests
build native matrix
scan dependencies/licenses
package dev
package release
sign
notarize
generate checksums/SBOM
publish staged
smoke install
```

### 29.2 Pacotes

- Premiere UXP: `.ccx`;
- After Effects CEP: `.zxp`;
- native/companion: installer assinado;
- pacote unificado opcional para instalar shells + companion + modelos opcionais;
- nunca embutir modelo grande no shell se isso inviabilizar update;
- manifests com IDs definitivos;
- versionamento SemVer;
- release channel stable/beta/internal.

### 29.3 Assinatura

- certificado Windows;
- Apple Developer ID, hardened runtime e notarização;
- ZXP assinado;
- CCX conforme fluxo Adobe;
- checksum SHA-256;
- SBOM CycloneDX/SPDX;
- third-party notices.

### 29.4 Host QA

GitHub-hosted runner não substitui QA Adobe. Usar runners próprios com instalações licenciadas e smoke tests automatizados/semi-automatizados, além de checklist manual.

---

## 30. Segurança

### Threat model mínimo

- secret extraction do bundle;
- MITM;
- malicious asset;
- path traversal;
- zip bomb;
- oversized media;
- SSRF no backend;
- token theft;
- localhost service hijack;
- model tampering;
- preset remote code injection;
- XSS em title/author remoto;
- dependency supply-chain;
- DLL/dylib hijacking;
- downgrade attack;
- license replay.

### Controles

- allowlist de providers;
- download por streaming com limite;
- MIME sniffing;
- extensão derivada do MIME;
- normalize path;
- sandbox/cache directory;
- signed model/preset manifests;
- TLS;
- token rotation;
- loopback token;
- CORS estrito;
- CSP;
- no remote code;
- direct-provider client identifiers somente quando os termos exigirem; nenhum segredo de servidor no bundle;
- dependency pinning;
- SCA/SBOM;
- signature verification;
- anti-downgrade de protocolo;
- rate limiting;
- idempotency keys.

---

## 31. Roadmap de implementação

### P0 — Fundação

- congelar starter;
- migrar workspaces;
- contratos;
- dispatcher;
- capability matrix;
- logging;
- UI shell;
- manifests/permissions;
- QA harness.

**Gate:** shells carregam nos dois hosts e `npm run check` continua verde.

### P1 — Core After Effects

- Wiggle;
- Flicker;
- Text Box;
- Inertial;
- Jump;
- LoopOut;
- Smooth;
- CutKeys;
- Delay;
- Create Null;
- Copy Keys;
- Flip;
- Parent;
- Rename;
- Reverse Layer Order.

**Gate:** todos com undo, conflito de expressão, fixtures e smoke host.

### P2 — Keyframes, Anchor, Time, 3D básico

- anchor aligner;
- curve editor;
- operações de keys;
- Time;
- Kinetic;
- Marker Loop;
- Orbit;
- Look At;
- Quick Parallax;
- Shapes;
- Trim Path;
- Echo;
- Fast Edit.

### P3 — Rigs avançados e transições

- Parallax completo;
- camera transitions;
- Effector;
- Break Shape;
- Illustrator to Vector;
- Cylinder;
- Cube;
- Glitch;
- Wave;
- Tile.

### P4 — Assets e ferramentas pesadas

- backend/auth/license;
- Pexels;
- Unsplash opcional;
- GIPHY compliant;
- catálogo próprio;
- Texture;
- Particles;
- Text to Vector;
- Clean.

### P5 — Native/IA

- native core;
- audio extraction;
- beat analyzer;
- whisper.cpp;
- model manager;
- companion AE;
- Premiere addon.

### P6 — AI Captions

- CaptionDocument;
- import SRT/VTT;
- existing Premiere transcript;
- segmentation;
- styles AE;
- MOGRT styles Premiere;
- semantic captions;
- SFX engine;
- long-project performance.

### P7 — Hardening e release

- security audit;
- provider legal review;
- accessibility;
- localization;
- installers;
- signing/notarization;
- store submission;
- docs/support bundle;
- full QA matrix.

### Nota de integração — Paridade de suíte de animação (Keyframe Ops, Easing Lab, Motion Browser)

> As duas subseções a seguir não são fases do roadmap acima. São notas: uma de
> integração e uma de incidente, guardadas aqui por falta de lugar melhor até o
> documento ganhar uma seção própria de registro técnico.

O usuário forneceu, em 2026-09-03, um documento de spec ("CrossHost Studio
Master Implementation Spec v2.0") cobrindo paridade funcional com suítes de
animação de mercado — navegador de presets, engine de presets, sistema de
texto animado, engine de transições, biblioteca do usuário, mais quatro
ferramentas de produtividade (as que este spec chama de Easing Lab, Keyframe
Ops, Anchor Mover, Timing Shifter) — e, além da paridade, um Motion Graph
Engine, Physics Engine, Audio Reactive Engine e SDK/marketplace de presets.

**Estado da integração:**

- O documento colado chegou com a codificação corrompida (UTF-8 relido como
  Windows-1252) em praticamente toda linha acentuada. Reconstruí-lo por
  transcrição manual dentro de uma resposta é um trabalho mecânico de alto
  risco de erro silencioso; a correção correta é reimportar o arquivo `.md`
  original (não colado no chat) quando o documento precisar viver
  arquivado neste repositório.
- Antes de implementar qualquer peça do documento, uma auditoria mostrou que
  parte do catálogo dele **já existe** neste repositório sob outro nome:
  Easing Lab ≈ `ae.keys.ease.apply` (§15 deste documento), Anchor Mover ≈
  `ae.anchor.align` (§14), o parallax avançado dele ≈ §16. Motion Browser,
  Preset Engine, My Library e Inspector-como-biblioteca **não existem** — são
  um paradigma novo (navegar/pré-visualizar/aplicar preset) que este produto
  ainda não tem; o produto atual é "painel de ferramentas", uma tela por
  comando.
- Uma peça genuína e ausente do catálogo Keyframe Ops foi implementada como
  prova de conceito da integração: **Reverse Values** (`ae.keys.reverse-values`),
  que inverte os valores dos keyframes selecionados mantendo os tempos —
  distinto de `ae.keys.reverse`, que já existia neste repositório mas
  implementa a operação que o documento chama de Mirror (espelha os
  tempos). Ver `apps/after-effects-cep/host/src/commands/keys-reverse-values.jsx`
  e o teste correspondente.
- Regra de arquitetura para qualquer trabalho futuro a partir daquele
  documento: ele descreve um monorepo próprio (`packages/animation-core`,
  `@crosshost/preset-sdk` etc.). **Não criar essa estrutura paralela.** Toda
  peça nova entra na arquitetura já existente deste repositório — o Command
  Bus dele é o dispatcher + `packages/command-registry` já existentes; o
  Host Adapter dele é `apps/*/host` já existente; a UI dele é
  `packages/ui-core` já existente.

---

### Nota de incidente — `//@` é diretiva de pré-processador, não comentário

Sintoma, em 2026-09-03: o painel abria e **todo** comando devolvia
`INTERNAL_ERROR`; o diagnóstico do host trazia
`bootstrap-failed:Erro de sintaxe:L17983`. Os 60 comandos sumiam de uma vez,
inclusive `ae.diagnostics.echo`.

Causa: uma única linha em `commands/clean.jsx`:

```js
// @ts-ignore - FootageItem is a global in AE ExtendScript
```

O ExtendScript tem um **pré-processador que roda antes do parser de
JavaScript**, e ele aceita as diretivas nas duas grafias: `#target aftereffects`
e `//@target aftereffects`. Para esse pré-processador um comentário de linha
iniciado por `@` não é comentário: é uma diretiva. `@ts-ignore` não existe, e
uma diretiva desconhecida derruba o arquivo inteiro — e, como o build concatena
os 60 fontes em um `index.jsx` só, derruba o `$.evalFile` do bootstrap e com ele
a suíte inteira.

Por que custou caro achar: **nenhuma ferramenta acusa isso.** `node --check`
usa o parser do V8 e aceita ES2023. O acorn em `ecmaVersion: 3` — que é o
dialeto certo — passou os 60 fontes e passou o bundle concatenado. O
`toAsciiExtendScript` foi verificado byte a byte contra os fontes e é fiel. Um
diff de formas sintáticas entre os 5 arquivos suspeitos e os 55 que carregavam
não achou nada, porque **comentário não entra na AST**. A pista que fechou o
caso foi textual: `// @` ocorria exatamente uma vez em toda a árvore do host, e
essa ocorrência era exatamente a linha que o After Effects apontou.

Regras que ficam:

1. Nunca escrever comentário de linha começando por `@` em fonte do host —
   `@ts-ignore`, `@ts-expect-error`, `@eslint-disable` inclusive.
2. Quando o TypeScript reclamar de um global do After Effects, **declará-lo** em
   `apps/after-effects-cep/host/types/extendscript.d.ts`. Foi o que
   `// @ts-ignore` estava mascarando aqui: `FootageItem` não existia nos tipos.
   Suprimir o erro escondeu a ausência de tipo e quebrou o host; declarar o tipo
   resolve os dois.
3. `scripts/check-extendscript.mjs` passou a recusar `//@` e qualquer linha
   iniciada por `#`, com teste positivo e negativo em
   `tests/extendscript-subset.test.mjs`. A regra roda sobre o texto cru, porque
   o alvo é o comentário.

---

## 32. Backlog inicial para o agente

| Issue | Título | Dependências | Aceite resumido |
|---|---|---|---|
| CHMS-001 | Baseline e tag do starter | — | `npm run check` documentado e tag criada. |
| CHMS-002 | npm workspaces sem regressão | 001 | Dois shells gerados em `dist/`. |
| CHMS-003 | Package contracts | 002 | Schemas + tests + versioning. |
| CHMS-004 | Dispatcher AE único | 003 | Round-trip e escaping testados. |
| CHMS-005 | Command bus Premiere | 003 | Action/transaction helper testado. |
| CHMS-006 | Capability matrix | 004,005 | System Check mostra capacidades reais. |
| CHMS-007 | Logging/redaction | 003 | Logs exportáveis sem dados sensíveis. |
| CHMS-008 | UI shell/tabs | 006 | Responsivo nos dois hosts. |
| CHMS-009 | Rig metadata | 003 | Create/read/migrate/remove. |
| CHMS-010 | Matrix math AE | 004 | 2D/3D parent fixtures. |
| CHMS-011 | Expression template engine | 004,009 | Backup/conflict/escape. |
| CHMS-012 | Keyframe serialization | 004 | Round-trip completo. |
| CHMS-013 | Wiggle/Flicker/LoopOut/Smooth | 011 | Host smoke tests. |
| CHMS-014 | Text Box | 010,011 | Dynamic bounds fixtures. |
| CHMS-015 | Parent/Create Null/Flip | 010 | World transform preservado. |
| CHMS-016 | Rename/Reverse/CutKeys/Delay | 012 | Preview e Undo. |
| CHMS-017 | Anchor aligner | 010 | Todos os modos e fixtures. |
| CHMS-018 | Bézier editor | 012 | Curva→ease + acessibilidade. |
| CHMS-019 | Key operations | 012,018 | Todos os comandos de duplicação/reverse. |
| CHMS-020 | Time/Kinetic/Marker Loop | 011,012 | Fixtures de timing. |
| CHMS-021 | Shape library/Trim Path | 004 | Presets declarativos. |
| CHMS-022 | Parallax quick | 009,010,011 | Framing/undo/adjust. |
| CHMS-023 | Parallax avançado | 022 | Focus/zoom/wiggle/bake. |
| CHMS-024 | Camera transitions | 011,018 | 11 presets sem dependência externa. |
| CHMS-025 | Break Shape/AI Vector | 010,021 | Visual diff aprovado. |
| CHMS-026 | Cylinder/Cube/Orbit/LookAt | 010,009 | 3D fixtures. |
| CHMS-027 | Glitch/Wave/Tile/Echo | 011 | Capability fallback. |
| CHMS-028 | Backend foundation | — | OpenAPI, DB, auth e tests. |
| CHMS-029 | Provider Pexels | 028 | Search/import/attribution. |
| CHMS-030 | Provider Unsplash | 028 | Hotlink/download tracking. |
| CHMS-031 | Adapter GIPHY direto e compliant | 028 | Requests client-side, branding, grid isolado e caching policy. |
| CHMS-032 | Asset UI/cache/import AE | 008,029 | End-to-end AE. |
| CHMS-033 | Asset import Premiere | 005,029 | Bin + CTI transaction. |
| CHMS-034 | License client | 028 | Online/offline lease. |
| CHMS-035 | Native core skeleton | — | Builds Win/mac + API version. |
| CHMS-036 | Audio extraction | 035 | PCM WAV fixtures. |
| CHMS-037 | Beat analyzer | 036 | Marker timing fixture. |
| CHMS-038 | whisper.cpp integration | 035,036 | Model verify + word timestamps. |
| CHMS-039 | AE companion | 035,038 | Signed local protocol. |
| CHMS-040 | Premiere uxpaddon | 035,038 | 26.2+ health/transcribe. |
| CHMS-041 | CaptionDocument/importers | 003 | SRT/VTT/JSON round-trip. |
| CHMS-042 | Caption segmentation | 041 | Timebase fixtures. |
| CHMS-043 | AE caption renderer | 014,041,042 | Styles + long test. |
| CHMS-044 | Premiere transcript adapter | 005,041 | Capability-safe import/export. |
| CHMS-045 | Premiere MOGRT renderer | 005,041,042 | Text/timing exact. |
| CHMS-046 | SFX rule engine | 032,033,041 | Preview + dedicated track. |
| CHMS-047 | Caption pipeline E2E | 038–046 | AE/Premiere fixtures. |
| CHMS-048 | Security/privacy review | todos | Threat controls verificados. |
| CHMS-049 | Packaging/signing/installers | 034,039,040 | Clean install/update/uninstall. |
| CHMS-050 | Release QA | todos | Full matrix e Definition of Done. |

---

## 33. Definition of Done

Uma feature só recebe status `Done` quando:

- [ ] ID e contrato estão no command registry.
- [ ] Capability requirements estão declarados.
- [ ] UI possui loading, success, empty, disabled e error state.
- [ ] Inputs têm validação.
- [ ] Operação real funciona no host.
- [ ] Undo é coerente.
- [ ] Seleção/CTI são preservados quando esperado.
- [ ] Nenhum dado do usuário é sobrescrito sem opção explícita.
- [ ] Erros possuem code, message e recovery action.
- [ ] Unit tests passam.
- [ ] Contract tests passam.
- [ ] Host smoke test passa.
- [ ] Fixture/golden test foi atualizado.
- [ ] Performance budget foi medido.
- [ ] Log não vaza conteúdo.
- [ ] Documentação e changelog foram atualizados.
- [ ] Localização pt-BR/en-US existe.
- [ ] Acessibilidade básica foi verificada.
- [ ] Não existem TODOs, mocks ou APIs privadas.
- [ ] O pacote release contém licenças/notices necessários.

### Release gate global

- [ ] Todos os recursos P0–P6 definidos para o release estão Done.
- [ ] Windows e macOS aprovados.
- [ ] Intel e Apple Silicon aprovados onde aplicável.
- [ ] Provider terms revisados.
- [ ] Privacy/security review aprovado.
- [ ] Pacotes assinados/notarizados.
- [ ] Upgrade/downgrade/uninstall testados.
- [ ] Backend com backup, monitoring e rate limit.
- [ ] Suporte e diagnóstico documentados.
- [ ] Nenhuma afirmação de capacidade excede a API realmente testada.

---

## 34. Regras de código para o agente

### Obrigatórias

- TypeScript strict.
- Sem `any` não justificado.
- Sem `catch { return success }`.
- Sem `console.log` em release; usar logger.
- Sem secrets no repo.
- Sem URLs de provider espalhadas; usar config.
- Sem display name de efeito/propriedade para lógica.
- Sem números mágicos de menu command no código de feature.
- Sem mutation antes de validação completa.
- Sem download sem limite/tipo/checksum.
- Sem expressão construída por concatenação insegura.
- Sem chamada de rede dentro de loop de layer.
- Sem cópia de assets proprietários.
- Sem “fallback” que altera visual silenciosamente.

### Estrutura de uma feature

```text
feature/
├── definition.ts
├── schema.ts
├── controller.ts
├── host/
│   ├── after-effects.ts
│   └── premiere.ts
├── presets/
├── tests/
└── README.md
```

### Pull requests

- uma mudança coerente;
- descrição de risco;
- screenshots/video do host;
- testes;
- compatibilidade;
- migration;
- rollback;
- sem refactor não relacionado.

---

## 35. Decisões que não devem ser improvisadas

O agente deve parar a implementação específica e registrar um ADR quando ocorrer:

- mudança de provider ou termos;
- uso comercial de Freesound;
- autorização de caching GIPHY;
- bundling de FFmpeg/libav;
- licenciamento de HarfBuzz/FreeType/fonts;
- cloud transcription;
- armazenamento de mídia do usuário;
- política comercial/licença;
- coleta de telemetria;
- integração real com hardware Kinect;
- API Adobe ausente que exigiria workaround não documentado.

O restante deve seguir os defaults deste documento sem pedir confirmação repetitiva.

---

## 36. Critérios de aceite do MVP comercial

O MVP comercial não precisa conter todas as features P4–P6, mas só pode ser lançado se o escopo anunciado estiver integralmente funcional.

### MVP recomendado

```text
Wiggle
Flicker
Text Box
Inertial
Jump
LoopOut
Smooth
CutKeys
Delay
Create Null
Copy Keys
Flip
Parent Layer
Rename Layer
Reverse Layer Order
Anchor Point Aligner
Keyframe Curve Editor
Quick Parallax
Camera Transitions
Shapes
Trim Path
Fast Edit
Pexels Assets
Import AE/Premiere
SRT/VTT Captions
3 caption styles
licensed SFX pack
license/update/diagnostics
```

### Full Suite

Adiciona:

```text
Advanced Parallax
Beat
Kinetic
Marker Loop
Orbit
Look At
Effector
Text/AI Vector
Break Shape
Echo
Cylinder
Glitch
Particles
Texture
Wave
Tile
Cube
Clean
GIPHY/Unsplash
Offline Whisper
Premiere transcript bridge
full dynamic captions
automatic SFX
```

---

## 37. Referências oficiais verificadas em 24 de agosto de 2026

### Adobe Premiere Pro UXP

- Introduction: https://developer.adobe.com/premiere-pro/uxp/introduction/
- Plugin setup: https://developer.adobe.com/premiere-pro/uxp/plugins/
- Changelog: https://developer.adobe.com/premiere-pro/uxp/changelog/
- Hybrid Plugins: https://developer.adobe.com/premiere-pro/uxp/plugins/hybrid-plugins/
- Manifest and permissions: https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/
- Transcript: https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/transcript
- CaptionTrack: https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/captiontrack
- SequenceEditor/MOGRT: https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequenceeditor
- ComponentParam: https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam
- Distribution/install: https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/

### Adobe After Effects / CEP

- After Effects developer portal: https://developer.adobe.com/after-effects/
- Scripts in After Effects: https://helpx.adobe.com/after-effects/desktop/automate-in-after-effects/automate-animation/scripts.html
- CEP resources: https://github.com/Adobe-CEP/CEP-Resources
- CEP samples: https://github.com/Adobe-CEP/Samples
- After Effects expressions: https://helpx.adobe.com/after-effects/using/expression-language-reference.html
- Create Shapes from Vector Layer: https://helpx.adobe.com/after-effects/desktop/drawing-painting-and-paths/shapes-and-shape-attributes/creating-shapes-masks.html

### Asset providers

- GIPHY API: https://developers.giphy.com/docs/api/
- Pexels API: https://www.pexels.com/api/documentation/
- Unsplash API: https://unsplash.com/documentation
- Freesound API: https://freesound.org/docs/api/

### Offline speech recognition

- OpenAI Whisper: https://github.com/openai/whisper
- whisper.cpp: https://github.com/ggml-org/whisper.cpp
- faster-whisper: https://github.com/SYSTRAN/faster-whisper

> APIs e termos podem mudar. Antes de cada release, executar a tarefa `docs:verify-external-contracts`, revisar changelogs e atualizar `last_verified`.

---

## 38. Prompt operacional final para Claude Code/Codex

```text
Leia integralmente docs/MASTER_BUILD_SPEC.md e o repositório antes de editar.

Objetivo: implementar a CrossHost Motion Suite por fases, preservando a base funcional existente para After Effects CEP/ExtendScript e Premiere Pro UXP.

Regras:
- execute npm run check antes de começar;
- não use mocks, placeholders, QE DOM, APIs privadas ou TODOs;
- implemente uma issue CHMS por vez;
- toda mutação deve ter validação, Undo/transaction, erro tipado e teste no host;
- use matchName, metadata versionada e capability detection;
- preserve dados do usuário;
- não exponha secrets;
- IA deve ser offline por padrão;
- providers externos passam pelo backend próprio e obedecem attribution/licença;
- não declare uma feature concluída até cumprir a Definition of Done;
- registre ADR para decisões jurídicas/arquiteturais listadas no documento;
- ao terminar cada issue, execute lint, typecheck, tests, build e validate;
- atualize changelog, QA matrix e documentação.

Comece por CHMS-001 e prossiga respeitando dependências.
```

---

## 39. Resultado esperado da primeira execução do agente

A primeira execução não deve tentar implementar todas as funções. Ela deve entregar:

1. relatório do estado do starter;
2. tag/branch;
3. workspaces sem regressão;
4. contracts;
5. dispatchers;
6. capability matrix;
7. UI shell;
8. testes;
9. documentação de carregamento nos hosts;
10. lista objetiva de limitações verificadas.

Somente depois iniciar as features P1.


---

**Fim da especificação normativa.**
