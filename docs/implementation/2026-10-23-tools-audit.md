# Auditoria das ferramentas — 23/10/2026

Snapshot: `C:\dev\Moti.on-tools-audit-20261023`. Inventário gerado em 2026-10-24T22:47:29.148Z.

**52 ferramentas; 44 visíveis na biblioteca; 18 ações rápidas; 102 comandos AE.**

Baseline anterior às alterações: **PASS**, 2693 testes PASS no check completo. Não valida mudanças posteriores.

Automação direcionada: **920/920 PASS, 0 FAIL**, em 57 suítes. Isso é execução Node/fixtures, sem prova de render ou Undo no Adobe.

Estado profissional: **NOT READY**. AE real: **NOT RUN para cada ferramenta e ação rápida** até existir recibo específico de versão/build/fixture/seleção/resultado/Undo/reaplicação. O check completo deve ser registrado pelo integrador; este relatório não converte check em host proof.

Fontes verificáveis: [ledger JSON](../../artifacts/tools-audit/audit-ledger.json), [suítes/logs](../../artifacts/tools-audit/focused-tests.json), [estudo REA](../research/2026-10-23-brazu-composer-tools-rea.md).

## Matriz por ferramenta

Cada linha identifica entrada e resultado esperado, testes realmente executados e limite da evidência. As políticas de reaplicação abaixo são critérios de aceitação; não representam observação no host.

| Ferramenta / comando | Entrada e resultado esperado | Preflight / Undo | AUTO / HOST | Suítes |
|---|---|---|---|---|
| Revelação de palavras (wordReveal)<br>`ae.text.word-reveal` | Texto editável selecionado; duração e stagger por frames<br>→ Revelação por palavras com controles gerenciados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | text-word-reveal, text-word-morph |
| Morph variável (variableMorph)<br>`ae.text.variable-morph` | Texto/fonte compatível ou outlines, seleção e raio do controlador<br>→ Peso/forma responde ao controlador mantendo texto e metadados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | text-variable-morph, text-variable-morph-v2, text-pulse-morph-lifecycle |
| Troca de estilo (styleSwap)<br>`ae.text.style-swap` | Camadas de texto e estilos/fonte válidos<br>→ Troca animada de estilos com texto preservado | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | text-style-swap |
| Pulso vertical (verticalPulse)<br>`ae.text.vertical-pulse` | Texto selecionado, preset/duração compatíveis com FPS<br>→ Pulso/distorção editável sem expressão com erro | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | text-vertical-pulse, text-pulse-morph-lifecycle |
| Loop Out (loopOut)<br>`ae.expression.loopout` | Propriedades animáveis com keys compatíveis e modo de loop<br>→ Repetição após as keys com controle editável | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | expression-loopout |
| Smooth de expressão (smooth)<br>`ae.expression.smooth` | Propriedade compatível; largura/amostras e limite de tempo<br>→ Suavização por amostragem, separada de easing de keyframes | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | expression-smooth |
| Wiggle (wiggle)<br>`ae.expression.wiggle` | Propriedades expressíveis; frequência/amplitude por dimensão<br>→ Oscilação configurável com controles animáveis | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | expression-wiggle |
| Flicker (flicker)<br>`ae.expression.flicker` | Opacidade/propriedade compatível e preset<br>→ Variação de intensidade controlada e reproduzível | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | expression-flicker |
| Renomear (rename)<br>`ae.layer.rename` | Camadas do escopo e regra confirmada na prévia<br>→ Nomes resultantes correspondem à prévia | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | layer-rename-reverse |
| Inverter camadas (reverseOrder)<br>`ae.layer.reverse-order` | Duas ou mais camadas; políticas de matte e parent<br>→ Ordem invertida preservando relações permitidas | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | layer-rename-reverse |
| Âncora (anchor)<br>`ae.anchor.align` | Camadas compatíveis; ponto da grade e compensação visual<br>→ Âncora muda sem salto visual, inclusive animação suportada | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | anchor-align |
| Recortar por keys (cutKeys)<br>`ae.keys.cut` | Keys/intervalo válido, prévia e consentimento destrutivo<br>→ Limites das camadas coincidem com o intervalo aprovado | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keys-chms016 |
| Delay (delay)<br>`ae.keys.delay` | Keys/camadas selecionadas, ordem e atraso em frames<br>→ Stagger na ordem e janela solicitadas | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keys-chms016 |
| Espelhar camada (flip)<br>`ae.layer.flip` | Camadas com escala editável e eixo<br>→ Espelhamento preserva os canais/keys restantes | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | layer-flip |
| Criar nulo (createNull)<br>`ae.layer.create-null` | Comp ativa; seleção opcional e dimensão<br>→ Nulo/controlador com parent e posição esperados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | layer-create-null |
| Parentesco (parent)<br>`ae.layer.parent` | Camadas filhas/pai válidos, sem ciclo<br>→ Hierarquia solicitada mantendo resultado visual permitido | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | layer-parent |
| Caixa de texto (textBox)<br>`ae.text.box` | Texto selecionado, padding/estilo e tempo válidos<br>→ Caixa editável acompanha limites do texto | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | text-box |
| Suavização de keys (ease)<br>`ae.keys.ease.apply` | Keys temporais/espaciais compatíveis, curva/modo e sessão atuais<br>→ Curva aplicada nas keys/segmentos selecionados sem perder estado | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | ease-safe-apply, ease-editor-ui, ease-session, ease-points-bake, ease-actions, keys-ease-tipos |
| Illustrator para vetor (aiToVector)<br>`ae.vector.ai-to-vector` | Camada Illustrator compatível e comando de menu disponível<br>→ Shape vetorial criada e original preservada conforme opção | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | vector-clean-particles-safety |
| Texto para vetor (textToVector)<br>`ae.vector.text-to-vector` | Texto selecionado e capacidade nativa de conversão<br>→ Outlines editáveis com original preservada conforme opção | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | vector-clean-particles-safety |
| Partículas (particles)<br>`ae.effect.particles` | Comp ativa; emissor/seleção e engine nativa disponível<br>→ Partículas visíveis com controles próprios e modos suportados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | particles, vector-clean-particles-safety |
| Textura (texture)<br>`ae.asset.texture` | Arquivo/asset local válido e camada alvo<br>→ Textura importada/aplicada com composição e licença preservadas | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | texture-local |
| Limpar projeto (clean)<br>`ae.project.clean` | Scan atual, achados explícitos e consentimento de remoção<br>→ Somente itens aprovados e não usados são removidos | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | vector-clean-particles-safety |
| Inverter tempo (reverseKeys)<br>`ae.keys.reverse` | Duas ou mais keys e intervalo sem colisões<br>→ Tempos invertidos, easing/tangentes transformados corretamente | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keyframe-professional |
| Inverter valores (reverseValues)<br>`ae.keys.reverse-values` | Keys selecionadas compatíveis<br>→ Valores invertidos mantendo tempos conforme contrato | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keys-reverse-values |
| Enviar keys ao limite (sendToEdge)<br>`ae.keys.send-to-edge` | Keys e referência de início/fim/área de trabalho<br>→ Grupo de keys alinha ao limite preservando espaçamento | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keys-send-to-edge |
| Neon (neon)<br>`ae.style.neon` | Camada compatível; cor/intensidade e efeitos nativos disponíveis<br>→ Brilho/neon editável sem expressão com erro | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | style-neon |
| Beat (beat)<br>`ae.audio.beat` | Áudio/amplitude disponível e propriedades expressíveis<br>→ Movimento responde ao áudio com controles editáveis | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | audio-beat |
| Clonar keys (cloneKeys)<br>`ae.keys.clone` | Keys, modo repeat/mirror e destino sem colisão<br>→ Cópias no destino correto com easing e metadados preservados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keyframe-professional, p1-inertial-jump-copy |
| Controlador de tempo (timeController)<br>`ae.time.controller` | Camada com remapeamento compatível e intervalo válido<br>→ Controle editável de reprodução/tempo | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | time-chms020 |
| Kinetic (animateKinetic)<br>`ae.animate.kinetic` | Propriedade/fonte de velocidade compatível e seleção válida<br>→ Valor reage à velocidade pelo rig configurado | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | keys-chms018-019, time-chms020 |
| Inércia (inertial)<br>`ae.animate.inertial` | Keys/expressão compatíveis, amplitude/frequência/decaimento<br>→ Overshoot pós-key preserva animação base | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p1-inertial-jump-copy |
| Jump (jump)<br>`ae.animate.jump` | Camadas/propriedades compatíveis e janela em frames<br>→ Salto/bounce editável conforme modo | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p1-inertial-jump-copy |
| Copiar keys (copyKeys)<br>`ae.keys.copy` | Keys selecionadas compatíveis<br>→ Clipboard contém dados completos sem mutar o projeto | PASS registro; read-only command; no project Undo required | PASS / NOT RUN | p1-inertial-jump-copy |
| Colar keys (pasteKeys)<br>`ae.keys.paste` | Clipboard válido, propriedades destino e CTI<br>→ Keys coladas com tempo/valor/easing e política de conflito | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p1-inertial-jump-copy |
| Look At (lookAt)<br>`ae.3d.look-at` | Camadas 3D/alvo válidos, eixos e constraints<br>→ Orientação aponta ao alvo no espaço correto | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p2-3d-echo-fastedit |
| Órbita (orbit)<br>`ae.3d.orbit` | Camadas 3D/centro, plano, raio e tempo válidos<br>→ Órbita editável e controles animáveis | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | orbit-live-controls |
| Separar shapes (breakShape)<br>`ae.shape.break` | Shape com grupos válidos e política do original<br>→ Grupos tornam-se camadas editáveis sem deslocamento | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | shape-break |
| Effector (effector)<br>`ae.rig.effector` | Camadas alvo e raio/influência compatíveis<br>→ Proximidade altera transform com controlador próprio | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | rig-effector |
| Transição de câmera (cameraTransition)<br>`ae.camera.transition` | Comp/câmera ou precomp selecionada e duração válida<br>→ Movimento de transição e marcador de corte esperados | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | camera-transition, camera-precomp-transition |
| Cilindro (cylinder)<br>`ae.3d.cylinder` | Seleção/faces/texto e parâmetros 3D válidos<br>→ Cilindro editável com disposição correta | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | chms026-cylinder-cube |
| Cubo (cube)<br>`ae.3d.cube` | Faces/comp e parâmetros válidos<br>→ Seis faces editáveis e controlador coerente | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | chms026-cylinder-cube |
| Gradientes (gradient)<br>`ae.effect.gradient` | Comp/camada, stops/paleta e modo suportado<br>→ Gradiente editável e preview consistente com modo animado | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | gradient, gradient-editor |
| Ondas (wave)<br>`ae.effect.wave` | Camada compatível, amplitude/período e efeito nativo<br>→ Ondulação editável conforme preset | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | chms027-wave-tile-glitch |
| Tile (tile)<br>`ae.effect.tile` | Fonte/parâmetros e consentimento quando destrutivo<br>→ Repetição/fundo editável com limites corretos | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | chms027-wave-tile-glitch |
| Glitch (glitch)<br>`ae.effect.glitch` | Camadas/parâmetros válidos e efeitos necessários<br>→ Glitch e mapa próprios com intensidade controlada | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | chms027-wave-tile-glitch |
| Echo (echo)<br>`ae.effect.echo` | Camada e controles temporais/efeito disponíveis<br>→ Ecos editáveis com duração/intensidade esperadas | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p2-3d-echo-fastedit |
| Parallax (parallax)<br>`ae.animate.parallax.quick` | Camadas 2D/3D, câmera e distribuição de profundidade válidas<br>→ Profundidade ordenada sem salto de enquadramento ao ativar | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | parallax-quick, parallax-advanced |
| Edição rápida de comp (fastEdit)<br>`ae.comp.fast-edit` | Prévia de comps, resolução/FPS/duração e consentimento<br>→ Somente comps aprovadas recebem valores válidos | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | p2-3d-echo-fastedit |
| Biblioteca de formas (shapeLibrary)<br>`ae.shape.library` | Comp ativa, forma/tamanho/posição válidos<br>→ Shape nativa editável com âncora coerente | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | shape-library |
| Trim Paths (trimPath)<br>`ae.shape.trim-path` | Shape/grupos selecionados e parâmetros válidos<br>→ Trim editável nos paths-alvo | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | shape-trim-path |
| Loop por marcadores (timeMarkerLoop)<br>`ae.time.marker-loop` | Marcadores/keys compatíveis e propriedade expressível<br>→ Loop respeita marcadores e preserva animação base | PASS registro; MotionAE dispatcher / MotionUndo | PASS / NOT RUN | time-chms020 |

## Reaplicação e preservação por ferramenta

| Ferramenta | Critério a comprovar no host |
|---|---|
| wordReveal | Ajustar a instância própria, preservar Source Text e remover sem afetar conteúdo externo. **HOST NOT RUN**. |
| variableMorph | Ajustar rig próprio; recusar conflito e recuperar após falha. **HOST NOT RUN**. |
| styleSwap | Tratar aplicação repetida e restauração do estilo original. **HOST NOT RUN**. |
| verticalPulse | Ler/ajustar/remover somente a instância gerenciada. **HOST NOT RUN**. |
| loopOut | Reutilizar controle próprio e preservar expressão externa. **HOST NOT RUN**. |
| smooth | Atualizar somente expressão/controle gerenciados. **HOST NOT RUN**. |
| wiggle | Atualizar instância própria; respeitar expressão e keys externas. **HOST NOT RUN**. |
| flicker | Reutilizar controles e não duplicar efeito por acidente. **HOST NOT RUN**. |
| rename | Repetição é nova operação; confirmar resultado e seleção atual. **HOST NOT RUN**. |
| reverseOrder | Segunda inversão restaura ordem; verificar mattes/parents. **HOST NOT RUN**. |
| anchor | Mesmo ponto produz no-op honesto sem destruir animação. **HOST NOT RUN**. |
| cutKeys | Não apagar conteúdo/keys fora do contrato; revalidar prévia. **HOST NOT RUN**. |
| delay | Repetição soma apenas quando solicitado; colisões são recusadas. **HOST NOT RUN**. |
| flip | Segunda aplicação restaura sinal; não substituir expressão externa. **HOST NOT RUN**. |
| createNull | Criação explícita pode criar outro; não reapontar pais externos. **HOST NOT RUN**. |
| parent | Parent existente gera no-op honesto; ciclo falha antes da escrita. **HOST NOT RUN**. |
| textBox | Ajustar caixa própria sem duplicar nem alterar texto externo. **HOST NOT RUN**. |
| ease | Live/aplicar usam mesma sessão; seleção obsoleta não grava. **HOST NOT RUN**. |
| aiToVector | Nova conversão é explícita; falha reverte camada/seleção/tempo. **HOST NOT RUN**. |
| textToVector | Nova conversão é explícita; falha não deixa shapes parciais. **HOST NOT RUN**. |
| particles | Ajustar emissor próprio; manter CC Particle World legado. **HOST NOT RUN**. |
| texture | Reusar asset próprio quando previsto, sem substituir conteúdo externo. **HOST NOT RUN**. |
| clean | Scan novo após mudança; projeto vazio não simula remoção. **HOST NOT RUN**. |
| reverseKeys | Duas inversões recuperam estado; colisão falha sem mutação. **HOST NOT RUN**. |
| reverseValues | Duas inversões restauram valores; manter keys não selecionadas. **HOST NOT RUN**. |
| sendToEdge | Mesmo limite não desloca de novo; colisões não apagam keys. **HOST NOT RUN**. |
| neon | Atualizar efeito próprio, preservar efeitos do usuário. **HOST NOT RUN**. |
| beat | Reusar amplitude/controladores próprios e explicar conversão de áudio. **HOST NOT RUN**. |
| cloneKeys | Nova cópia é explícita; conflito/erro reverte toda escrita. **HOST NOT RUN**. |
| timeController | Preservar remapeamento externo; atualizar somente controle próprio. **HOST NOT RUN**. |
| animateKinetic | Reutilizar controles próprios e recusar autorreferência/conflito. **HOST NOT RUN**. |
| inertial | Atualizar efeito próprio, não sobrescrever expressão alheia. **HOST NOT RUN**. |
| jump | Reaplicar com política explícita para keys/expressões existentes. **HOST NOT RUN**. |
| copyKeys | Nova cópia troca clipboard; ausência de keys explica motivo. **HOST NOT RUN**. |
| pasteKeys | Não sobrescrever keys sem política; rollback em falha parcial. **HOST NOT RUN**. |
| lookAt | Atualizar rig próprio sem acumular expressão ou perder parent. **HOST NOT RUN**. |
| orbit | Ajustar/bake da mesma instância mantendo seleção e transform. **HOST NOT RUN**. |
| breakShape | Criação explícita; falha restaura original e elimina parciais. **HOST NOT RUN**. |
| effector | Ajustar rig próprio; preservar expressões externas e referências. **HOST NOT RUN**. |
| cameraTransition | Reusar/corrigir rig próprio e restaurar tempo/seleção. **HOST NOT RUN**. |
| cylinder | Criação explícita com rollback e consentimento destrutivo. **HOST NOT RUN**. |
| cube | Criação explícita; não substituir itens existentes por nome. **HOST NOT RUN**. |
| gradient | Ler/ajustar/bake/remover somente gradiente próprio. **HOST NOT RUN**. |
| wave | Atualizar efeito próprio e restaurar falhas. **HOST NOT RUN**. |
| tile | Reaplicar conforme instância; proteger fonte e itens externos. **HOST NOT RUN**. |
| glitch | Reusar mapa/rig próprio; rollback não deixa mapas parciais. **HOST NOT RUN**. |
| echo | Atualizar instância própria e respeitar efeito externo. **HOST NOT RUN**. |
| parallax | Quick/editor compartilham rig; ajustar/mover/remover/bake preservam base. **HOST NOT RUN**. |
| fastEdit | Revalidar seleção/prévia; mesmo valor gera no-op honesto. **HOST NOT RUN**. |
| shapeLibrary | Criação nova explícita e rollback em falha. **HOST NOT RUN**. |
| trimPath | Reutilizar trim próprio sem alterar grupo externo. **HOST NOT RUN**. |
| timeMarkerLoop | Atualizar expressão própria e recusar conflito externo. **HOST NOT RUN**. |

## Ações rápidas

| Ação | Entrada | Resultado | AUTO / HOST |
|---|---|---|---|
| precompose | Comp ativa e camadas compatíveis selecionadas | Pré-compor seleção | PASS / NOT RUN |
| center | Comp ativa e camadas compatíveis selecionadas | Centralizar na composição | PASS / NOT RUN |
| fit | Comp ativa e camadas compatíveis selecionadas | Ajustar à composição | PASS / NOT RUN |
| freeze | Comp ativa e camadas compatíveis selecionadas | Congelar frame | PASS / NOT RUN |
| mirror | Comp ativa e camadas compatíveis selecionadas | Espelhar horizontalmente | PASS / NOT RUN |
| dash-stroke | Comp ativa e camadas compatíveis selecionadas | Contorno tracejado | PASS / NOT RUN |
| create-adjustment | Comp ativa; seleção opcional | Criar camada de ajuste | PASS / NOT RUN |
| create-solid | Comp ativa; seleção opcional | Criar sólido | PASS / NOT RUN |
| create-shape | Comp ativa; seleção opcional | Criar forma retangular | PASS / NOT RUN |
| create-null | Comp ativa; seleção opcional | Criar objeto nulo | PASS / NOT RUN |
| create-camera | Comp ativa; seleção opcional | Criar câmera | PASS / NOT RUN |
| save-frame | Comp ativa; seleção opcional | Salvar frame em PNG | PASS / NOT RUN |
| effect-hue | Comp ativa e camadas compatíveis selecionadas | Matiz e saturação | PASS / NOT RUN |
| effect-fill | Comp ativa e camadas compatíveis selecionadas | Preenchimento | PASS / NOT RUN |
| effect-tint | Comp ativa e camadas compatíveis selecionadas | Tonalidade | PASS / NOT RUN |
| effect-blur | Comp ativa e camadas compatíveis selecionadas | Desfoque | PASS / NOT RUN |
| effect-lumetri | Comp ativa e camadas compatíveis selecionadas | Lumetri Color | PASS / NOT RUN |
| effect-curves | Comp ativa e camadas compatíveis selecionadas | Curvas | PASS / NOT RUN |

## Comandos e segurança

Paridade do registro: faltando no host = 0; faltando descriptor = 0. Cada um dos 102 registros possui preflight/run. O ledger contém requisitos, destrutividade, timeout, suporte a cancel/dry-run e rótulo de Undo por comando. Referências literais em testes são apenas navegação; não equivalem a cobertura executada.

O dispatcher é dono do preflight antes de Undo; comandos mutantes devem fornecer rollback coerente. Testes dedicados host-dispatch, undo-nao-aninha e rollback-cobertura exercitam essa infraestrutura. Uma função registrada ainda pode produzir no-op, efeito incorreto, falha de capacidade ou interação inválida no host.

Comandos sem referência literal direta nas suítes examinadas: `ae.presets.color-adjust`, `ae.presets.personal-preview`. Isso identifica lacuna de rastreabilidade, não prova ausência de testes indiretos.

## Critério de liberação e recibos pendentes

- happy path / resultado visual: registrar por ferramenta, AE/build/fixture e evidência observada.
- nenhuma comp/projeto: registrar por ferramenta, AE/build/fixture e evidência observada.
- seleção errada ou vazia: registrar por ferramenta, AE/build/fixture e evidência observada.
- alvo bloqueado/incompatível: registrar por ferramenta, AE/build/fixture e evidência observada.
- aplicar novamente: registrar por ferramenta, AE/build/fixture e evidência observada.
- Undo único após sucesso: registrar por ferramenta, AE/build/fixture e evidência observada.
- falha no segundo alvo e rollback: registrar por ferramenta, AE/build/fixture e evidência observada.
- preservar seleção/CTI/conteúdo externo: registrar por ferramenta, AE/build/fixture e evidência observada.

Nenhum item desta matriz é promovido para HOST PASS por instalação, hash, teste em navegador ou mocks. Acrescentar recibos do host como evidência separada e atualizar cada linha somente para cenários realmente executados.
