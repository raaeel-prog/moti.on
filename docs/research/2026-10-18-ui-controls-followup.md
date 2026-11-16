# Aprofundamento de controles — Animation Composer e BadFX

Data: 18/10/2026, America/Bahia. Continuação do [estudo de 15/10](2026-10-15-ui-controls-ac-badfx.md), limitada a checkbox, sliders, configurações, seleção, feedback e densidade tipográfica.

**Estado: PARTIAL.** Oito achados têm evidência estática focal e implicações de design. Nenhum plugin, projeto ou controle do usuário foi executado/alterado nesta rodada. Comportamento real no CEP, acessibilidade e Undo dos fornecedores continuam **NOT RUN**. A aparência das imagens enviadas anteriormente é observação de recortes fornecidos, não teste de interação atual.

## Identidade e método

Skill REA local relida: `C:/Users/raaee/.agents/skills/reverse-engineer-anything/SKILL.md`, versão 37. Leitura dos recursos instalados e `sourcesContent` fornecido pelo próprio source map; nenhuma descriptografia, cópia de assets ou incorporação de código proprietário.

Hashes SHA-256 revalidados em 18/10:

| Alias | Arquivo relativo | SHA-256 |
|---|---|---|
| AC-JS | Composer `client/dist/browser.bundle.js` | `bbfbaa93609efedaa0a6af1377a366c96bc5e214df1c3690012c3e799a3802d1` |
| AC-CSS | Composer `client/dist/browser.css` | `c011ec98376ecc63b7e9ca7cd76029478b3177c43f96cfa3893f300e207703a1` |
| BF-JS | BadFX `assets/main-3cbd389a.js` | `904cd8771cd29e543e37ba4bec4e0531567a0f26560a532230c4acb1ad67eebb` |
| BF-MAP | BadFX `assets/main-3cbd389a.js.map` | `b56b6dca91605cd3935b007030705363fcb6712cf6425ab03bace50ee7edc591` |
| BF-CSS | BadFX `assets/index-55c79864.css` | `55c79864f8ce5dff5a0910a9992f1b6507b6968ab22f8d6fc1ac5d16b2606711` |
| BF-CSS-2 | BadFX `assets/index-91509079.css` | `915090799293c50ae2b1df7f94677545bb40fc861eb2bc57775980a8b8957877` |

Composer está em `C:/Program Files/Common Files/Adobe/CEP/extensions/com.misterhorse.AnimationComposer`; BadFX, em `C:/Program Files (x86)/Common Files/Adobe/CEP/extensions/com.badedits.cep`. Os primeiros quatro hashes coincidem com os registrados em 15/10. Isso confirma identidade desses arquivos, não toda a instalação.

REA `inspect-evidence-bundle`, com `detail: summary` e filtro de operação `analyze_javascript_application`, releu os dois bundles exportados em `C:/dev/preset-study`. A chamada usou o entrypoint Node da CLI instalada para preservar o JSON no Windows. Não foi repetida análise integral:

- **AC-REA:** `ev_e8e2201c2ed1cdd8f12993c02a23dbc22fdcf46c877b6098819c2fb9a5d79b38`, `animation-composer/rea-evidence-bundle.json`, registro completo retido, autoridade `shipped-artifact`, confiança `derived`, 14 limitações.
- **BF-REA:** `ev_147efe4e07d7e298cd6b60969c4bb2fe013b4e86a5501aaf233c87d411687cc1`, `badfx/rea-evidence-bundle.json`, registro completo retido, autoridade `shipped-artifact`, confiança `derived`, 19 limitações.

Esses IDs identificam análises anteriores e não novas observações de execução. As limitações de cobertura semântica/heap descritas no estudo anterior permanecem. As localizações abaixo são trechos lidos diretamente nesta rodada, ligados aos hashes acima. Offsets AC são índices UTF-16 no texto decodificado, base zero; linhas BadFX são linhas do fonte contido no source map, base um. Não se alegam novos IDs REA para esses recortes.

## Oito achados concretos

### 1. Checkbox pequeno pode ter alvo amplo e semântica nativa

**Estático:** AC-JS, próximo do offset 1547288, constrói `label` contendo `input type=checkbox`, estado checked/disabled e callbacks de mudança/foco. AC-CSS, seletores `.checkbox-field__input` e `.checkbox-field__control`, posiciona o input sobre toda a área do label; o desenho visual fica separado e não recebe pointer events. Estados hover, disabled, checked e focus-visible têm regras próprias; o anel de foco tem largura 2 px e offset 6 px.

**Decisão sugerida:** checkbox compacto com texto clicável, área interativa maior que o quadrado e marca visível. Usar controle nativo e desenhos próprios; preservar um único callback de alteração. **Desconhecido:** tamanho efetivo da área em cada tela, suporte de foco no CEP e ordem de Tab não foram exercitados.

### 2. A aparência do checkbox não garante ativação ou acessibilidade corretas

**Estático:** BF-MAP, `src/js/main/components/ui/CustomCheckbox.tsx`, linhas 19–32, combina wrapper com onClick, input com onChange e ícone condicionado a checked. `HoverSettings.tsx`, linhas 32–37, acrescenta um ancestor com onClick para o mesmo toggle. BF-CSS, `.customCheckbox_12vax_15`, usa 12×12 px, borda 1 px, hover de superfície e `outline:none`.

**Inferência delimitada:** o encadeamento contém vários caminhos potenciais para uma mesma intenção; só um teste de eventos confirma quantas alternâncias ocorrem. Não foi classificado como defeito runtime do fornecedor.

**Decisão sugerida:** adotar a clareza visual, não reproduzir o encadeamento. Testar clique no quadrado, texto e Espaço como uma única mudança; não remover foco sem indicador equivalente. **Desconhecido:** ativação duplicada e leitura por tecnologia assistiva no BadFX.

### 3. Slider e número representam o mesmo parâmetro, com início e fim de edição

**Estático:** AC-JS, próximo do offset 1670138, recebe `startEditing` e `stopEditing` do controlador do parâmetro. A mudança de slider inicia edição, atualiza o valor absoluto e a apresentação; `onChangeEnd` encerra a edição. A mesma propriedade tem um número compacto que usa o controlador de edição. O container da propriedade é expansível. AC-CSS oferece trilho de largura disponível e extremos separados.

**Observado anteriormente:** imagem 10 mostra Amount X, valor, Reset e extremos 0–1000 após disclosure.

**Decisão sugerida:** slider e número sincronizados, com o lifecycle próprio do Moti.on. O fim do gesto deve confirmar o ajuste; cancelamento restaura o início segundo o contrato existente. **Desconhecido:** frequência de transporte, debounce e atomicidade de Undo do Composer. A presença de start/stop não prova um Undo único.

### 4. Faixa do slider, faixa válida e valores mistos são conceitos diferentes

**Estático:** no mesmo trecho AC-JS, slider usa `sliderMin/sliderMax`; o input numérico usa `validMin/validMax`. O slider é desabilitado quando o valor é null. Nesse estado o controle numérico usa um caminho que aceita alteração relativa ou absoluta, limitado por validMin/validMax. A formatação considera precisão da definição.

**Decisão sugerida:** não inferir que qualquer número com limite pode virar slider nem que faixa visual precisa substituir o contrato de validação. Em valores mistos, impedir uma posição fictícia do thumb; conservar o mecanismo próprio para alterar somente o parâmetro escolhido. **Desconhecido:** quais propriedades instaladas têm faixas diferentes e como cada uma materializa null no host. Não alterar schema do Moti.on apenas para imitar esse detalhe.

### 5. Configurações rápidas agrupam preferências simples, sem inspector permanente

**Estático:** BF-MAP, `navigation/toolbar/hoverContent/HoverSettings/HoverSettings.tsx`, linhas 28–54, organiza três linhas: habilitar tooltips, volume e tamanho da grade. `ui/CustomRange.tsx` usa input range e limites específicos para volume/grade. `redux/slices/tooltipSlice.ts`, linhas 8 e 15–19, inicia habilitado e oferece set/toggle. Esses trechos não comprovam persistência entre sessões.

**Decisão sugerida:** configurações de interface em linhas curtas e localizadas, separando preferências locais das mutações no projeto. Mostrar valor quando precisão importa; não converter toda configuração em modal ou seção sempre aberta. Não importar telemetria ou preferências do fornecedor. **Desconhecido:** persistência, restauração e consistência entre janelas do BadFX.

### 6. Seleção tem identidade própria; hover e expansão não a substituem

**Estático:** BF-MAP, `mainContent/navigationPanel/Category.tsx`, linhas 34–55, distingue expandedPaths, activePath e clickedPath. BF-CSS, seletores `.category_gnos7_33`, `.active_gnos7_105` e `.dimmed_gnos7_115`, usa cor azul tanto em hover quanto no ativo, com redução de opacidade de categorias externas. Texto tem ellipsis; o espaço do ícone permanece nos nós sem filhos.

**Observado anteriormente:** imagens 6/9 mostram Words em azul e Text expandido.

**Decisão sugerida:** preservar seleção, expansão e foco como estados independentes. Usar também marca/semântica de selecionado, pois a mesma cor em hover e ativo pode ser ambígua. Reservar a coluna do disclosure evita saltos horizontais. **Desconhecido:** comportamento de teclado, profundidade máxima e contraste efetivo dos itens diminuídos.

### 7. Feedback precisa indicar a tarefa e distinguir espera, progresso e resultado

**Estático:** BF-MAP, `ui/GlobalLoading.tsx`, linhas 8–18, combina estado de loading e consultas pendentes, excluindo um grupo de consultas de sessão; `SpinnerOverlay.tsx`, linhas 8–14, só monta o spinner em loading. `footer/NotificationHover.tsx`, linhas 34–36, distingue updating/success/error; linhas 120–129 evitam retrocesso percentual, e 176–194 mostram texto de checagem ou versão disponível. AC-CSS `.thumbnail-progress-panel` usa título e progresso em linha; `.toast_warning` possui semântica visual própria.

**Decisão sugerida:** no Moti.on, ligar o feedback à operação dona do estado; texto e ícone acompanham cor. Preferir estado junto à ação para ajustes curtos, preservando avisos recuperáveis existentes. Uma consulta incidental não deve bloquear todo o painel. **Desconhecido:** latência, anúncios acessíveis e percepção de conclusão no runtime dos fornecedores. Não executar instalação/atualização para verificar esse padrão.

### 8. A densidade profissional vem de alinhamento e hierarquia, não apenas fonte pequena

**Estático:** AC-CSS `.property-node__header` tem 31 px de altura, label com largura de 35%, ações alinhadas no final e nome truncado; o header de preset tem 24 px. `.layout-settings__property` tem 28 px. Grupos usam peso 700 e hover muito discreto. BF-CSS categorias têm 11 px/peso 700; `.presetName_w6kuu_207` tem 10 px/peso 700; settings têm rótulo de 11 px. São regras de fonte, não medições de fonte renderizada ou escala do host.

**Decisão sugerida:** alinhar nome, valor e ação em colunas estáveis; reduzir caixas e separadores repetidos; reservar negrito para hierarquia. Manter tamanhos legíveis da fundação Moti.on, em vez de reproduzir 10 px ou alto peso em todos os rótulos. Avaliar em 280/360/480/720 px e escala real. **Desconhecido:** DPI, fonte resolvida, clipping e legibilidade real dos fornecedores nesta máquina.

## Resultado e limites

- **PASS:** hashes revalidados; registros REA exportados consultados; oito perguntas aprofundadas com fontes focais, inferências e lacunas explícitas.
- **NOT RUN:** cliques, hover, teclado, screen reader, captura atual do runtime, contraste renderizado, Undo e qualquer alteração no host.
- **Não alterado:** código do produto, fornecedor, licença, conta, presets ou projeto do usuário. O único artefato desta subtarefa é este documento.

Este estudo informa implementações próprias. Não recomenda copiar SVGs, CSS, layouts exatos, fontes distribuídas ou lógica proprietária. Os tiles de Ferramentas e a continuidade card–popover protegidos pelo usuário não precisam mudar para incorporar esses princípios.
