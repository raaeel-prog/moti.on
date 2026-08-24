# Pesquisa — Transações e permissões no Premiere Pro UXP

**Pergunta:** Quais são as assinaturas exatas de `Project.lockedAccess`, `Project.executeTransaction` e da criação de `Action` no Premiere Pro UXP, e quais chaves `requiredPermissions` o manifest v5 aceita?

**Data da decisão:** 2026-08-24
**Host alvo:** Premiere Pro 25.6+ (baseline), 26.3+ (suporte pleno)
**Status:** `available`

---

## Tabela de evidências

| Afirmação | Símbolo exato | Versão mínima | Fonte primária | Notas |
|---|---|---|---|---|
| Acesso com trava sobre o projeto | `lockedAccess(callback: () => void): void` | 25.6 | [Project — ppro_reference](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/project/) | **Síncrona**, retorna `void`. O estado do projeto não muda durante a execução do callback. |
| Transação desfazível | `executeTransaction(callback: (compoundAction: CompoundAction) => void, undoString?: string): boolean` | 25.6 | idem | **Síncrona**, retorna `boolean`. O callback **recebe** o `CompoundAction`; não devolve lista de ações. |
| Acumular ações na transação | `CompoundAction.addAction(action: Action): boolean` | 25.6 | [CompoundAction](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/compoundaction/) | Retorna `boolean`. |
| Saber se a transação está vazia | `CompoundAction.empty: boolean` (somente leitura) | 25.6 | idem | |
| Onde `create*Action()` pode ser chamado | — | 25.6 | [ESLint Support](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/eslint-support/) | Chamadas `create*Action()` precisam estar dentro dos callbacks aninhados de `lockedAccess()` e `executeTransaction()`. |
| Padrão recomendado | `lockedAccess` envolvendo `executeTransaction` | — | idem | É o que a regra `prefer-locked-access-wrapper` verifica. |
| Chaves de `requiredPermissions` | `clipboard`, `localFileSystem`, `network`, `webview`, `launchProcess`, `allowCodeGenerationFromStrings`, `enableUserInfo`, `ipc`, `enableAddon` | manifest v5 | [Manifest](https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/) | |
| Níveis de `localFileSystem` | `"plugin"` \| `"request"` \| `"fullAccess"` | manifest v5 | idem | Três níveis, não booleano. |
| Forma de `network` | `{ "domains": ["https://exemplo.com"] }` ou `{ "domains": "all" }` | manifest v5 | idem | |
| Plugin ESLint oficial | `@adobe/eslint-plugin-premierepro` | — | [ESLint Support](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/eslint-support/) | 7 regras sintáticas + 7 com informação de tipo. |

### Regras do plugin oficial

Sintáticas: `require-action-lock-scope`, `require-execute-transaction`, `no-async-in-locked-access`, `no-async-in-execute-transaction`, `no-action-scope-escape`, `prefer-locked-access-wrapper`, `prefer-undo-string`. Cada uma tem uma variante `-type-checked` que exige `projectService: true`.

---

## O que a pesquisa corrigiu no plano

Três coisas que teriam sido implementadas erradas se o código fosse escrito de memória:

**1. As duas APIs são síncronas.** O plano previa `withTransaction` como `async` devolvendo `Promise`. `lockedAccess` retorna `void` e `executeTransaction` retorna `boolean`; nenhuma das duas é assíncrona. Pior: o plugin oficial tem duas regras — `no-async-in-locked-access` e `no-async-in-execute-transaction` — dedicadas a impedir exatamente o erro que o plano teria cometido. Trabalho assíncrono dentro desses callbacks quebra a garantia de que o estado do projeto não muda durante a execução.

**2. O callback recebe o `CompoundAction`, não devolve ações.** A assinatura planejada era `build: (ctx) => Action[]`. A real é `(compoundAction: CompoundAction) => void`, e as ações entram por `compoundAction.addAction(action)`.

**3. O `no-action-scope-escape` é regra oficial, não invenção local.** A §10 do master spec diz "não armazenar referências de Action para uso posterior", e o plano previa uma regra `no-restricted-syntax` escrita à mão para isso. Existe regra oficial da Adobe fazendo o mesmo, e uma regra oficial acompanha as mudanças da API — uma regra caseira envelhece em silêncio.

---

## Decisão de implementação

Adotar `@adobe/eslint-plugin-premierepro` com a configuração **sintática** (`configs.recommended`), não a `recommendedTypeChecked`. As regras com informação de tipo exigem `projectService: true`, que faz o ESLint carregar o programa TypeScript inteiro a cada execução; `npm run typecheck` já roda o `tsc` completo e é a autoridade sobre tipos. As regras sintáticas cobrem os erros estruturais, que são os que importam aqui.

O helper fica assim:

```ts
export function withTransaction(
  project: PremiereProject,
  undoLabel: string,
  build: (compound: CompoundAction) => void
): boolean
```

Síncrono. Cria a trava, abre a transação por dentro, e devolve o `boolean` do `executeTransaction`.

**`compoundAction.empty` alimenta a regra do `ok`.** Uma transação que termina vazia não alterou nada, e a §8 proíbe responder `ok: true` nesse caso. Do lado do After Effects isso depende de o comando reportar `changed` honestamente; no Premiere existe um sinal do próprio host, que é mais forte do que a palavra do comando. O helper devolve os dois: se a transação executou e se ela estava vazia.

## Permissões

P0 declara **apenas**:

```json
"requiredPermissions": {
  "localFileSystem": "request"
}
```

`"request"`, não `"fullAccess"`: o plugin só precisa do arquivo que o usuário escolher num seletor, para exportar o pacote de diagnóstico do CHMS-007. `"fullAccess"` daria acesso a todo o disco para um recurso que precisa de um arquivo por vez.

Ausentes de propósito, cada um com a issue que o traz:

| Permissão | Quando entra |
|---|---|
| `network` | CHMS-029 (provider Pexels), com `domains` explícito — nunca `"all"` |
| `enableAddon` | CHMS-040, e só no pacote 26.2+ |
| `launchProcess` | Nenhuma issue prevista. Exigiria ADR: executar processo externo é decisão de segurança, não de conveniência |
| `allowCodeGenerationFromStrings` | Nunca. A §24 proíbe, e é o que torna o Ajv em runtime inviável — por isso os validadores serão codegen standalone |
| `clipboard`, `webview`, `ipc`, `enableUserInfo` | Nenhuma issue prevista |

Declarar permissão "para depois" viola permissão mínima e é o tipo de coisa que passa despercebida numa revisão de marketplace até virar rejeição.

## Fallback

Não há fallback a decidir: as APIs existem desde a versão baseline (25.6) que o manifest já exige. Um Premiere abaixo de 25.6 não carrega o plugin — o `host.minVersion` do manifest bloqueia antes.

## Flag de capacidade

```json
{
  "premiere.project.executeTransaction": {
    "status": "supported",
    "minVersion": "25.6",
    "probe": "typeof project.executeTransaction === 'function' && typeof project.lockedAccess === 'function'",
    "fallback": "nenhum; abaixo de 25.6 o manifest impede o carregamento"
  }
}
```

A sonda continua sendo por símbolo, e não por versão: a §9 exige detecção de capacidade, e a versão só rotula o tier.

## Testes necessários

- `withTransaction` chama `lockedAccess` **antes** de `executeTransaction`, e `executeTransaction` acontece **dentro** do callback do `lockedAccess`.
- O helper não retém referência de `Action` depois de retornar.
- Uma transação que termina com `compound.empty === true` produz `ok: false`.
- `executeTransaction` devolvendo `false` produz `ok: false`.
- O rótulo de Undo é repassado como `undoString`.
- Nenhum `await` dentro dos callbacks — coberto pelas regras oficiais no lint.

## Incerteza remanescente

**Nada aqui foi executado dentro do Premiere Pro.** As assinaturas vêm da referência oficial e o comportamento em tempo de execução — se `executeTransaction` devolve `false` em qual situação exatamente, se `lockedAccess` pode aninhar, o que acontece quando uma exceção escapa de dentro do callback — não está verificado. Está registrado em `docs/HOST_LIMITATIONS.md`.

Também não foi verificado o comportamento de `requiredPermissions` no carregamento real: se o UXP recusa o plugin, avisa, ou ignora silenciosamente uma chave desconhecida.

---

## Fontes

- [Project — Premiere Pro UXP reference](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/project/)
- [CompoundAction — Premiere Pro UXP reference](https://developer.adobe.com/premiere-pro/uxp/ppro_reference/classes/compoundaction/)
- [ESLint Support — Premiere Pro UXP](https://developer.adobe.com/premiere-pro/uxp/resources/fundamentals/eslint-support/)
- [Manifest — Premiere Pro UXP](https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/)
- [eslint-plugin-premierepro README](https://github.com/adobe/eslint-plugin-premierepro/blob/main/README.md)
