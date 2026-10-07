# Etapa 4 — seletores como Web Component

- Extrair selectField de shell.ts para elements/dropdown-view.ts, reutilizado por moti-dropdown e pelo fallback div. Registro lazy por documento, sem globals no import; Light DOM e classes existentes.
- Preservar assinatura SelectFieldOptions, select nativo e seus IDs, retorno HTMLElement, label/descrição, callback, foco e menus por teclado. Capacidade de Custom Elements independente da capacidade de overlay. Consumidores não precisam mudar.
- Um proprietário de menu por documento; shell fecha o menu ao redesenhar. Desconectar o elemento encerra portal/listeners sem destruir configuração. Opções antigas fechadas/removidas não podem confirmar valores.
- Propriedades value/label/description/disabled/disabledReason reativas após configure(options). Lista inicial copiada, valores dinâmicos ausentes e lista vazia continuam permitidos. Configuração inválida rejeitada antes de criar DOM. Não há parser declarativo de opções nesta etapa.
- Validar contrato Node, atributos/registro/reconexão reais em Chromium, teclado/foco, reversão de animação e paridade com fallback. Capturas PT/EN, dark/light, 280/360/480/720. Exercitar bundles existentes; host Adobe real permanece evidência separada.
- Rodar npm check e demais gates separadamente quando interrompidos pelo baseline conhecido (4 erros lint e 49 testes globais). Comparar falhas nominais.
- Reversão: source-before e changes.diff em artifacts/web-components-stage4. Sem alteração em adapters, comandos, persistência ou formato de presets. Workspace sem Git.
