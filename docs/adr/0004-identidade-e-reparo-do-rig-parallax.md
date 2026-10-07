# ADR 0004 — Identidade necessária para reparar o rig Parallax

- **Status:** proposta; implementação pendente
- **Data:** 2026-09-21
- **Escopo:** `ae.parallax.create-null` e `ae.parallax.set-focus` da §16 do `MASTER_BUILD_SPEC.md`

## Situação observada

O Parallax v3 grava `rigId`, `compId`, `cameraId`, originais e estado aplicado no comentário do master. Os membros são identificados por `Layer.id` dentro desse comentário; eles não têm uma marca de propriedade própria. A câmera é parentada ao master, mas os membros não são. Se o master for apagado, desaparece a única fonte que relaciona os membros e a câmera ao rig. Nome de camada não recupera identidade de modo seguro: pode ser editado e duplicado pelo usuário.

O foco avançado existente aceita `targetLayerName`. Ele confirma a existência no preflight e escreve uma expressão gerenciada que referencia o nome. Isso atende ao caso nominal, mas não implementa o contrato da §16.7 de escolher a camada selecionada por identidade estável nem o alvo em ponto 3D da §16.4. Um `set-focus` que simplesmente copiasse o nome da seleção poderia escolher a camada errada se houvesse nomes repetidos.

## Decisão proposta

Não registrar esses dois IDs como comandos funcionais enquanto reparo e seleção não puderem provar a identidade do rig/alvo. Numa migração v4, gravar `rigId` e papel em cada membro e na câmera, além do master; validar `compId`, duplicatas e integridade cruzada antes de reparar. Reparo deve ser transacional, preservar comentários do usuário, recusar sinais contraditórios e nunca adotar camadas por nome. `set-focus` deve vincular uma camada selecionada por ID estável ou um ponto 3D explícito, com comportamento definido para exclusão/duplicação e rollback da expressão.

A migração precisa manter abertura dos rigs v2/v3: quando o master ainda existir, pode enriquecer os membros após conferir os snapshots; quando ele faltar, deve recusar reparo automático porque não há prova suficiente. Isso é uma proposta de arquitetura, não uma capacidade entregue nesta rodada.

## Consequência

Os subcomandos `create-null` e `set-focus` permanecem `NOT IMPLEMENTED`; o Parallax avançado da §16 é `PARTIAL` mesmo com os comandos existentes e seus testes passando. Não contar esses itens como parte das 47 ferramentas prontas. A validação no After Effects real continua necessária também para os comandos já implementados.
