# Revisão geral — estado de implementação em 8 de outubro de 2026

## Entregas integradas

- Inspeção de presets retorna contexto e controles de ferramentas identificados por assinatura do catálogo.
- Coordenador de seleção com leitura única e atualização de Editar enquanto o foco está no host.
- Presets incluem identidade da receita, FPS e drop-frame; remoção valida novamente o alvo capturado.
- Rascunhos em memória por camada/instância; proteção contra respostas atrasadas e reconstrução durante interação.
- Cores: estilos separados, confirmação hexadecimal deduplicada, cancelamento e erros nativos distintos, foco preservado.
- Grade sem Âncora/Criar nulo/Espelhar; opções completas disponíveis no menu de ações. Curvas builtin removidas da galeria.
- Configurações organizadas, restauração seletiva e recuperação de dados locais.
- Cliente de conta/PKCE, concessão offline assinada e fila de sincronização implementados; área de conta integrada.
- Operações mutantes exigem licença; configurações e suporte continuam disponíveis.
- Fonte do cofre nativo macOS/Windows com protocolo restrito por stdin/stdout. Compilação macOS verificada, requisições inválidas rejeitadas antes de acesso ao cofre.

## Validação

| Verificação | Estado |
| --- | --- |
| Interface real com componentes e CSS final em 280×280, 360×720, 480×800 e 720×900 | PASS — 13 verificações |
| Workspace de presets após proteção de cores | PASS — 64 testes |
| Suporte, adapter e Vertical Pulse após correção de transporte | PASS — 26 testes |
| Licença: sem configuração, sete dias exatos, assinatura inválida, logout e relógio | PASS — 5 testes |
| TypeScript, lint e subconjunto ExtendScript | PASS — conferência completa npm run check concluída |
| Suíte completa do repositório | PASS — 2309 testes, nenhuma falha |
| Funcionamento dentro do After Effects | NOT RUN, por solicitação do usuário |
| Google/Supabase online e assinatura/distribuição dos componentes nativos | NOT RUN |

## Trabalho restante

A revisão geral ainda não está concluída. O endpoint Supabase de conta/sincronização, integração dos dados locais reais com a fila por usuário, provisionamento Google/Supabase, distribuição/assinatura do cofre, compilação Windows e medição de desempenho com cinco amostras permanecem pendentes. Não há credenciais ou certificados no repositório.

Os editores genéricos de ferramentas permitem ajustar controles estáticos reconhecidos; leitura especializada de todas as estruturas persistentes e remoção segura de cada tipo ainda precisam de cobertura. Controles animados ficam bloqueados para preservar animação.

Configuração ausente é apresentada na Conta e não autoriza operações criativas. Este build não deve ser anunciado como entrega online pronta nem como validado no Adobe.
