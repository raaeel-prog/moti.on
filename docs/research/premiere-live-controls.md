# Premiere Live Controls — pesquisa de API

Question: como ler e ajustar parâmetros reais de MOGRT/efeito sem criar sliders fictícios?

Decision date: 2026-09-05

Target host/version: Premiere Pro UXP 25.6+; diferenças de 26.3/26.5 verificadas.

Status: partial. APIs documentadas; ponte interna implementada e testada com
doubles. Renderer CHMS-045, Inspector e execução real ainda pendentes.

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---|---|---|
| Item expõe cadeia de componentes | `VideoClipTrackItem.getComponentChain(): Promise<ComponentChain>` | 25.6 | [VideoClipTrackItem](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/videocliptrackitem) | Reconsultar por operação; handles não são identidade persistente |
| Componente fornece parâmetros por índice | `Component.getParam(index)`, `getParamCount()`, `getMatchName()` | 25.6 | [Component](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/component) | Índice zero-based; matchName é assíncrono e identifica tipo, não instância |
| Parâmetro não fornece o `paramId` lógico da suíte | `ComponentParam.displayName`, `getValueAtTime(TickTime)` | 25.6 | [ComponentParam](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam) | Manifesto de authoring deve mapear ids/ordem/rótulos; não inferir a partir de displayName isolado |
| Escrita estática usa Actions | `createKeyframe(value)`, `createSetValueAction(keyframe, safeForPlayback)` | 25.6 | [ComponentParam](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/componentparam) | `createSetValueAction` exige stream não animado; `isTimeVarying()` é o gate |
| Cor usa objeto nativo, não array de bytes | `new Color(red, green, blue, alpha)` | 25.6 | [Color](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/color) | Canais entre 0 e 1; reader converte para RGBA JSON-safe |
| Lock/transação são síncronos; Action não pode escapar | `Project.lockedAccess`, `executeTransaction`, regras oficiais de Action | 25.6; restrição de criação endurecida em 26.3 | [Changelog](https://developer.adobe.com/premiere-pro/uxp/changelog/) e [pesquisa de transações](premiere-uxp-transactions.md) | Construir keyframes/Actions dentro do callback da transação sob lock |
| Seleção usa factory com callback | `TrackItemSelection.createEmptySelection(callback): boolean`, `addItem()` | 25.6 | [TrackItemSelection](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/trackitemselection) | Nenhuma promessa de abrir/focar o painel Essential Graphics |
| Retorno de seleção mudou | `Sequence.setSelection()` | 25.6; retorno síncrono desde 26.3 | [Sequence](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequence), [Changelog](https://developer.adobe.com/premiere-pro/uxp/changelog/) | `await` aceita Promise anterior e boolean atual |
| Tempo explícito é obrigatório na leitura | `ComponentParam.getValueAtTime(TickTime)` | 25.6; erro corrigido em 26.5 | [Changelog](https://developer.adobe.com/premiere-pro/uxp/changelog/) | Omissão antes podia deixar Promise pendente; 26.5 passou a rejeitar |
| Inserção de MOGRT é uma operação separada | `SequenceEditor.insertMogrtFromPath()` | 25.6 | [SequenceEditor](https://developer.adobe.com/premiere-pro/uxp/ppro-reference/classes/sequenceeditor) | Referência não oferece uma Action de inserção componível; não prometer transação atômica com Adjust |

Cross-check local: `node_modules/@adobe/premierepro/src/premierepro.d.ts`,
pacote instalado 26.3.0, consultado sem instalar dependência nova. Fontes são
primárias Adobe; nenhuma API QE, DOM legado de Premiere ou automação de UI.

## Implementation decision

`createPremiereLiveControls` oferece `inspect`, `read`, `update` e `reveal`,
somente para parâmetros já existentes. O manifesto versionado associa
`paramId`/`order`/rótulos bilíngues a um matchName e slots crescentes. Point é
representado por dois parâmetros numéricos X/Y de authoring; não assume que
todo MOGRT exponha esse layout nem que um PointF possa ser convertido por adivinhação.

O resolver exige um único componente compatível, confere quantidade, índices,
rótulos e APIs. Duplicatas são recusadas mesmo quando `indexHint` coincide.
Reordenação anterior à chamada é resolvida novamente. Metadados e valores são
copiados antes de enfileirar; accessors, dados não finitos e arrays inválidos
são recusados antes do host. A fila é por objeto Project e não persiste sessões.

Updates estáticos geram uma transação por chamada, não geram transação em no-op,
e releem o resultado real: clamp/quantização entram em `adjustedParamIds`.
Falha após commit informa `transactionExecuted` e recuperação por histórico de
Undo, sem afirmar rollback nem recomendar retry automático.

`expectedFingerprint` é obrigatório e é um detector otimista de conflitos, não uma identidade
de rig, assinatura de segurança ou compare-and-swap atômico. Inclui os valores
amostrados e o estado animado; mudar apenas o idioma da UI não o altera.

## Fallback

`CONTROLS_HOST_UNSUPPORTED`, motivo estruturado e texto normativo:

> Neste host os parâmetros ficam no Essential Graphics do item aplicado.

A ação `reveal-item` só fica habilitada com item, sequência e APIs de seleção.
Ela seleciona o item; não abre nem foca um painel Adobe. Parâmetros animados
continuam legíveis, mas um pedido que altere algum deles é recusado por inteiro,
preservando keys/interpolação. Não são criados controles substitutos no painel.

## Capability flag

O resultado interno `supported` depende do manifesto e de sondas de símbolos
por operação, não apenas da versão. O consumidor futuro deve aplicar também o
tier mínimo 25.6 da matriz do produto e traduzir este resultado para o envelope
de comandos. Não foi adicionada uma capability global que prometesse a feature
no painel antes dessa integração.

Não há novos acessos a rede, filesystem, processos, código dinâmico ou addon;
nenhuma permissão do manifest foi ampliada. Inserção futura por caminho tem seu
próprio gate de filesystem no renderer, fora desta ponte.

## Tests needed

Suíte automatizada em `apps/premiere-uxp/tests/live-controls.test.mjs` cobre
paridade, valores/tipos, no-op, animação, colisões, seleção, conflito, fila,
readback, entradas inválidas e falhas pré/pós-transação. Procedimento real e
lacunas: [CHMS-UX-007_TDD_EVIDENCE](../evidence/CHMS-UX-007_TDD_EVIDENCE.md).

## Open uncertainty

- Não existe fixture MOGRT real desta suíte validada nesta fatia. O manifesto é
  um mapa fornecido pelo renderer, não prova da versão/preset do item aplicado.
  CHMS-045 precisa conferir o campo interno de versão/preset exigido no MASTER.
- O chamador deve resolver projeto, sequência e item atuais por identidade
  estável a cada pedido. Não guardar o serviço/handles após mudança de projeto.
- A unidade/origem de TickTime para cada parâmetro deve ser provada com fixture
  real, incluindo clip deslocado/cortado. A ponte não converte tempo do CTI.
- Leituras assíncronas não constituem snapshot atômico do host. Edições externas
  entre a amostragem e o commit ainda exigem coordenação do consumidor/UX-008.
- Dentro do lock, o componente é buscado de novo no índice e comparado por
  referência ao resolvido. Troca/reorder ou wrapper diferente retorna
  `target-changed` antes da transação. Estabilidade de wrappers UXP não está
  provada: se o host devolver wrappers novos, esta ponte recusa a escrita em
  vez de arriscar outro componente. O smoke deve registrar essa disponibilidade.
- Coalescer drag em um Undo por gesto, sincronização, cancelamento de requests
  obsoletos e edição de keyframes não estão implementados por esta ponte.
- Legibilidade/editabilidade com plugin fechado, localização, seleção e Undo
  precisam de prova nas versões suportadas e em Windows/macOS.
