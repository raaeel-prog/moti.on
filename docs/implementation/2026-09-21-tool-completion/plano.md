# Continuação do MASTER — revisão de ferramentas (21/09/2026)

## Escopo desta rodada

Revisar a cobertura real do `MASTER_BUILD_SPEC.md`, corrigir primeiro os fluxos que podem alterar a composição incorretamente ou informar sucesso sem alteração, integrar UI/host/testes e só então executar a matriz no After Effects real. Os 47 tiles não equivalem ao total de comandos ou à conclusão das seções de assets, captions, nativo e Premiere.

## Fatias e arquivos

- Órbita: `three-d-orbit.jsx`, expressões de órbita, descriptor e testes focados (agente Orbit).
- Rigs 3D: `three-d-cylinder.jsx`, `three-d-cube.jsx` e testes (agente Rigs 3D).
- Conversão, partículas e limpeza: comandos host e testes (agente Vector/Particles/Clean).
- Integração: `client/src/main.ts`, seus testes e documentação de estado (agente principal). Corrigir primeiro Parallax Adjust e fazer a UI de Clean exigir prévia e seleção explícita.

## Invariantes e compatibilidade

- Nenhum comando pode retornar sucesso para uma operação que não fez alteração.
- Preservar seleção, keyframes, expressões, parent, propriedades do usuário e metadados preexistentes; recusar conflitos que não possam ser resolvidos com segurança.
- Não depender de nomes localizados de propriedades nem de IDs de menu não confirmados. Falta de capacidade gera erro explícito, nunca sucesso parcial oculto.
- O contrato de Clean restringe remoção a itens gerenciados comprovadamente sem uso, após scan e confirmação específica.
- Evitar alterar schemas/presets compartilhados nesta fatia; se inevitável, designar um único dono e validar migração.

## Verificação

1. Testes focados por comando e UI, incluindo casos de conflito e não mutação.
2. `npm run check` completo, registrando falhas preexistentes separadamente das regressões desta rodada.
3. Após estabilizar o código, testes em composição descartável no After Effects real: criar, ajustar, desfazer, reabrir e comparar resultado visual/metadata. Registrar versão, SO, fixture e PASS/FAIL/NOT RUN em `docs/QA_MATRIX.md`.

## Reversão

Não há repositório Git neste snapshot de implementação. A reversão de cada fatia exige patch inverso dos arquivos identificados no relatório, sem apagar alterações alheias. No host, usar apenas composições de teste e Undo do próprio AE; não testar em projetos de usuário.
