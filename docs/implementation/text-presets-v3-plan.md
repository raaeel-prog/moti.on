# Texto v3: implementação isolada

Base: `81bfbccb23abf8660ed958db47c9a3e210fdf026`, com alterações locais de Momentum preservadas por patch binário verificado no commit `c8151cf`. Checkout de trabalho: `C:/dev/Moti.on-text-presets`. O checkout compartilhado permanece preservado.

## Fronteiras

- Contratos, schemas, integração e entrega: agente principal.
- Catálogo declarativo e requisitos: `text_catalog`.
- Renderização, propriedade de componentes e migração no host: `text_host`.
- Galeria, inspeção, variantes e simulação: `text_ui`.
- Probe, fixtures e vídeos originais: `text_host_evidence`.

## Invariantes

Uma raiz v3 contém `slots.in`, `slots.out` e `textEffect`, com controles independentes. Apenas IN/OUT possuem marcadores. Text Animators preservam Source Text e estilos. A remoção do último componente restaura o estado original; remoções intermediárias preservam os outros componentes. Propriedades globais de agrupamento exigem preflight de compatibilidade. Rigs v1/v2 migram durante edição e preservam identidades e cues. Falhas exigem rollback; comandos usam uma fronteira de Undo.

## Prova e rollback

O check inicial foi executado e falhou na verificação ES3 por uma ambiguidade lexical de ternário `?.5` já presente no Momentum. O log fica em `artifacts/text-presets/baseline-check.log`. A auditoria de dependências inicial registra vulnerabilidades preexistentes em `baseline-audit.json`; não autoriza atualização indiscriminada.

Após integração: check completo, contratos, migrações, isolamento dos componentes, falhas parciais e previews. Probe no After Effects 2026 em instância separada, com guarda de projeto vazio; fixtures e renders próprios. Vídeos são configurações fixas e a simulação representa alterações locais. Comparações registram origem, configuração e limitações. Instalação, testes automatizados e prova no Adobe têm estados separados.

Rollback local por branch/worktree, sem sobrescrever o checkout original. Empacotamento a partir de commit imutável, sem push/publicação.
