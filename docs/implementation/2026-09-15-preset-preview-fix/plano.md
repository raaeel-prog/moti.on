# Correção da galeria de presets

Referência: gravação e transcrição de 2026-09-15 19:16.29, tratadas como feedback de produto. Usuário confirmou divisor entre categorias laterais e miniaturas. Confirmar se início invisível se aplica também à camada antes de mudar receitas nativas.

UI: categorias laterais, divisor arrastável e acessível por teclado, largura lembrada na navegação; configurações em sobreposição acionada pelo botão do card, Escape/fechar/click externo; seleção e prévia sem abrir painel permanente; Aplicar explícito preservado.

Prévia: frame parado legível; hover/click reinicia do início; ciclo completo com pausa, tempo legível, entrada e saída visíveis; respeitar movimento reduzido e liberar listeners/RAF. Investigar enquadramento e início das receitas sem fade. Preservar as 88 receitas e contratos até esclarecer escopo nativo.

Arquivos: preset-gallery.ts, motion-library-preview.ts, theme.css e testes de UI/pureza. Rodar checks completos, verificar matriz 280/360/480/720 px e host instalado. Backup de fontes em artifacts/preset-preview-fix/source-before; instalação dev com backup. Não modificar composições do usuário durante testes.


Confirmação recebida: correção também na camada aplicada. Contrato revisado por agente responsável: somente 15 flags fade passam para true; 29 receitas não transitórias intactas. Host separa peso de fade da ondulação.
