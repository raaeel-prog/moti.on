# Limitações verificadas e o que ainda não foi executado em host real

> Entregável 10 da §39 do master spec: *"lista objetiva de limitações verificadas"*.
>
> **Nada nesta página pode ser descrito como funcionando até ter sido executado dentro do After Effects ou do Premiere Pro reais.** `npm run check` verde significa que a lógica pura está correta e que os contratos batem entre si. Não significa que o painel carrega, que o Undo agrupa, nem que os bytes atravessam o `evalScript` intactos.

O vocabulário de status é o de `docs/AGENT_SKILLS_GUIDE.md`: `IMPLEMENTED_AND_VERIFIED`, `IMPLEMENTED_NOT_HOST_VERIFIED`, `PARTIAL`, `BLOCKED_BY_CAPABILITY`, `BLOCKED_BY_PRODUCT_DECISION`, `NOT_IMPLEMENTED`.

---

## O que está `IMPLEMENTED_NOT_HOST_VERIFIED`

### 1. Carregamento do painel no After Effects

O manifest CSXS declara CEP 12 e AE 25.0+, e o build produz a árvore que `docs/INSTALLATION.md` manda instalar. **Ninguém abriu o After Effects.** Não está verificado que o painel aparece no menu de extensões, que o `index.html` renderiza, nem que `MotionAE.dispatch` fica alcançável por `evalScript`.

### 2. Round-trip não-ASCII pelo canal `evalScript` real

`encodeForEvalScript` e `MotionJson.stringify` produzem saída ASCII imprimível, e há 13 testes de escape mais um fuzz semeado de 500 strings cobrindo controles, U+2028/2029, acentos, CJK, emoji e substituto solitário. **O transporte não foi testado.** A hipótese que motivou o desenho — de que o canal do `evalScript` decodifica pela codepage do sistema no Windows e corromperia `"Composição"` — é razoável e não foi confirmada nem refutada num host real.

O comando `ae.diagnostics.echo` existe justamente para isso: é o botão **Verificar ponte com o host**, e mandar um valor com acento, CJK e emoji e conferir a volta é o teste que fecha este item.

### 3. Alvo do Chromium do CEP 12

`scripts/build-client.mjs` compila o bundle do painel para `chrome88`. **Esse número não foi verificado contra documentação da Adobe.** É um limite conservador escolhido por segurança. Se o CEP 12 embutir um Chromium mais novo, está se perdendo recurso à toa; se embutir um mais velho, o painel abre em branco dentro do After Effects sem nenhuma mensagem útil.

### 4. Agrupamento de Undo

Está provado por teste que `beginUndoGroup` e `endUndoGroup` são chamados exatamente uma vez cada, na ordem certa, inclusive quando o comando lança. **Não está provado que o After Effects de fato agrupa a operação numa única entrada do histórico** — só o host real responde isso. O teste manual está em `docs/INSTALLATION.md`: criar a composição de teste e conferir que um único Ctrl+Z a desfaz por completo.

### 5. Preservação de seleção e do tempo corrente

`captureState`/`restoreState` **não existem ainda**. Nenhum comando do P0 muda seleção ou CTI, então não há o que preservar. Status: `NOT_IMPLEMENTED`, e chega junto com o primeiro comando que mexe em seleção.

### 6. Valores reais de `expressionEngine`

O tipo `HostCapabilities.expressionEngine` prevê `"javascript" | "legacy" | "unknown"`. A sonda que leria `app.project.expressionEngine` chega no CHMS-006, e **as strings que o After Effects realmente devolve não foram conferidas** num projeto de verdade.

### 7. Premiere Pro

O adapter do Premiere continua sendo o do starter: lê projeto e sequência, faz autoteste, e ainda usa o envelope legado. O command bus com `lockedAccess`/`executeTransaction` é CHMS-005 e **não foi escrito**. As assinaturas exatas dessas APIs serão verificadas contra a referência oficial da Adobe antes de qualquer código — não de memória.

### 8. Permissões UXP e CSP

`apps/premiere-uxp/manifest.json` **ainda não declara `requiredPermissions`**, e nenhum dos dois `index.html` tem meta `Content-Security-Policy`. Ambos entram no CHMS-005. Também não está verificado se o UXP honra CSP declarada por meta tag.

### 9. Locale da interface

O adapter lê `csInterface.getHostEnvironment().appUILocale` para preencher `context.locale`, que é o que faz o rótulo de Undo sair no idioma do usuário. **Não foi verificado** que esse campo existe e no formato esperado (`pt-BR` vs `pt_BR` vs `ptBR`). Se vier em formato diferente, o rótulo cai no inglês — degradação visível e honesta, não silenciosa, mas ainda assim errada.

### 10. Transporte de payload grande por arquivo temporário

`needsTempFileTransport` decide corretamente quando um payload passa do limite, e isso é testado. **O caminho alternativo em si não foi implementado**: nenhum comando do P0 chega perto de 60.000 caracteres. Status: `PARTIAL` — a decisão existe e é testada, a execução chega quando houver um comando que precise dela.

### 11. QA visual

Nada foi visto renderizado. Os requisitos de 280/360/480/720 px e de escala de 100/125/150/200% de DPI da §22.3 **não foram exercitados**. O painel atual ainda é o layout do starter; o shell responsivo com os tokens `#1D1D1D` é CHMS-008.

### 12. Acessibilidade

Ordem de foco por teclado, contraste do anel de foco e comportamento de leitor de tela **não foram verificados** em nenhum dos dois runtimes. A §22.4 exige, e nenhum teste automatizado neste repositório mede isso.

---

## O que está verificado, e por qual mecanismo

Isto **não** depende de host real, e está coberto por teste automatizado:

| Item | Onde |
|---|---|
| Escape para `evalScript` produz ASCII imprimível para qualquer entrada | `packages/contracts/tests/evalscript.test.mjs` (13 testes, fuzz semeado de 500 strings) |
| Carga de injeção não fecha o literal de string | idem, teste que localiza onde o literal termina |
| As tabelas de escape do painel e do host são idênticas | `apps/after-effects-cep/tests/host-json.test.mjs` |
| Parser JSON do host recusa `__proto__`, profundidade > 64 e entrada > 4 MB | idem |
| `preflight` que falha nunca abre grupo de Undo | `apps/after-effects-cep/tests/host-dispatch.test.mjs` |
| `beginUndoGroup`/`endUndoGroup` balanceiam mesmo com exceção | idem |
| Comando que muta e reporta `changed: false` responde `ok: false` | idem |
| Versão de protocolo diferente é recusada sem invocar o handler | idem |
| Resposta com `requestId` desconhecido é descartada | `packages/command-registry/tests/command-client.test.mjs` |
| Timeout avisa que a operação pode ter sido aplicada | idem |
| Callback atrasado não resolve promessa já entregue | idem |
| Um único `evalScript` no bundle e um único global público no host | `scripts/validate.mjs`, sobre o build |
| Nenhum `eval`, `new Function`, `console` ou URL literal no build | idem |
| Descriptors e registro do host são o mesmo conjunto | `tests/build-parity.test.mjs` |
| Código gerado não sai de sincronia com o TypeScript | testes de drift nos dois packages |
| Sintaxe fora do subconjunto ExtendScript | `scripts/check-extendscript.mjs` + `tests/extendscript-subset.test.mjs` |

---

## Como fechar os itens abertos

Os itens 1, 2 e 4 fecham numa única sessão dentro do After Effects, seguindo `docs/INSTALLATION.md`:

1. `npm run build`, depois `.\scripts\install-ae-dev.ps1 -EnableDebugMode` no Windows ou `./scripts/install-ae-dev.sh --enable-debug` no macOS.
2. Abrir o painel Moti.on no menu de extensões. **Item 1 fecha aqui**, ou revela um problema de carregamento.
3. Clicar em **Verificar ponte com o host**. O payload de prova contém acento, CJK, emoji, aspas e barras invertidas. **Item 2 fecha aqui**: se voltar idêntico, o transporte preserva os bytes; se voltar diferente, existe corrupção real e o painel diz isso em vez de fingir sucesso.
4. Clicar em **Criar composição de teste**, conferir a composição 1920×1080 / 5 s / 30 fps, e apertar Ctrl+Z uma vez. **Item 4 fecha se um único Ctrl+Z desfizer tudo.**
5. Anotar o valor de `appUILocale` observado, o que fecha o item 9.

O item 3 fecha consultando a documentação oficial do CEP sobre a versão embutida do Chromium, via `/researching-adobe-capabilities`, e não por tentativa e erro.

Os itens 5, 6, 7, 8, 10, 11 e 12 dependem de código que ainda não foi escrito, e estão amarrados às issues CHMS correspondentes.
