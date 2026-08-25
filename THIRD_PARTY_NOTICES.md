# Avisos de terceiros

## Adobe CSInterface.js

O arquivo abaixo é fornecido pela Adobe como parte dos recursos oficiais do CEP e mantém o aviso autoral original dentro do próprio código:

`apps/after-effects-cep/client/lib/CSInterface.js`

Ele não é relicenciado pela licença MIT deste starter. Seu uso, modificação e distribuição permanecem sujeitos aos termos indicados pela Adobe no cabeçalho do arquivo e nos recursos oficiais do CEP.

## Ajv

Os validadores em `packages/contracts/src/generated/schema-validators.ts` são
gerados em build a partir dos JSON Schemas com Ajv 8. Ajv é usado somente como
dependência de desenvolvimento; o artefato standalone não compila schemas nem
usa geração dinâmica de código em runtime.

Ajv é distribuído sob a licença MIT. Copyright (c) 2015-2026 Evgeny
Poberezkin e colaboradores.
