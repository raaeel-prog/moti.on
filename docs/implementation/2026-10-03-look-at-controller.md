# Encarar — alvo compartilhado e aplicação direta

O olhinho na biblioteca Quick aplica `ae.3d.look-at` diretamente, com defaults independentes dos ajustes opcionais. Cria um nulo **Alvo (Moti.on)** com um único Layer Control **Moti.on Encarar**, que inicia apontando para o próprio nulo. Escolher outra camada nesse efeito muda o alvo de todos os seguidores; escolher um seguidor deixa a própria rotação desse alvo intacta. Não exige abrir o editor.

Camadas 2D recebem a expressão em Rotação Z, conservam sua rotação original como offset e usam a correção de 90° da referência fornecida pelo usuário. Camadas 3D recebem Orientation; o nulo só recebe 3D quando necessário para seguidores 3D. Nenhuma camada de origem é convertida. As expressões transformam a direção para o espaço do pai e protegem alvo coincidente ou inválido.

A falha anterior criava um Layer Control vazio em cada seguidor e não criava o controller compartilhado. Agora o alvo está no nulo e a seleção é copiada antes de sua criação, evitando alterações de índices e da seleção nativa. O alvo nativo acompanha identidade da camada ao reordenar a timeline. Metadata permite reaplicar sem duplicar o nulo; reaplicar também reconecta um controller renomeado. Expressões existentes do usuário e camadas bloqueadas são recusadas antes de mutação. As expressões exatas do GM podem ser reparadas, sem aceitar um corpo editado apenas pelo prefixo.

Uma falha no meio do lote restaura as expressões e seus estados, o alvo/dimensionalidade de um controller existente ou remove o controller recém-criado. O dispatcher continua responsável pelo único grupo de Undo. Não são alterados posição, parentesco, timing ou keyframes dos seguidores.

## Evidência

- `npm run check`: **PASS**, 1.913 testes, lint, ES3, tipos, build, contratos, contraste e skills.
- Chromium com bundle distribuído e somente transporte CEP simulado: **PASS**, quatro cenários PT-BR/inglês. Clique e Enter emitem uma ativação cada, permanecem no Quick, usam cinco camadas 2D sem configuração e bloqueiam seleção vazia.
- AE **26.5x89**, macOS **27.2.0/64**: **PASS**, oito cenários. Cinco seguidores 2D conferidos por valores de rotação; mover nulo; trocar alvo; reaplicar sem duplicação; reparar nome; compensar pai 2D; rejeitar lock; Orientation 3D e direção +Z real, incluindo pai 3D rotacionado. Expressões sem erro; composições temporárias removidas e composição do usuário restaurada. O erro nativo de acessar o índice 2 de um vetor 2D foi encontrado e corrigido com a verificação de dimensionalidade.
- Rollback de lote e de controller existente: **PASS**, testes do host simulado.
- Instalação: **PASS**, 43 arquivos conferidos por SHA-256, com backup da instalação anterior em `artifacts/install-backups/ae-20261003-012310/previous`.
- Undo nativo: **NOT RUN**. Setup e Apply temporários passaram; o menu Editar expôs “Não é possível desfazer”, nenhuma ação de Undo foi disparada e a fixture foi limpa. A abertura/fechamento do grupo e rollback foram verificados nos testes, sem substituir a confirmação nativa.
- Clique no painel Adobe após recarregar a instalação: pendente da reabertura do painel. Premiere real, demais versões/SO, salvar/reabrir rig e demais eixos 3D no host real: **NOT RUN**. Os seis eixos continuam cobertos pelos testes de paridade matemática.

Fontes e build anteriores preservados em `artifacts/look-at-controller-20261003/source-before` e `dist-before`; cópia final em `source-after`. Resultados reproduzíveis: `full-check.log`, `browser-report.json`, `host-report.json`, `undo-report.json` e `install-verification.json` na mesma pasta.
