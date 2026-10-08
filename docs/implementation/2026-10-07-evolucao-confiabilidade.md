# Evolução de confiabilidade e fluxo (07/10/2026)

Origem: análise do plugin pedida pelo responsável em 07/10/2026 e aprovada com
"faça todas as melhorias". Escopo: painel do After Effects (CEP/ExtendScript).
Layout, ferramentas e dados existentes foram preservados; nenhum formato salvo
mudou de versão.

## Entregue

### 1. Erros com motivo e solução
- `host/src/errors.jsx` (`MotionErrors`): falhas carregam uma **chave** de uma
  lista fechada (`hostError.*`), nunca texto livre. O dispatcher continua
  normalizando o código como antes (só `ROLLBACK_FAILED` atravessa) e repassa
  apenas `details.messageKey`/`messageParams` (escalares, até 80 caracteres).
- Requisitos ausentes (`hasProject`, `hasActiveComp`) e "nenhuma alteração"
  ganharam chave; `ROLLBACK_FAILED` sem chave recebe `hostError.rollbackIncomplete`.
- Keyframes (`MotionKeyframes.applyEdit`), Clean e Fast Edit marcam suas falhas
  de execução (escrita recusada e restaurada, restauração incompleta, remoção
  parcial com contagem).
- Painel (`client/src/host-feedback.ts`): ordem chave traduzida → mapa de frases
  conhecidas → frase de preflight do host (só em pt-BR, filtrando caminhos,
  códigos crus e restos de exceção) → genérico. Avisos (`warnings`) passam pelo
  mesmo filtro em vez de aparecer crus.
- `INVALID_PRESET` passou a recuperável, com ação "Confira os ajustes da
  ferramenta" (`error.action.checkSettings`). Era usado em 451 pontos, quase
  sempre para ajuste fora da faixa, e mandava o usuário ao suporte.

### 2. Checagem de camada comum
- `host/src/preflight.jsx` (`MotionPreflight`): camada bloqueada (direta ou dona
  da propriedade selecionada) recusada antes do Undo, sempre com
  `INVALID_SELECTION_TYPE` + `hostError.layerLocked`; sonda de efeito por
  `canAddProperty`.
- Aplicada aos 10 comandos que não verificavam bloqueio: Inertial, Jump, Cortar
  keys, Delay, Inverter valores, Parent, Effector, Separar formas, Trim Paths e
  Fast Edit. Gradientes, Wave, Partículas e Encarar trocaram `TRACK_CONFLICT` /
  `HOST_OPERATION_FAILED` pelo código comum.
- Fast Edit ganhou restauração interna: cada escrita registra como voltar, e uma
  recusa do AE no meio desfaz o que já mudou (`writeRefusedRestored`) ou avisa
  `ROLLBACK_FAILED`. Precompose continua sendo uma chamada única.
- Clean já exige marcar os itens antes de remover; a falha parcial agora informa
  quantos itens saíram.

### 3. Requisitos dos presets visíveis
- `packages/contracts/src/motion-library-requirements.ts`: `libraryRequiredEffects`
  é a **mesma função** no host (serializada em `MotionLibraryCore`, chamada pelo
  preflight de `ae.presets.apply`) e na galeria. `motionLibraryRequirements`
  resume tipo de camada, 3D, Moti.on Core e Cycore.
- `ae.context.read` devolve `selectionTextLayerCount` e
  `selectionLockedLayerCount`.
- Galeria: selos no inspector (Texto / Camada visual / Pré-comp, 3D,
  Moti.on Core, Cycore), selo "Core" no card, aviso "a prévia mostra a receita
  numa cena de exemplo" e Aplicar desativado com motivo para seleção bloqueada ou
  com camadas que não são texto. Host antigo sem os campos novos nunca bloqueia.

### 4. Fluxo e dados
- Preferências (`panel-preferences.ts`, mesma chave e versão 1, campos
  aditivos): última aba principal, categoria/filtro/busca/preset da galeria e
  ajustes alterados não aplicados (até 24, cedem primeiro ao teto de 32 KB).
  Registro ilegível ou de versão desconhecida é copiado para
  `motion.panel.preferences.v1.unreadable` antes da primeira gravação; sem espaço
  para a cópia, o painel fica só na sessão e não sobrescreve. Configurações
  mostram o aviso.
- Gradientes e curvas pessoais (`storage-safety.ts`): cada gravação guarda a
  versão anterior em `<chave>.bak`; um registro que a leitura não aproveitou por
  inteiro vai para `<chave>.unreadable` e nunca é sobrescrito. Formatos mantidos.
- "Salvar como variação" no painel de ajustes da galeria, sem aplicar antes;
  nomes repetidos ganham "(2)", "(3)".
- Tooltip das ferramentas: nome, descrição e o que o clique faz.
- Aviso de sucesso do Quick com "Ajustar", que abre o editor da ferramenta.
- Pedido acima de 60.000 caracteres: `buildFileDispatchCall` devolve falha
  completa com `requestId` quando o host não lê o arquivo (antes: timeout mudo).

## Decisões e o que ficou de fora
- **Desfazer no aviso: não implementado.** O item do menu Editar muda de texto
  conforme a última ação ("Desfazer <ação>"), `findMenuCommandId` exige o texto
  exato e traduzido, e o projeto proíbe IDs numéricos fixos
  (`developing-after-effects-cep`). Não há caminho documentado e seguro.
- **Minificar o bundle (H1): rejeitado pela medição.** Compilação do
  `main.js` (2.054 KB) com mediana de 9,6 ms contra 7,7 ms minificado (1.198 KB),
  Node 24/V8, 7 rodadas. Ganho de ~2 ms não paga a perda de depuração no CEP. A
  avaliação do host (`$.evalFile` de 1,8 MB no ExtendScript) não foi medida:
  `NOT RUN`.
- **Virtualizar a galeria (H2): rejeitado pela medição.** 238 cards, 3.878 nós,
  montagem inicial 6,7 ms e redesenho completo com mediana de 18,9 ms (Chromium
  do app, 360 px).

## Verificação
- `npm run check`: **PASS** — lint + subconjunto ExtendScript (86 arquivos),
  typecheck, build, validate, contraste 152 pares, **2.227/2.227** testes, skills.
- Testes novos: `apps/after-effects-cep/tests/host-error-keys.test.mjs`,
  `preset-requirements.test.mjs`, `storage-safety.test.mjs`;
  `packages/ui-core/tests/panel-preferences-memory.test.mjs`;
  `packages/contracts/tests/file-dispatch.test.mjs`; caso novo em
  `packages/ui-core/tests/feedback.test.mjs`. Testes ajustados por mudança
  intencional: Partículas (código de bloqueio), snapshot de preferências
  (campos aditivos), tooltip da biblioteca (descrição), harnesses de preset
  (módulo de requisitos), globais permitidos do host.
- Chromium (QA em `artifacts/plugin-evolution-20261007/`, host falso): **PASS** —
  selos e motivo de bloqueio em 280/360/720 px, PT e EN, sem rolagem
  horizontal; "Salvar como variação" grava e numera; selo Core movido para a
  esquerda após sobrepor a estrela na primeira rodada.
- **After Effects real: NOT RUN** (`IMPLEMENTED_NOT_HOST_VERIFIED`). Roteiro
  mínimo pendente: sem composição; camada bloqueada em cada um dos 10 comandos
  (nada muda, mensagem específica); preset de texto com sólido selecionado; lote
  de 10 camadas com stagger e uma bloqueada no meio; Undo em um passo; Fast Edit
  com camada bloqueada; reabrir painel e AE conferindo aba, galeria, rascunhos,
  variações e gradientes; preferências corrompidas de propósito; pedido grande
  com falha de leitura. AE 25.x e Windows também `NOT RUN`.

## Observação
Outra sessão ("Otimizar espaços Moti.on") alterou `theme.css`,
`design-system.css`, `CHANGELOG.md` e documentos na mesma pasta durante este
trabalho; estava parada ao final, e a verificação acima já roda sobre essas
alterações.
