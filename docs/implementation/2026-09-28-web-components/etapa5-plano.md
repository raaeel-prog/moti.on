# Etapa 5 — avisos e indicadores em Light DOM

- Migrar createAlert e createBadge mantendo seus contratos e consumidores atuais em ferramentas/presets. Slider permanece para etapa própria: atualmente não há consumidor de produto dessa factory.
- Novos elementos moti-alert e moti-badge, registro lazy por realm com fallback div/span, sem globals no import nem Shadow DOM. Compartilhar apresentação entre nativo e fallback.
- Root é proprietário de contrato e integração (components/index), implementação alert e verificação; subagente pode implementar badge isoladamente. Sem Git: coordenar arquivos e preservar source-before.
- Alert conserva dismiss/dispose, scheduler, animação, retorno de foco, texto e ações estáveis. Atributos cosméticos não recriam ações. Ações fechadas, inválidas ou removidas não podem chamar consumidores. Retirar um aviso cancela callback de fechamento pendente sem chamar onDismiss após a view sumir; reconectar preserva apresentação.
- Badge mantém rótulo sempre visível, tom e opção de ícone, sem virar live region.
- Validar opções antes de mutação, sem alterar adapters, comandos, Undo ou persistência. Estudar compatibilidade de assertive existente; não inventar novas restrições de tom.
- Build, testes focados/negativos, registry/realms/atributos/reconexão/teclado/tempos em Chromium, paridade com fallback em PT/EN dark/light 280/360/480/720, integração pelo bundle existente de AE. Full check e demais gates separados; comparar com baseline4lint49falhas. Adobe real NOT RUN quando não houver evidência.
- Reversão por source-before/changes.diff/changed-files.json em artifacts/web-components-stage5.
