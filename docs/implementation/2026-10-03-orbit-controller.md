# Órbita — um clique e controles no nulo

A ferramenta **Órbita** da biblioteca Quick aplica imediatamente à seleção, seguindo o fluxo de Encarar. Cria o nulo 3D **Órbita (Moti.on)** no centro da composição, converte as camadas visuais compatíveis para 3D e distribui sua posição em torno dele. O raio inicial é 25% do menor lado da composição e a velocidade é 60°/s. Os objetos conservam sua orientação por padrão.

As opções mostram oito presets que também aplicam ao clicar: frontal, horizontal, vertical, diagonal, diagonal inversa, lateral, esfera e esfera inclinada. Os seis primeiros distribuem um anel em planos diferentes; os dois últimos distribuem os objetos por latitudes e longitudes de uma esfera. Os ajustes adicionais ficam recolhidos no painel.

O nulo contém nove controles nativos: modo orbital, raio, velocidade, inclinação X, perspectiva Y, rotação Z, fase, distribuição esférica e encarar o centro. Mudar esses valores ou mover o nulo atualiza toda a órbita sem reaplicar. Os controles podem receber keyframes e expressões. A trajetória local usa o Anchor Point do parent como centro; os três ângulos aplicam rotações que conservam o raio.

Selecionar um membro ou somente o nulo permite reutilizar o conjunto completo, sem duplicação. O clique normal do Quick conserva os ajustes existentes e o histórico dos pedidos avançados; um preset explícito muda o modo e zera os três ajustes adicionais de perspectiva. Se modo ou ângulos estiverem animados, a troca de preset é recusada antes da edição. Ajustes manuais no nulo têm prioridade sobre valores antigos do painel.

As expressões leem os efeitos por nome através de `parent`, sem usar nome ou índice de camada. Metadata conserva a ordem dos membros ao reordenar a timeline. Rigs legados reconhecidos recebem os novos controles mantendo a convenção angular anterior. Camadas com outro parent, Position animada/separada, Orientation animada ou expressão de usuário são recusadas antes de mudar o lote. O dispatcher mantém um único grupo de Undo.

Em caso de falha, o comando restaura parent, dimensionalidade, valores subjacentes, expressão/estado, controles, comentário e seleção; remove o nulo criado na operação. Orientation é restaurada enquanto a camada ainda está em 3D, antes de voltar para 2D. Uma falha ao ativar 3D que deixa a camada intacta não apaga sua expressão de Orientation oculta. Bake amostra Position e Orientation antes de escrever keys, com limite de 18.000 amostras.

## Evidências

| Verificação | Resultado | Evidência |
|---|---|---|
| Checagem completa | **PASS** — 1.961/1.961 testes, zero falhas/skips; lint, ES3, tipos, build, contratos, contraste e skills | [full-check.log](../../artifacts/orbit-controller-20261003/full-check.log) |
| Dinâmica, preflight e rollback do novo rig | **PASS** — 32 cenários; controles nativos recriados, oito modos, edições manuais/animadas, legado, conflitos e falhas intermediárias | `apps/after-effects-cep/tests/orbit-live-controls.test.mjs`, incluído no check |
| Interface em Chromium 151.0.7922.34 | **PASS** — dez grupos PT-BR/inglês, clique/Enter, oito ações diretas, ajustes, erros e larguras 280/360/480/720 px; zero erros de console | [browser-report.json](../../artifacts/orbit-controller-20261003/browser-report.json), oito capturas na mesma pasta |
| Interface e build final | **PASS** — HTML/JS/CSS finais têm os mesmos hashes usados na inspeção Chromium | [browser-build-verification.json](../../artifacts/orbit-controller-20261003/browser-build-verification.json) |
| AE 26.5x89 / macOS 27.2.0/64, arm64 | **PASS** — nove cenários: doze camadas, nove controles no nulo, oito modos, raio constante, ângulos, encarar, reaplicar, renomear/reordenar, animação, lock e Bake | [host-report.json](../../artifacts/orbit-controller-20261003/host-report.json) |
| Recuperação nativa após falha | **PASS** — criação com três camadas 2D e inclusão de camada 3D em nulo rotacionado; estado, seleção/CTI e rig anterior restaurados | [native-rollback-report.json](../../artifacts/orbit-controller-20261003/native-rollback-report.json) |
| Precisão de Bake nativa | **PASS** — seis frames conferidos, diferença menor que 0,001 px, Position/Orientation sem expressão e com seis keys | `host-report.json` |
| Instalação de desenvolvimento | **PASS** — 43 arquivos iguais ao build por SHA-256; backup anterior preservado | [install-verification.json](../../artifacts/orbit-controller-20261003/install-verification.json), [install.log](../../artifacts/orbit-controller-20261003/install.log) |
| Preview visual Adobe, clique no painel recarregado e Undo nativo | **NOT RUN** — Mac bloqueado no momento da inspeção CUA. A fixture visual foi criada e removida; não houve confirmação visual nem comando de Undo | [ui-host-report.json](../../artifacts/orbit-controller-20261003/ui-host-report.json) |
| Salvar/reabrir e outras versões/SO | **NOT RUN** — não foi salvo nem substituído o projeto do usuário | Limite da matriz desta revisão |

Todas as composições temporárias dos testes nativos foram removidas, com retorno à composição anteriormente ativa. O check executa os adaptadores simulados; a interface Chromium usa transporte CEP simulado, sem substituir a prova nativa dos valores. As alterações no helper compartilhado de Live Controls foram verificadas na suíte completa. A pesquisa do dropdown nativo e as fontes Adobe estão em [controles editáveis da Órbita](../research/after-effects-orbit-live-controls.md).

## Desempenho e recuperação

Na máquina `Mac17,3`, arm64, dez CPUs, a aplicação em doze camadas levou **185 ms**. Cinco reaplicações aquecidas levaram **86, 76, 85, 87 e 91 ms**: mediana **86 ms**, máximo **91 ms**. É tempo do dispatcher no host; não inclui transporte CEP nem render da composição. O alvo de cerca de um segundo para comandos simples foi atendido nessa fixture. Não foi medida comparação de desempenho com a implementação anterior nem uma composição grande. Os valores brutos estão no relatório nativo.

O backup original da extensão está em `artifacts/install-backups/ae-20261003-145641/previous`. A instalação final tem outro backup registrado em `install.log`. Fontes anteriores de Órbita/expressões e cópia final dos arquivos alterados estão em `source-before`/`source-after`; o bundle final está em `dist-after`, dentro de `artifacts/orbit-controller-20261003`. Este workspace não é um checkout Git; não foi criado um pacote de distribuição assinado.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1961/1961 passed — suíte integrada, incluindo contratos/host mocks
Contract tests:    PASS — incluídos na suíte integrada; sem contagem isolada
Golden tests:      NOT APPLICABLE — sem golden de trajetória; oito capturas UI revisadas
AE host:           PASS — 26.5x89/macOS 27.2 arm64; nove cenários + dois de rollback
Premiere host:     NOT RUN — comando exclusivo do After Effects
Performance:       PASS — fixture de 12 camadas; dispatcher mediana 86 ms aquecido
Packaging:         PASS — instalação local, 43 arquivos conferidos; distribuição não aplicável

Overall: NOT READY — validação Adobe completa/matriz de release
Blocking evidence:
- Preview/clique após recarga e Undo nativo NOT RUN por bloqueio do Mac.
- Salvar/reabrir e outras versões/SO NOT RUN; sem release assinado solicitado.
```
