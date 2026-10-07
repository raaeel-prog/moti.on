# Coleção Studio — entrega e validação

## Resultado

32 presets próprios adicionados: 8 por caracteres, 6 por palavras, 6 por linhas, 4 efeitos contínuos de texto e 8 de movimento (6 em 2D, 2 em 3D). Total: 88 receitas na biblioteca de motion/texto e 105 itens na galeria, incluindo curvas e câmeras. As primeiras 56 receitas conservam dados, IDs e comportamento legado; teste de hash protege seu catálogo.

Em **Presets → Studio · Novos**, selecionar uma receita, ajustar e aplicar à seleção. Depois de atualizar os arquivos, reabrir o painel carrega a interface nova. **Refinar movimento** mostra apenas controles aplicáveis à receita. **Restaurar padrão** repõe o rascunho da receita; clicar Aplicar envia os valores ao AE.

## Movimento e controles

- Duração inicial individual de 32–48 frames. Em 30 fps, aproximadamente 1,07–1,6 s. Curvas `silk`, `glide` e `spring` terminam com velocidade nula; a mola amortece o movimento e elimina o resíduo antes da extremidade.
- Elasticidade de 0–100%, em receitas com mola. Valores iniciais baixos, com ultrapassagem contida.
- Sobreposição de 0–100%, em entradas/saídas de texto. Mais sobreposição aproxima os inícios. O atraso total ocupa no máximo 45% do intervalo, deixando pelo menos 55% para cada unidade se mover, inclusive com texto longo.
- Velocidade de 25–200%, em efeitos contínuos. Padrões entre 50–65% deixam a oscilação lenta e discreta.
- Ordem progressiva, inversa, do centro para as bordas, das bordas para o centro ou embaralhada determinística, conforme a receita. Foco por unidade de texto nas receitas que usam desfoque.
- Controles nativos editáveis no AE; reaplicar ajusta a mesma instância sem duplicar efeitos. Texto, keyframes existentes, comentários e estado 2D/3D são preservados conforme o contrato anterior.
- Botão Aplicar fora da área rolável dos parâmetros, inclusive em 280 px. Miniaturas Studio mostram um ponto legível da transição; ao interagir, a prévia anima.

## Receitas novas

| Preset | Família | Duração padrão (frames) |
|---|---|---:|
| Letras em seda | Caracteres | 40 |
| Foco que floresce | Caracteres | 44 |
| Entreletras no ar | Caracteres | 46 |
| Cascata delicada | Caracteres | 42 |
| Giro aveludado | Caracteres | 40 |
| Letras em encontro | Caracteres | 44 |
| Letras que respiram | Caracteres | 40 |
| Inclinação fluida | Caracteres | 38 |
| Palavras editoriais | Palavras | 40 |
| Palavras em foco | Palavras | 44 |
| Composição central | Palavras | 42 |
| Palavras em linho | Palavras | 40 |
| Espaçamento acetinado | Palavras | 46 |
| Palavras sem peso | Palavras | 44 |
| Títulos em ascensão | Linhas | 42 |
| Linhas no horizonte | Linhas | 44 |
| Linhas em nitidez | Linhas | 46 |
| Abertura delicada | Linhas | 42 |
| Linhas suspensas | Linhas | 44 |
| Linhas que se acomodam | Linhas | 48 |
| Maré tipográfica | Texto contínuo | 48 |
| Ritmo no ar | Texto contínuo | 48 |
| Respiração acetinada | Texto contínuo | 48 |
| Ondulação de seda | Texto contínuo | 48 |
| Ascensão de seda | Motion 2D | 40 |
| Chegada em nitidez | Motion 2D | 44 |
| Deslize de vidro | Motion 2D | 38 |
| Arco amortecido | Motion 2D | 42 |
| Aproximação serena | Motion 2D | 48 |
| Abertura de papel | Motion 2D | 40 |
| Giro de galeria | Motion 3D | 44 |
| Cartão flutuante | Motion 3D | 46 |

A duração não controla os quatro efeitos contínuos; neles, usar Velocidade.

## Evidências

Pasta: `artifacts/studio-presets/`.

| Verificação | Resultado | Evidência |
|---|---|---|
| Build, validação, lint, tipos, contraste | PASS | `check.log` |
| Suíte geral | 1210/1232 PASS; 22 FAIL preexistentes | `check.log`, `regression-comparison.json` |
| Catálogo/contrato/matemática/galeria/Home focados | 29/29 PASS | `targeted-tests.log`; novamente cobertos pela suíte geral final |
| Skills do repositório | PASS | `skills.log` |
| 88 presets: aplicar, amostrar expressões em 31 tempos, ajustar, remover | PASS | `host-results.json` |
| 64 renders nativos, início e repouso dos 32 novos presets | PASS | `renders/`, `contact-0.jpg`, `contact-1.jpg` |
| 11 grupos de ciclo de vida | PASS | `lifecycle-results.json` |
| Desfazer um preset Studio de texto | PASS | `undo-results.json` |
| Velocidade nativa altera o render | PASS | `speed-25.png`, `speed-200.png`, `render-check.json` |
| Painel em 280/360/480/720 px, filtros, busca, padrões, reset e envio de opções | PASS | `ui-results.json`, `ui-*.png` |
| 88 presets executados a partir do host instalado | PASS | `installed-host-results.json` |
| Arquivos instalados idênticos ao build | PASS, 66 arquivos | `install-verification.json` |

Ciclo de vida inclui keys existentes, intensidade zero, expressão em conflito, camada bloqueada/seleção mista, rollback após falha induzida, Bake com amostras equivalentes, expressão do usuário preservada, camadas de quatro frames em 24/29,97/60 fps e três fases, controles após recarga do host, opções inválidas sem mutação, seleção vazia/alvo incorreto e texto de 1040 caracteres. Aplicação mais um render dessa fixture longa: 47 ms nesta máquina; amostra isolada, sem benchmark comparativo de desempenho.

Undo foi executado em chamadas separadas, após interromper a reprodução da fixture. A ação exata “Desfazer Moti.on: aplicar preset” resolveu para o comando 16 e removeu os cinco controles, os dois animadores e os metadados. Não foi usado Undo genérico sobre a composição do usuário.

Host: After Effects **26.5x89**, macOS-26.6.2-arm64-arm-64bit. Fixtures temporárias próprias, referências guardadas, restauração da composição anteriormente ativa. Nenhuma gravação/sobrescrita do projeto do usuário foi necessária.

SHA-256 de `host/index.jsx`: `b5f2829fe1f235e869e86cb39a10c029bfcb457d5492735a2c68a9b35f74cd2b`.

## Instalação e limites

Atualização local de desenvolvimento instalada em `~/Library/Application Support/Adobe/CEP/extensions/com.motion.plugin.ae`. Backup da instalação anterior: /Users/rael/Documents/ChatGPT/Moti.on/implementation/artifacts/install-backups/ae-20260915-191631/previous

- A suíte completa continua vermelha pelas mesmas 22 falhas anteriores de expectativas de controles agrupados/listas de arquivos e globais. Comparação de nomes confirma zero falhas novas; essas expectativas não foram afrouxadas.
- Bake converte presets de motion; texto continua editável por animadores, conforme a biblioteca anterior.
- Recarregar o código do host com um preset aplicado foi verificado. Fechar/reabrir o aplicativo ou salvar/reabrir `.aep` não foi executado, para preservar a sessão atual.
- Premiere, Windows e outras versões de AE não foram testados nesta entrega. Não se trata de pacote comercial assinado/publicado.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1210/1232 passed (22 preexisting failures)
Contract tests:    PASS — included in focused and full suites
Golden tests:      PASS — native renders and panel screenshots reviewed
AE host:           PASS — 26.5x89/macOS/temporary fixtures
Premiere host:     NOT RUN — outside this AE feature
Performance:       NOT MEASURED — one long-text timing recorded, no baseline
Packaging:         PASS — local dev install and checksums; release NOT APPLICABLE

Overall: NOT READY for production release; local development update installed
Blocking evidence:
- 22 preexisting failures keep the repository-wide release gate red.
- Commercial release/host matrix was not part of this request.
```
