# Etapa 3 — notificações como Web Component

- Extrair a apresentação de cada toast para elements/toast-view.ts e adicionar moti-toast em Light DOM, registro por documento sem globals no import e fallback article.
- Manter createToastRegion e contratos públicos: fila, limite de três, dedup, timers, foco/hover, pin, error recuperável, updateLabels, clear/dispose.
- Elemento cuida da apresentação; região continua dona do ciclo de vida. Remover/reinserir da fila não encerra o componente. Nenhuma alteração em host, contrato de comando ou exportação.
- Preservar classes/tokens/ARIA/movimento e callbacks; atributos reativos válidos atualizam conteúdo sem recriar ações ou perder foco. Contratos incompletos não podem disparar ações.
- Testar fallback, validação e ciclo da região com testes existentes e novos; registro/construção/reconexão/realm/atributos em Chromium real e resultado pelo bundle AE. Conferir PT/EN, dark/light, larguras 280/360/480/720. Hosts Adobe reais são evidência separada.
- Run baseline/final npm check, build, typecheck, validate, contrast, skills e testes. Comparar falhas globais com a etapa 2.
- Reversão: source-before e diff em artifacts/web-components-stage3; workspace sem Git. Builders não migrados permanecem disponíveis.
