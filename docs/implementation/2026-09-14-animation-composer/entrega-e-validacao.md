# Biblioteca de presets — entrega e validação

## Entrega

56 receitas próprias implementadas a partir dos comportamentos catalogados no vídeo. As seis curvas e os onze movimentos de câmera existentes foram mantidos: a galeria tem 73 itens.

- Motion 2D: 9; motion 3D: 7; efeitos de motion: 20.
- Transições de texto: 15; efeitos de texto: 5.
- Categorias, pesquisa, favoritos e recentes; seleção separada do botão Aplicar.
- Entrada, saída ou ambas, duração em frames, intensidade, direção quando aplicável, e divisão do texto em caracteres, palavras, linhas ou texto inteiro.
- Remoção do preset gerenciado e conversão de motion em keyframes.
- A prévia da curva segue a própria linha. Miniaturas animam individualmente e não enviam comandos ao host.

O código e as miniaturas são originais. Nenhum arquivo `.ffx`, expressão, imagem ou código do Animation Composer foi importado. Os nomes da referência constam apenas no catálogo de pesquisa.

## Funcionamento

Transições se vinculam aos limites da camada. Em camadas curtas, a duração se comprime para caber; o intervalo entre unidades de texto é incluído nesse limite. Transformações são aditivas aos valores e keyframes originais. O excesso de movimento de curvas com mola é preservado tanto na entrada quanto na saída.

Texto usa animadores e seletores nativos, mantendo o conteúdo editável. Efeitos usam propriedades nativas disponíveis em tempo de execução. O host verifica a capacidade de adicionar cada efeito antes da aplicação.

Cada camada recebe um preset gerenciado por vez. Reaplicar o mesmo ajusta os controles, sem duplicar grupos. A troca de preset exige Remover da seleção. Expressões alheias ou modificadas manualmente são preservadas e produzem recusa explícita, para que o usuário resolva o conflito.

## Evidência

Artefatos em `artifacts/presets/`.

| Verificação | Resultado | Evidência |
|---|---|---|
| 56 presets: aplicar, avaliar expressões em 31 tempos, reajustar, remover | PASS no After Effects 26.5x89 / macOS | `host-results.json`, `verify-library.jsx` |
| Preservar comentário, seleção, tempo, conteúdo do texto e estado 2D | PASS | Mesmo teste |
| Preservar keyframes e recusar expressões conflitantes | PASS | `lifecycle-results.json` |
| Intensidade zero e parâmetros inválidos | PASS | `lifecycle-results.json` |
| Falha injetada na segunda camada restaura a primeira | PASS | `lifecycle-results.json` |
| Undo entre chamadas separadas no host real | PASS | `undo-results.json` |
| Bake reproduz amostras do movimento | PASS | `lifecycle-results.json` |
| Camadas de 4 frames, 24/29.97/60 fps, entrada/saída/ambas | PASS | `lifecycle-results.json` |
| Galeria a 280/360/480/720 px, opções enviadas, pesquisa, texto, curva, ações, ausência de erros e overflow | PASS | `ui-results.json`, `ui-*.png`, `verify-ui.mjs` |
| 112 frames nativos (entrada e repouso) revisados visualmente | PASS | `renders/`, `renders-motion.png`, `renders-text.png` |
| 21 testes específicos do catálogo, matemática e painel | PASS | `targeted-tests.log` |
| Lint, tipos, build, validação do pacote e contraste | PASS | `check.log` |
| Suíte geral | FAIL: 1202 PASS / 22 FAIL | `check.log` |
| Skills do repositório | PASS | `skills-validation.log` |
| Instalação idêntica ao build por SHA-256 | PASS | `installed-build.json` |
| Comparação com estado anterior | PASS: mesmas 22 falhas, nenhuma nova | `regression-comparison.json`, `baseline-tests.log` |

O Undo foi executado pelo comando público do host, resolvendo o nome completo “Desfazer Moti.on: aplicar preset”, entre chamadas separadas. A execução dentro do mesmo script foi descartada como teste inadequado do limite de Undo. Scripts reproduzíveis em `artifacts/presets/undo/`.

As 22 falhas anteriores são expectativas antigas sobre controles agrupados e seu inventário de build. Foram reproduzidas numa cópia do projeto com os arquivos anteriores a esta implementação. Não foram removidas ou marcadas como ignoradas para tornar o resultado verde.

## Limites explícitos

- Reabertura de projeto salvo e teste de desinstalação: NOT RUN.
- Validação nativa realizada em AE 26.5x89/macOS. Windows e versões anteriores: NOT RUN.
- As miniaturas são ilustrações. Renderização 3D, deformações, efeitos de cor e sombra podem diferir do host e das referências comerciais.
- Extrusão/sombra longa são simulações 2D compostas de efeitos nativos. Não geram geometria 3D.
- Recusa de conversão automática de 2D para 3D quando há câmera ativa, parent ou pré-composição com transformações recolhidas. A camada pode ser convertida explicitamente pelo usuário.
- Position com dimensões separadas precisa ser reunida para aplicar motion.
- Bake aceita até 1.800 frames por camada e recusa propriedades com keyframes prévios. Animadores de texto permanecem editáveis; não são convertidos por esse comando.
- Máscara da cortina de palavras captura os limites do texto no momento da aplicação; ao mudar o tamanho do texto, remova e reaplique esse preset.
- Remover exige que os grupos e expressões gerenciados continuem identificáveis. Alterações manuais nesses itens podem exigir Undo.
- Aprovação visual de equivalência exata com cada preset comercial: NOT RUN. O objetivo é reproduzir famílias de comportamento com receitas próprias.

## Instalação e reversão

Atualização de desenvolvimento instalada em `~/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`. O painel atualizado foi observado no After Effects com categorias de motion e texto, nomes visíveis e rodapé de ações.

Backup anterior: `artifacts/install-backups/ae-20260915-005815/previous`. Fontes anteriores: `artifacts/presets/source-before/`. A cópia do projeto não contém `.git`.
