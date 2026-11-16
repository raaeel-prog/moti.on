# Auditoria funcional Moti.on — evidência nativa

Atualizado: 2026-10-24T22:54:20.661Z. Host: After Effects 2026 26.5x89 / Windows x64.

Aplicação nativa: **52/52 ferramentas**, **18/18 ações rápidas**. Undo nativo: **51/51 operações mutantes** (Copiar não altera o projeto). Check completo: **PASS**, 2867/2867 testes.

Estado de liberação: **NOT READY** enquanto os cenários indicados como NOT RUN não forem concluídos. PASS significa o cenário identificado pelo recibo, sem generalização para combinações não executadas.

## Correções integradas

- Parallax ordena pela timeline, preserva a projeção fora do centro, ajusta sem duplicar e separa rig de movimento. Prévia própria projeta os planos e as quatro receitas de câmera.
- Suavização preserva Hold por padrão, trata os lados separadamente, conserva o caminho espacial e usa velocidade nativa de cor em unidades RGBA de 0–255.
- Gradientes abrem em Aurora animada de seis segundos; seis novas receitas originais e prévia completa com iluminação/textura. ABI e instâncias existentes preservados.
- Partículas mantêm o clássico e oferecem Poeira, Bokeh, Neve, Faíscas e Campo 3D; quatro fluxos, controlador e remoção explícita para estilos. Prévia responde à variação e à quantidade por fluxo.
- Ferramentas abrem ajustes sem mutar a composição; defaults centralizados, resets coerentes e guardas contra callbacks obsoletos.
- Clean verifica IDs após remoção; evita comparar referências invalidadas pelo AE. Remoção efetiva, Undo, Redo e reabertura confirmados.
- Estilos de preview entram no build; controles de cores não se sobrepõem em 280 px. Instalação seletiva com backup e rollback validado.

- Neon: limiar de brilho corrigido para fontes escuras; reaplicação e rollback após falha nativa na segunda camada conferidos. [Recibo](../../artifacts/tools-audit/neon-native/result.json).
- Cubo e Cilindro: padrões proporcionais à composição; seis renders nativos com enquadramento completo. [Recibo](../../artifacts/tools-audit/geometry-native/result.json) · [limites de alfa](../../artifacts/tools-audit/geometry-native/framing.json).
- Biblioteca compacta: consultas antigas são migradas para impedir filtros invisíveis. Teste de regressão incluído.

## Matriz por ferramenta

| Ferramenta | AUTO | Aplicar AE | Reaplicar AE | Undo | Redo | Reabrir | Evidência |
|---|---|---|---|---|---|---|---|
| Revelação de palavras (wordReveal) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/wordReveal-result.json) |
| Morph variável (variableMorph) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/variableMorph-result.json) |
| Troca de estilo (styleSwap) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/styleSwap-result.json) |
| Pulso vertical (verticalPulse) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/verticalPulse-result.json) |
| Loop Out (loopOut) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/loopOut-result.json) |
| Smooth de expressão (smooth) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/smooth-result.json) |
| Wiggle (wiggle) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/wiggle-result.json) |
| Flicker (flicker) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/flicker-result.json) |
| Renomear (rename) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/rename-result.json) |
| Inverter camadas (reverseOrder) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/reverseOrder-result.json) |
| Âncora (anchor) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/anchor-result.json) |
| Recortar por keys (cutKeys) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/cutKeys-result.json) |
| Delay (delay) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/delay-result.json) |
| Espelhar camada (flip) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/flip-result.json) |
| Criar nulo (createNull) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/createNull-result.json) |
| Parentesco (parent) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/parent-result.json) |
| Caixa de texto (textBox) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/textBox-result.json) |
| Suavização de keys (ease) | PASS | PASS | PASS | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/ease-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/ease-result.json) |
| Illustrator para vetor (aiToVector) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/aiToVector-result.json) |
| Texto para vetor (textToVector) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/textToVector-result.json) |
| Partículas (particles) | PASS | PASS | PASS | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/particles-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/particles-result.json) |
| Textura (texture) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/texture-result.json) |
| Limpar projeto (clean) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/clean-result.json) |
| Inverter tempo (reverseKeys) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/reverseKeys-result.json) |
| Inverter valores (reverseValues) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/reverseValues-result.json) |
| Enviar keys ao limite (sendToEdge) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/sendToEdge-result.json) |
| Neon (neon) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/neon-result.json) |
| Beat (beat) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/beat-result.json) |
| Clonar keys (cloneKeys) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/cloneKeys-result.json) |
| Controlador de tempo (timeController) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/timeController-result.json) |
| Kinetic (animateKinetic) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/animateKinetic-result.json) |
| Inércia (inertial) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/inertial-result.json) |
| Jump (jump) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/jump-result.json) |
| Copiar keys (copyKeys) | PASS | PASS | PASS (executed) | NOT APPLICABLE | NOT APPLICABLE | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/copyKeys-result.json) |
| Colar keys (pasteKeys) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/pasteKeys-result.json) |
| Look At (lookAt) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/lookAt-result.json) |
| Órbita (orbit) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/orbit-result.json) |
| Separar shapes (breakShape) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/breakShape-result.json) |
| Effector (effector) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/effector-result.json) |
| Transição de câmera (cameraTransition) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/cameraTransition-result.json) |
| Cilindro (cylinder) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/cylinder-result.json) |
| Cubo (cube) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/cube-result.json) |
| Gradientes (gradient) | PASS | PASS | PASS | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/gradient-native/1792798201455/result.json) · [histórico](../../artifacts/tools-audit/undo-native/gradient-result.json) |
| Ondas (wave) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/wave-result.json) |
| Tile (tile) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/tile-result.json) |
| Glitch (glitch) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/glitch-result.json) |
| Echo (echo) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/echo-result.json) |
| Parallax (parallax) | PASS | PASS | PASS | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/parallax-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/parallax-result.json) |
| Edição rápida de comp (fastEdit) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/fastEdit-result.json) |
| Biblioteca de formas (shapeLibrary) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/shapeLibrary-result.json) |
| Trim Paths (trimPath) | PASS | PASS | PASS (executed) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/trimPath-result.json) |
| Loop por marcadores (timeMarkerLoop) | PASS | PASS | PASS (safe refusal) | PASS | PASS | PASS | [recibo](../../artifacts/tools-audit/catalog-native/result.json) · [histórico](../../artifacts/tools-audit/undo-native/timeMarkerLoop-result.json) |

## Ações rápidas

| Ação | Aplicar AE | Undo | Redo |
|---|---|---|---|
| precompose | PASS | PASS | PASS |
| center | PASS | PASS | PASS |
| fit | PASS | PASS | PASS |
| freeze | PASS | PASS | PASS |
| mirror | PASS | PASS | PASS |
| dash-stroke | PASS | PASS | PASS |
| create-adjustment | PASS | PASS | PASS |
| create-solid | PASS | PASS | PASS |
| create-shape | PASS | PASS | PASS |
| create-null | PASS | PASS | PASS |
| create-camera | PASS | PASS | PASS |
| save-frame | PASS | NOT APPLICABLE | NOT APPLICABLE |
| effect-hue | PASS | PASS | PASS |
| effect-fill | PASS | PASS | PASS |
| effect-tint | PASS | PASS | PASS |
| effect-blur | PASS | PASS | PASS |
| effect-lumetri | PASS | PASS | PASS |
| effect-curves | PASS | PASS | PASS |

Sem composição: **70/70 PASS** via dispatcher real. Inventário do projeto após histórico/reabertura: **52/52 ferramentas PASS** e **18/18 ações rápidas PASS**. A rodada inclui remoção efetiva do Clean; Undo de Copiar e exportar PNG não se aplica.

As receitas de partículas foram calibradas com renders nativos. [Gradientes](../../artifacts/tools-audit/gradient-contact-sheet.png) · [Partículas](../../artifacts/tools-audit/particles-contact-sheet.png).

## Limites e pendências

- PASS descreve somente o cenário descartável identificado pelo recibo.
- Gradiente: os controles CPU/GPU foram solicitados e renderizados; identificação do backend realmente utilizado permanece NOT RUN.
- Rotas completas de interface, teclado/foco e injeção nativa de falha parcial por ferramenta permanecem NOT RUN; os testes automatizados de rollback não substituem essa prova.
- As observações de abertura/aplicação do editor de Gradientes no painel real são amostrais. A cobertura nativa de todos os controles e caminhos da interface permanece NOT RUN.
- Snapshots descartados excederam o limite de coleta no Pulso vertical. Os recibos finais usam leitura limitada, fronteiras separadas do event loop e inventário persistente do projeto.
- Arquivos concorrentes de câmera, main e suavização foram preservados. Recibos anteriores não validam automaticamente as novas interações desses arquivos.

Os scripts de QA exigem projeto vazio ou identidade exata dos próprios itens. Os arquivos de conta, licença, preferências e binários nativos não entram na atualização CEP. Nenhum código, preset ou recurso visual comercial foi incorporado.

[Inventário e contratos](2026-10-23-tools-audit.md) · [Matriz JSON](../../artifacts/tools-audit/native-matrix.json) · [Estudo REA](../research/2026-10-23-brazu-composer-tools-rea.md)

## Build e instalação

Navegador: **PASS**, 372 verificações; recibo do bundle fbd1acd9bff97a9caab753b7c0e4ebadb7a9c289a0f43b6962b46880d0a63abe. Essas verificações usam CEP simulado e não substituem o host.
Integridade: **PASS**; 1015 fontes e 646 arquivos CEP comparados. [Recibo](../../artifacts/tools-audit/delivery-integrity.json).
[Recarga observada do painel instalado](../../artifacts/tools-audit/installed-panel-reload.json) · [Projeto vazio e runner encerrado](../../artifacts/tools-audit/runner-handoff.json).
