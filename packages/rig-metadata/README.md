# @motion/rig-metadata

Implementa o núcleo puro do CHMS-009: criar, ler, ajustar, remover e migrar o
bloco `[MOTION_META_V1]...[/MOTION_META_V1]` sem tocar APIs Adobe.

## Invariantes

- O texto fora do span gerenciado é preservado byte-for-byte.
- Exatamente um bloco é aceito; duplicatas, delimitadores órfãos, formatos
  futuros, schemas desconhecidos e o marcador CHMS não publicado falham
  fechados.
- O envelope e o payload usam JSON canônico com chaves recursivamente
  ordenadas, UTF-8 estrito e base64url sem padding.
- O SHA-256 cobre o JSON canônico completo da metadata.
- `rigId`, `controllerLayerUuid` e cada `memberLayerUuids[]` precisam ser UUIDs
  RFC 4122 canônicos em lowercase; uma identidade nunca vira path arbitrário.
- `maxCommentBytes` vem obrigatoriamente do adapter. Não existe limite
  hardcoded para `Layer.comment`, pois a documentação normativa do projeto não
  fixa um valor seguro para esse campo.
- Se o bloco inline não cabe, a API devolve um plano sidecar. Ela não abre,
  grava, renomeia ou apaga arquivos.

## Tradeoff do SHA-256

O pacote inclui uma implementação pequena e síncrona de SHA-256 em TypeScript.
Isso evita dependência de `node:crypto`, WebCrypto, Buffer ou de uma API do host
e mantém o mesmo resultado em CEP client, UXP e Node. O custo é não aproveitar
aceleração nativa; ele é aceitável aqui porque a entrada é metadata pequena,
não mídia. Assets e modelos grandes devem continuar usando o core nativo.

## Sidecar

`createRigMetadata` e `updateRigMetadata` devolvem `MetadataWritePlan`. Quando
`storage === "sidecar"`, `plan.sidecar.payload` é o JSON canônico que o adapter
deve persistir de forma atômica dentro de uma raiz controlada. Aplique nesta
ordem:

1. grave/valide o sidecar;
2. escreva `plan.comment` no mesmo Undo Group da mutação do rig;
3. remova `obsoleteSidecarRigId` somente depois do sucesso.

`readRigMetadata` devolve a referência sem fazer I/O; depois de carregar o
conteúdo, o adapter chama `resolveSidecarMetadata`, que verifica tamanho, hash,
JSON canônico, schema e `rigId`.

Ao ajustar uma referência sidecar, `updateRigMetadata` exige
`currentSidecarPayload`. Assim, Adjust não transforma silenciosamente um schema
desconhecido ou um arquivo corrompido em v1.

## Migração

Nenhum schema anterior foi publicado. Por isso não existe migração implícita
nem suporte ao marcador legado `CHMS_META`, conforme ADR 0001. Uma versão futura
registra explicitamente `RigMetadataMigration`; sua saída ainda passa por toda
a validação v1 antes de gerar um plano de escrita.
