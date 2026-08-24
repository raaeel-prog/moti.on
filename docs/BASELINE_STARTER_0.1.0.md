# Baseline do starter — `starter-0.1.0`

> Registro exigido por `docs/MASTER_BUILD_SPEC.md` §0.2: *"Executar `npm run check` antes de qualquer alteração e registrar o resultado."*
>
> Este documento é o **estado do repositório antes de qualquer edição feita pelo agente**. Ele existe para que a migração do CHMS-002 tenha um ponto de comparação objetivo e para que a tag `starter-0.1.0` seja restaurável com significado.

## Ambiente

| Item | Valor |
|---|---|
| Data/hora (UTC) | `2026-08-24T14:52:40Z` |
| Sistema | Windows 11 Pro 10.0.26200 |
| Node.js | `v24.19.0` |
| npm | `11.17.0` |
| git | `2.55.0.windows.5` |
| GitHub CLI | `2.98.0` |
| Diretório | `C:\Users\rael\Downloads\Plugin\Plugin\Moti.on` |
| Dependências instaladas | nenhuma — o starter não tem `dependencies` nem `devDependencies`, e não existe `package-lock.json`. `npm install` não foi necessário. |

Node.js, npm e o GitHub CLI **não existiam nesta máquina** antes deste passo; foram instalados via `winget` (`OpenJS.NodeJS.LTS`, `GitHub.cli`). O git existia mas **sem identidade global** (`~/.gitconfig` ausente).

## Comando executado

```bash
npm run check
```

Equivalente a `npm run build && npm run validate && npm test && npm run skills:validate`.

**Exit code: `0`.**

## Resultado por etapa

| Etapa | Comando | Status |
|---|---|---|
| build | `node scripts/build.mjs` | **PASS** |
| validate | `node scripts/validate.mjs` | **PASS** |
| test | `node --test tests/*.test.mjs` | **PASS** — 6/6 |
| skills:validate | `node scripts/validate-agent-skills.mjs` | **PASS** — 14 skills, 31 arquivos, 42 evals |

Nenhuma etapa foi pulada. Nenhuma etapa ficou `NOT RUN`.

## Saída verbatim

```text
> adobe-crosshost-plugin-starter@0.1.0 check
> npm run build && npm run validate && npm test && npm run skills:validate


> adobe-crosshost-plugin-starter@0.1.0 build
> node scripts/build.mjs

Build concluído em dist/.

> adobe-crosshost-plugin-starter@0.1.0 validate
> node scripts/validate.mjs

Validação estrutural e sintática concluída.

> adobe-crosshost-plugin-starter@0.1.0 test
> node --test tests/*.test.mjs

✔ skill pack is valid, mirrored, and fully covered by routing evals (76.3304ms)
✔ visual foundation preserves the approved minimal workstation contract (1.3896ms)
✔ IDs dos hosts são distintos e consistentes (7.4053ms)
✔ parse aceita envelope válido (1.6047ms)
✔ parse transforma resposta inválida em erro tipado (0.7176ms)
✔ formatDimension normaliza dimensões (1.3575ms)
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 203.3976

> adobe-crosshost-plugin-starter@0.1.0 skills:validate
> node scripts/validate-agent-skills.mjs

Validated 14 skills, 31 skill files, 42 routing evals, and the Claude mirror.
```

O único ruído restante foi um `npm notice` sobre uma versão maior de npm disponível (11.17.0 → 12.0.2). Não afeta o resultado e não foi aplicado — trocar a major do npm no meio de um baseline invalidaria a comparação.

## Inventário de `dist/`

15 arquivos. `BUILD_INFO.json` está listado mas **excluído da comparação de hash** porque embute `builtAt` e portanto não é reproduzível.

| Arquivo | Bytes | SHA-256 |
|---|---|---|
| `after-effects-cep/.debug` | 214 | `5b29ce2d7c363add59a9a7e9fab568691b53ed3a2cdcb697b43b4efc6dbe8ada` |
| `after-effects-cep/CSXS/manifest.xml` | 1572 | `f08c79b1082655db7cd2e4c4112afb8b45a0cd808301121dd19a79898cf7b394` |
| `after-effects-cep/client/index.html` | 1912 | `66cb24692a8120921cfb63c41379c198fbcc82d570e24ae7eeb99e610e8a0780` |
| `after-effects-cep/client/lib/CSInterface.js` | 42759 | `3c45400984772b88cdf4604b4763a29219f8071fdedb9a1fa19d997349003783` |
| `after-effects-cep/client/main.js` | 3663 | `a49bd5c76ee4ed4c59d0bf303bd7dadba30761fd8a5bab682ed787a64318d862` |
| `after-effects-cep/host/index.jsx` | 3870 | `3a5094f7df1b4b2b84dfedf63be453da953031169ac9d8e5c9b5f54389e5641b` |
| `after-effects-cep/shared/protocol.js` | 2100 | `416324d9519bd4c35d4bca5394acc326420216c4a802076d90453b4d7d21a891` |
| `after-effects-cep/styles/theme.css` | 3087 | `bf926d759e7186ccf301cf6536fc9921fb73fe03429859354c4da78fe6c5be4d` |
| `premiere-uxp/host/premiere-adapter.js` | 2249 | `6e06e51e36c36302f55f74a33be57ddc4d23c0692fae362a0a083477b1ef71ee` |
| `premiere-uxp/index.html` | 1805 | `21847327b053307975e6021d1c871b7846c92f472da3fa3808678c682eb18b45` |
| `premiere-uxp/main.js` | 4081 | `69fb40692d16d9139a817084fa7322b421360552db64516ab6673cd6799d664f` |
| `premiere-uxp/manifest.json` | 695 | `e8a0c1f9a8fe5f1d2c6b3bcbf9eaa7e0035bae5f774b01fad157bb8c424f1268` |
| `premiere-uxp/shared/protocol.js` | 2100 | `416324d9519bd4c35d4bca5394acc326420216c4a802076d90453b4d7d21a891` |
| `premiere-uxp/styles/theme.css` | 3087 | `bf926d759e7186ccf301cf6536fc9921fb73fe03429859354c4da78fe6c5be4d` |
| `BUILD_INFO.json` | 174 | *(excluído — timestamp)* |

Os dois `shared/protocol.js` e os dois `styles/theme.css` têm hash idêntico entre hosts, como esperado: `scripts/build.mjs` copia o mesmo arquivo de origem para os dois destinos.

A forma legível por máquina deste inventário está em [`tests/fixtures/dist-baseline-pre-rebrand.json`](../tests/fixtures/dist-baseline-pre-rebrand.json).

## O que o baseline expõe

O `check` passar **não** significa que o repositório está correto. Passar significa apenas que build, manifests, sintaxe e o pacote de skills estão consistentes. Estes problemas existem no starter e passam pelo `check` atual sem serem detectados:

1. **`after-effects-cep/.debug` está em `dist/`.** É o arquivo de porta de debug do CEP (`Port="8091"`). `scripts/build.mjs` copia a árvore inteira de `src/` recursivamente e não tem lista de exclusão, então um arquivo que só faz sentido em desenvolvimento entra no output de build.

2. **`BUILD_INFO.json` mente por construção.** `name` e `version` são literais hardcoded dentro de `scripts/build.mjs`, não lidos de `package.json`. Se a versão do pacote mudar, o build continua declarando `0.1.0`.

3. **`scripts/validate.mjs` escreve na raiz do repositório.** Para checar a sintaxe do `.jsx` ele grava `.tmp-index-jsx-check.js` no diretório raiz e remove num `finally`. Se o processo morrer entre as duas coisas, o arquivo fica — e o `.gitignore` do starter não o cobre.

4. **`src/premiere-uxp/main.js` não é executável a partir de `src/`.** Ele faz `require("./shared/protocol.js")`, caminho que não existe sob `src/`; só resolve em `dist/`, porque o build copia o protocolo para `<out>/shared/`. Ou seja, `src/` não é uma árvore rodável, é uma árvore-fonte para o copiador.

5. **O serializador do host AE está incorreto.** `escapeJsonString` em `src/after-effects-cep/host/index.jsx` escapa apenas `\`, `"`, `\r`, `\n` e `\t`. Os demais caracteres de controle U+0000–U+001F saem crus, o que produz JSON inválido, e todo não-ASCII sai cru, o que é frágil por codepage no canal `evalScript` do Windows. É o único serializador que existe hoje.

6. **O design system aprovado está órfão.** `src/shared/theme.css` define os próprios tokens (`#202124`, accent azul `#4d8df7`, raio 8px, Arial) e nunca referencia `shared/crosshost.tokens.css` (`#1d1d1d`, accent verde `#35c978`, raio 4px). Os arquivos de token só são lidos por `scripts/skills-lib.mjs` para checagem de existência. `docs/UI_FOUNDATION.md` ainda traz um terceiro esquema de nomes, incompatível com os outros dois.

7. **Nenhum dos dois shells declara permissões ou CSP.** `src/premiere-uxp/manifest.json` não tem `requiredPermissions`; nenhum dos dois `index.html` tem meta `Content-Security-Policy`.

8. **Cobertura de teste é fina.** 3 assertions de protocolo, 1 de manifests, 2 de skill pack. Zero testes para os adapters, para o host ExtendScript, para a ponte `evalScript` ou para qualquer renderização.

Os itens 1, 2 e 3 são corrigidos no CHMS-001b. O item 5 é substituído no CHMS-004. O 6 no CHMS-008a. O 7 no CHMS-005. Os itens 4 e 8 são resolvidos pela migração do CHMS-002 e pelos testes que cada issue subsequente traz.

## Estado dos identificadores

Neste baseline, todos os identificadores ainda são os placeholders do starter:

- `com.example.crosshosttoolkit` (bundle CEP)
- `com.example.crosshosttoolkit.ae.panel` (painel AE)
- `com.example.crosshosttoolkit.premiere` (plugin UXP)
- Nome de produto `CrossHost Toolkit`
- Globais `CrossHostAE` e `CrossHostProtocol`

`tests/manifests.test.mjs` **fixa** os dois primeiros por asserção. O rebranding para `com.motion.plugin.*` / `Moti.on` no CHMS-001b quebra esse teste de propósito — ele é a tripwire pretendida, e é atualizado no mesmo commit.
