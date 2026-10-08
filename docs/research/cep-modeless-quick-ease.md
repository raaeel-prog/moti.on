# Pesquisa: janela flutuante "Suavização rápida" (extensão CEP Modeless)

- **Pergunta:** o Moti.on pode abrir, a partir do painel dockado, uma segunda janela CEP com a curva de suavização, sincronizar o rascunho entre as duas superfícies e abrir essa janela automaticamente quando keyframes são selecionados — sem interromper a seleção na timeline?
- **Data da decisão:** 2026-10-08
- **Host/versão alvo:** After Effects 25.0+ (manifesto `[25.0,99.9]`), CEP 12 (`RequiredRuntime CSXS 12.0`).
- **Status:** `PARTIAL` — documentado e implementado; execução em host real `NOT RUN`. Abertura automática entregue **desligada por capability** (`QUICK_EASE_AUTO_OPEN_PROVEN = false` em `apps/after-effects-cep/client/src/capabilities.ts`).

## Evidências

| Afirmação | Símbolo | Versão mínima | Fonte primária | Observação |
|---|---|---|---|---|
| Um bundle pode conter várias extensões | `<ExtensionList>` + `<DispatchInfoList>` com vários `<Extension Id>` | CEP 5 | CEP 12 HTML Extension Cookbook, "Extension Manifest" ("One extension bundle may have multiple extensions") | O exemplo de remote debugging declara Panel, ModalDialog e Modeless no mesmo bundle |
| Tipo de janela flutuante não bloqueante | `<UI><Type>Modeless</Type>` | CEP 4 | Cookbook, "UI Types": "Opens a new window without forcing the user to interact with it first" | `<Size>` obrigatório; redimensionável quando Min ≠ Max |
| Não abrir sozinha na inicialização | `<Lifecycle><AutoVisible>false</AutoVisible>` | CEP 5 | Cookbook, "Lifecycle" | A janela abre pelo painel ou pelo menu de extensões |
| Abrir outra extensão do mesmo bundle | `CSInterface.prototype.requestOpenExtension(extensionId, params)` | CEP 4 | `CSInterface.js` (CEP_12.x): "Loads and launches another extension, or activates the extension if it is already loaded"; `params` "Not currently used, pass ''" | — |
| Fechar a própria janela | `CSInterface.prototype.closeExtension()` | CEP 4 | `CSInterface.js` | Só para janelas (modal/modeless) |
| Eventos entre extensões | `CSEvent(type, "APPLICATION", appId, extensionId)`, `dispatchEvent`, `addEventListener`, `removeEventListener` | CEP 4 (GLOBAL removido no CEP 5) | Cookbook, "CEP events"; `CSInterface.js` | `extensionId` no evento permite ignorar os próprios eventos |
| Título da janela | `setWindowTitle(title)` | CEP 6.1 | `CSInterface.js` | Suportado para modal/modeless em todos os hosts; para painéis o AE não está na lista |
| Redimensionar conteúdo | `resizeContent(w, h)` | CEP 4 | Cookbook | "changing panel HTML extension size is not supported in … After Effects"; não usado |
| `evalScript` roda na thread principal do host | — | — | Cookbook, "evalScript" | Leituras pequenas e serializadas (`visiblePoll`, 500 ms, uma de cada vez) |
| `localStorage` compartilhado entre extensões do mesmo bundle | — | — | **Não documentado** | Incerteza aberta; o protocolo de sincronização carrega o payload no `CSEvent.data` como alternativa |

## Decisão de implementação

- Segunda extensão `com.motion.plugin.ae.quick-ease` (`Modeless`, 300×360, mín. 280×320, `AutoVisible=false`, `MainPath ./client/quick-ease.html`), bundle próprio `client/quick-ease.js` gerado pelo mesmo `buildAeClient`.
- Abertura manual: botão "Suavização rápida" na view de Suavização (`requestOpenExtension`) e entrada no menu de extensões (`<Menu>`).
- Reuso: `createEaseEditor({ compact: true })`, `createEaseController` (mesmo `ae.keys.ease.apply`, mesmo guarda de seleção e sessão), `createEaseSync` (rascunho + sessão em `motion.ease.draft.v1`, evento `com.motion.plugin.ease.sync` com o payload), lease `motion.ease.lock.v1` para um único escritor no host.
- Abertura automática: `createEaseAutoOpen` (leitura serializada a cada 500 ms enquanto visível, abre só quando a identidade da seleção muda para uma com keyframes, não reabre a mesma seleção depois de fechada — evento `com.motion.plugin.ease.quick-closed`). Só é iniciada quando `QUICK_EASE_AUTO_OPEN_PROVEN` e a preferência `motion.ease.autoOpen.v1` estão ligadas.

## Fallback

- Sem CEP (preview no navegador, testes): todos os métodos do wrapper `cep-events.ts` são no-ops; a janela mostra "Abra esta janela dentro do After Effects".
- Se `localStorage` não for compartilhado: o payload do rascunho viaja no próprio evento (até 60 kB); o lease de escrita deixa de impedir aplicações simultâneas, mas o host continua recusando seleção obsoleta (`STALE_SELECTION`) e a sessão inválida.
- Se a abertura automática interromper a seleção na prova: a capability fica `false` e só a abertura manual é oferecida.

## Capability flag

`QUICK_EASE_AUTO_OPEN_PROVEN` (`apps/after-effects-cep/client/src/capabilities.ts`). Virar `true` exige preencher a lista de prova abaixo com resultados `PASS`.

## Testes necessários (automatizados: PASS; host real: NOT RUN)

- `tests/manifests.test.mjs`, `tests/build-output.test.mjs`, `scripts/validate.mjs`: manifesto, dois bundles, CSP.
- `apps/after-effects-cep/tests/ease-sync.test.mjs`, `ease-controller.test.mjs`, `visible-poll.test.mjs`, `ease-auto-open.test.mjs`, `quick-ease-ui.test.mjs`.

## Lista de prova no After Effects real (todos `NOT RUN` em 2026-10-08)

| # | Prova | Resultado |
|---|---|---|
| 1 | Menu de extensões mostra "Moti.on - Suavizacao rapida"; abre e fecha sem erro | NOT RUN |
| 2 | Botão "Suavização rápida" do painel abre a janela (`requestOpenExtension`) e a reativa se já aberta | NOT RUN |
| 3 | Abrir a janela não altera a seleção de keyframes nem o CTI | NOT RUN |
| 4 | Com foco na timeline a janela segue a seleção (leitura a cada 500 ms); custo de `ae.context.read` com 60 camadas selecionadas < 30 ms | NOT RUN |
| 5 | Editar numa superfície atualiza a outra (evento `ease.sync`); `localStorage` compartilhado sim/não | NOT RUN |
| 6 | Aplicar na janela gera um único Desfazer; reaplicar com pontos/Elastic substitui as keys geradas | NOT RUN |
| 7 | Trocar a seleção com Live ligado durante o debounce não escreve nos novos keyframes (`STALE_SELECTION`) | NOT RUN |
| 8 | `unload` da janela dispara `ease.quick-closed`; com abertura automática ligada, a mesma seleção não reabre | NOT RUN |
| 9 | Abertura automática não rouba foco da timeline nem interrompe arrasto de keyframes | NOT RUN |
| 10 | Janela utilizável em 300×360 e 280×320 (mínimo) | NOT RUN (preview no navegador: PASS) |

## Incerteza aberta

- `localStorage` entre extensões do mesmo bundle; comportamento de foco de uma janela Modeless durante gestos na timeline; se `requestOpenExtension` numa janela já aberta a traz à frente no AE.
