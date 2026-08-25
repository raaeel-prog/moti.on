# CHMS-009 — evidência TDD

## Origem e jornadas

Não houve arquivo `*.plan.md`. As garantias vieram de
`docs/MASTER_BUILD_SPEC.md` §11/CHMS-009, de
`packages/contracts/src/rig-metadata.ts` e dos ADRs 0001/0002.

- Como adapter de host, quero criar/ajustar/remover metadata sem alterar nenhum
  byte do comentário do usuário fora do bloco gerenciado.
- Como leitor, quero recusar corrupção, delimitadores ambíguos, schema futuro e
  o marcador CHMS não publicado, para não interpretar dados incertos.
- Como adapter com limite de comentário conhecido, quero receber uma decisão
  inline/sidecar determinística sem permitir que o pacote faça I/O.
- Como versão futura do plugin, quero migrar somente schemas explicitamente
  registrados, com a saída novamente validada como v1.

## RED → GREEN

1. RED inicial: `node --test "packages/rig-metadata/tests/*.test.mjs"`
   falhou com `ERR_MODULE_NOT_FOUND .../dist/index.js` antes de existir código de
   produção (0/1 arquivo de teste).
2. GREEN inicial: depois da implementação mínima, o mesmo comando passou 21/21.
3. RED de hardening: três garantias novas reproduziram três falhas reais
   (18/21): marcador reservado não numérico era ignorado, data calendária
   impossível era aceita e Adjust de sidecar não exigia o payload atual.
4. RED de timestamp: o caso `.123Z` revelou normalização excessiva (21/22).
5. RED de revisão independente: identidades arbitrárias e a referência
   `../sidecar` ainda eram aceitas (22/24). O contrato foi endurecido para UUID
   canônico lowercase em todas as identidades persistentes.
6. GREEN final: build focado seguido dos testes passou 24/24.

Os commits de checkpoint RED/GREEN não foram criados por este worker porque o
branch/worktree é compartilhado por agentes paralelos e os commits pertencem ao
agente de integração. A evidência acima deve ser preservada no commit/PR final.

## Especificação de testes

| Garantia | Tipo | Evidência final |
|---|---|---|
| JSON recursivamente canônico, Unicode estrito e SHA-256 equivalente ao `node:crypto` | unit | PASS |
| Round-trip Unicode e imutabilidade sem congelar o objeto do caller | unit/contrato | PASS |
| Um único bloco; duplicado, órfão, formato futuro e CHMS legado recusados | negativo/contrato | PASS |
| Checksum detecta alteração semanticamente válida | segurança | PASS |
| Shape v1, timestamp e identidades validados estritamente | unit/negativo | PASS |
| Update/remove preservam prefixo e sufixo byte-for-byte | contrato | PASS |
| Limite em bytes escolhe sidecar e não faz I/O | unit/contrato | PASS |
| Sidecar valida tamanho, hash, schema e `rigId` | segurança | PASS |
| Migração exige registro único e valida a saída v1 | unit/negativo | PASS |

## Comandos finais

```text
.\node_modules\.bin\tsc.cmd -b packages\rig-metadata --pretty false
PASS

.\node_modules\.bin\eslint.cmd packages\rig-metadata\src\**\*.ts packages\rig-metadata\tests\*.mjs
PASS

node --test packages/rig-metadata/tests/*.test.mjs
24/24 PASS

node --test --experimental-test-coverage packages/rig-metadata/tests/*.test.mjs
24/24 PASS; agregado: lines 86.74%, branches 84.27%, functions 84.51%

git diff --check -- packages/rig-metadata
PASS
```

## Lacunas honestas

- After Effects host: **NOT RUN**. O pacote não integra `Layer.comment`.
- Premiere host: **NOT APPLICABLE** para este slice puro.
- Filesystem sidecar/atomic rename: **NOT IMPLEMENTED neste pacote**; cabe ao
  adapter futuro, que deve aplicar o plano dentro da fronteira permitida.
- O check completo do monorepo e a integração no `tsconfig`/lockfile pertencem
  ao agente de integração.
