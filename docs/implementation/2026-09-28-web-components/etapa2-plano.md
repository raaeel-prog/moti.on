# Etapa 2 — reescrita das telas Sistema e Diagnóstico

- Extrair Sistema dos main.ts para views específicas dos hosts, conservando resultados e mensagens.
- Compartilhar apresentação do Diagnóstico: logs em ordem reversa, estado vazio e três ações, sem acesso a filesystem/logger/host na UI.
- Criar barra de ações com moti-button e fallback, responsável pelo bloqueio de callbacks após dispose.
- Integrar lifecycle: descartar a view anterior ao render e ao destruir/fechar o painel. Manter request-scope do Premiere e conferir busy ao despachar.
- Preservar os executores existentes e todos os comandos/contratos; não migrar createDemo nem editores de ferramentas.
- Conferir teclado, suporte/indisponibilidade, cliques em referências antigas, exportação, locale, layout 280/360/480/720 e builds dos dois painéis.
- Baseline check: FAIL nos mesmos quatro erros de lint da etapa 1. Rodar check final e gates separados quando necessário. Hosts Adobe reais continuam com evidência própria, nunca inferida do navegador.
- Reversão: fontes desta etapa em artifacts/web-components-stage2/source-before; checkout não possui Git.
