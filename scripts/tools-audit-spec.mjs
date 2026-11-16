/** Audit expectations, not product defaults or a claim of native-host verification. */
const rows = [
  ["wordReveal", "Revelação de palavras", "Texto editável selecionado; duração e stagger por frames", "Revelação por palavras com controles gerenciados", "Ajustar a instância própria, preservar Source Text e remover sem afetar conteúdo externo", "text-word-reveal,text-word-morph"],
  ["variableMorph", "Morph variável", "Texto/fonte compatível ou outlines, seleção e raio do controlador", "Peso/forma responde ao controlador mantendo texto e metadados", "Ajustar rig próprio; recusar conflito e recuperar após falha", "text-variable-morph,text-variable-morph-v2,text-pulse-morph-lifecycle"],
  ["styleSwap", "Troca de estilo", "Camadas de texto e estilos/fonte válidos", "Troca animada de estilos com texto preservado", "Tratar aplicação repetida e restauração do estilo original", "text-style-swap"],
  ["verticalPulse", "Pulso vertical", "Texto selecionado, preset/duração compatíveis com FPS", "Pulso/distorção editável sem expressão com erro", "Ler/ajustar/remover somente a instância gerenciada", "text-vertical-pulse,text-pulse-morph-lifecycle"],
  ["loopOut", "Loop Out", "Propriedades animáveis com keys compatíveis e modo de loop", "Repetição após as keys com controle editável", "Reutilizar controle próprio e preservar expressão externa", "expression-loopout"],
  ["smooth", "Smooth de expressão", "Propriedade compatível; largura/amostras e limite de tempo", "Suavização por amostragem, separada de easing de keyframes", "Atualizar somente expressão/controle gerenciados", "expression-smooth"],
  ["wiggle", "Wiggle", "Propriedades expressíveis; frequência/amplitude por dimensão", "Oscilação configurável com controles animáveis", "Atualizar instância própria; respeitar expressão e keys externas", "expression-wiggle"],
  ["flicker", "Flicker", "Opacidade/propriedade compatível e preset", "Variação de intensidade controlada e reproduzível", "Reutilizar controles e não duplicar efeito por acidente", "expression-flicker"],
  ["rename", "Renomear", "Camadas do escopo e regra confirmada na prévia", "Nomes resultantes correspondem à prévia", "Repetição é nova operação; confirmar resultado e seleção atual", "layer-rename-reverse"],
  ["reverseOrder", "Inverter camadas", "Duas ou mais camadas; políticas de matte e parent", "Ordem invertida preservando relações permitidas", "Segunda inversão restaura ordem; verificar mattes/parents", "layer-rename-reverse"],
  ["anchor", "Âncora", "Camadas compatíveis; ponto da grade e compensação visual", "Âncora muda sem salto visual, inclusive animação suportada", "Mesmo ponto produz no-op honesto sem destruir animação", "anchor-align"],
  ["cutKeys", "Recortar por keys", "Keys/intervalo válido, prévia e consentimento destrutivo", "Limites das camadas coincidem com o intervalo aprovado", "Não apagar conteúdo/keys fora do contrato; revalidar prévia", "keys-chms016"],
  ["delay", "Delay", "Keys/camadas selecionadas, ordem e atraso em frames", "Stagger na ordem e janela solicitadas", "Repetição soma apenas quando solicitado; colisões são recusadas", "keys-chms016"],
  ["flip", "Espelhar camada", "Camadas com escala editável e eixo", "Espelhamento preserva os canais/keys restantes", "Segunda aplicação restaura sinal; não substituir expressão externa", "layer-flip"],
  ["createNull", "Criar nulo", "Comp ativa; seleção opcional e dimensão", "Nulo/controlador com parent e posição esperados", "Criação explícita pode criar outro; não reapontar pais externos", "layer-create-null"],
  ["parent", "Parentesco", "Camadas filhas/pai válidos, sem ciclo", "Hierarquia solicitada mantendo resultado visual permitido", "Parent existente gera no-op honesto; ciclo falha antes da escrita", "layer-parent"],
  ["textBox", "Caixa de texto", "Texto selecionado, padding/estilo e tempo válidos", "Caixa editável acompanha limites do texto", "Ajustar caixa própria sem duplicar nem alterar texto externo", "text-box"],
  ["ease", "Suavização de keys", "Keys temporais/espaciais compatíveis, curva/modo e sessão atuais", "Curva aplicada nas keys/segmentos selecionados sem perder estado", "Live/aplicar usam mesma sessão; seleção obsoleta não grava", "ease-safe-apply,ease-editor-ui,ease-session,ease-points-bake,ease-actions,keys-ease-tipos"],
  ["aiToVector", "Illustrator para vetor", "Camada Illustrator compatível e comando de menu disponível", "Shape vetorial criada e original preservada conforme opção", "Nova conversão é explícita; falha reverte camada/seleção/tempo", "vector-clean-particles-safety"],
  ["textToVector", "Texto para vetor", "Texto selecionado e capacidade nativa de conversão", "Outlines editáveis com original preservada conforme opção", "Nova conversão é explícita; falha não deixa shapes parciais", "vector-clean-particles-safety"],
  ["particles", "Partículas", "Comp ativa; emissor/seleção e engine nativa disponível", "Partículas visíveis com controles próprios e modos suportados", "Ajustar emissor próprio; manter CC Particle World legado", "particles,vector-clean-particles-safety"],
  ["texture", "Textura", "Arquivo/asset local válido e camada alvo", "Textura importada/aplicada com composição e licença preservadas", "Reusar asset próprio quando previsto, sem substituir conteúdo externo", "texture-local"],
  ["clean", "Limpar projeto", "Scan atual, achados explícitos e consentimento de remoção", "Somente itens aprovados e não usados são removidos", "Scan novo após mudança; projeto vazio não simula remoção", "vector-clean-particles-safety"],
  ["reverseKeys", "Inverter tempo", "Duas ou mais keys e intervalo sem colisões", "Tempos invertidos, easing/tangentes transformados corretamente", "Duas inversões recuperam estado; colisão falha sem mutação", "keyframe-professional"],
  ["reverseValues", "Inverter valores", "Keys selecionadas compatíveis", "Valores invertidos mantendo tempos conforme contrato", "Duas inversões restauram valores; manter keys não selecionadas", "keys-reverse-values"],
  ["sendToEdge", "Enviar keys ao limite", "Keys e referência de início/fim/área de trabalho", "Grupo de keys alinha ao limite preservando espaçamento", "Mesmo limite não desloca de novo; colisões não apagam keys", "keys-send-to-edge"],
  ["neon", "Neon", "Camada compatível; cor/intensidade e efeitos nativos disponíveis", "Brilho/neon editável sem expressão com erro", "Atualizar efeito próprio, preservar efeitos do usuário", "style-neon"],
  ["beat", "Beat", "Áudio/amplitude disponível e propriedades expressíveis", "Movimento responde ao áudio com controles editáveis", "Reusar amplitude/controladores próprios e explicar conversão de áudio", "audio-beat"],
  ["cloneKeys", "Clonar keys", "Keys, modo repeat/mirror e destino sem colisão", "Cópias no destino correto com easing e metadados preservados", "Nova cópia é explícita; conflito/erro reverte toda escrita", "keyframe-professional,p1-inertial-jump-copy"],
  ["timeController", "Controlador de tempo", "Camada com remapeamento compatível e intervalo válido", "Controle editável de reprodução/tempo", "Preservar remapeamento externo; atualizar somente controle próprio", "time-chms020"],
  ["animateKinetic", "Kinetic", "Propriedade/fonte de velocidade compatível e seleção válida", "Valor reage à velocidade pelo rig configurado", "Reutilizar controles próprios e recusar autorreferência/conflito", "keys-chms018-019,time-chms020"],
  ["inertial", "Inércia", "Keys/expressão compatíveis, amplitude/frequência/decaimento", "Overshoot pós-key preserva animação base", "Atualizar efeito próprio, não sobrescrever expressão alheia", "p1-inertial-jump-copy"],
  ["jump", "Jump", "Camadas/propriedades compatíveis e janela em frames", "Salto/bounce editável conforme modo", "Reaplicar com política explícita para keys/expressões existentes", "p1-inertial-jump-copy"],
  ["copyKeys", "Copiar keys", "Keys selecionadas compatíveis", "Clipboard contém dados completos sem mutar o projeto", "Nova cópia troca clipboard; ausência de keys explica motivo", "p1-inertial-jump-copy"],
  ["pasteKeys", "Colar keys", "Clipboard válido, propriedades destino e CTI", "Keys coladas com tempo/valor/easing e política de conflito", "Não sobrescrever keys sem política; rollback em falha parcial", "p1-inertial-jump-copy"],
  ["lookAt", "Look At", "Camadas 3D/alvo válidos, eixos e constraints", "Orientação aponta ao alvo no espaço correto", "Atualizar rig próprio sem acumular expressão ou perder parent", "p2-3d-echo-fastedit"],
  ["orbit", "Órbita", "Camadas 3D/centro, plano, raio e tempo válidos", "Órbita editável e controles animáveis", "Ajustar/bake da mesma instância mantendo seleção e transform", "orbit-live-controls"],
  ["breakShape", "Separar shapes", "Shape com grupos válidos e política do original", "Grupos tornam-se camadas editáveis sem deslocamento", "Criação explícita; falha restaura original e elimina parciais", "shape-break"],
  ["effector", "Effector", "Camadas alvo e raio/influência compatíveis", "Proximidade altera transform com controlador próprio", "Ajustar rig próprio; preservar expressões externas e referências", "rig-effector"],
  ["cameraTransition", "Transição de câmera", "Comp/câmera ou precomp selecionada e duração válida", "Movimento de transição e marcador de corte esperados", "Reusar/corrigir rig próprio e restaurar tempo/seleção", "camera-transition,camera-precomp-transition"],
  ["cylinder", "Cilindro", "Seleção/faces/texto e parâmetros 3D válidos", "Cilindro editável com disposição correta", "Criação explícita com rollback e consentimento destrutivo", "chms026-cylinder-cube"],
  ["cube", "Cubo", "Faces/comp e parâmetros válidos", "Seis faces editáveis e controlador coerente", "Criação explícita; não substituir itens existentes por nome", "chms026-cylinder-cube"],
  ["gradient", "Gradientes", "Comp/camada, stops/paleta e modo suportado", "Gradiente editável e preview consistente com modo animado", "Ler/ajustar/bake/remover somente gradiente próprio", "gradient,gradient-editor"],
  ["wave", "Ondas", "Camada compatível, amplitude/período e efeito nativo", "Ondulação editável conforme preset", "Atualizar efeito próprio e restaurar falhas", "chms027-wave-tile-glitch"],
  ["tile", "Tile", "Fonte/parâmetros e consentimento quando destrutivo", "Repetição/fundo editável com limites corretos", "Reaplicar conforme instância; proteger fonte e itens externos", "chms027-wave-tile-glitch"],
  ["glitch", "Glitch", "Camadas/parâmetros válidos e efeitos necessários", "Glitch e mapa próprios com intensidade controlada", "Reusar mapa/rig próprio; rollback não deixa mapas parciais", "chms027-wave-tile-glitch"],
  ["echo", "Echo", "Camada e controles temporais/efeito disponíveis", "Ecos editáveis com duração/intensidade esperadas", "Atualizar instância própria e respeitar efeito externo", "p2-3d-echo-fastedit"],
  ["parallax", "Parallax", "Camadas 2D/3D, câmera e distribuição de profundidade válidas", "Profundidade ordenada sem salto de enquadramento ao ativar", "Quick/editor compartilham rig; ajustar/mover/remover/bake preservam base", "parallax-quick,parallax-advanced"],
  ["fastEdit", "Edição rápida de comp", "Prévia de comps, resolução/FPS/duração e consentimento", "Somente comps aprovadas recebem valores válidos", "Revalidar seleção/prévia; mesmo valor gera no-op honesto", "p2-3d-echo-fastedit"],
  ["shapeLibrary", "Biblioteca de formas", "Comp ativa, forma/tamanho/posição válidos", "Shape nativa editável com âncora coerente", "Criação nova explícita e rollback em falha", "shape-library"],
  ["trimPath", "Trim Paths", "Shape/grupos selecionados e parâmetros válidos", "Trim editável nos paths-alvo", "Reutilizar trim próprio sem alterar grupo externo", "shape-trim-path"],
  ["timeMarkerLoop", "Loop por marcadores", "Marcadores/keys compatíveis e propriedade expressível", "Loop respeita marcadores e preserva animação base", "Atualizar expressão própria e recusar conflito externo", "time-chms020"]
];

export const TOOL_AUDIT_SPEC = Object.fromEntries(rows.map(([id, name, expectedInputs, visibleResult, reapplyPolicy, suites]) => [id, {
  name, expectedInputs, visibleResult, reapplyPolicy,
  requiredSuites: suites.split(",").map(name => `apps/after-effects-cep/tests/${name}.test.mjs`)
}]));

export const COMMON_SCENARIOS = [
  "happy path / resultado visual", "nenhuma comp/projeto", "seleção errada ou vazia", "alvo bloqueado/incompatível",
  "aplicar novamente", "Undo único após sucesso", "falha no segundo alvo e rollback", "preservar seleção/CTI/conteúdo externo"
];

export const AUXILIARY_SUITES = ["quick-actions", "quick-actions-ui", "quick-library", "tool-icons", "quick-args-aceitos", "host-dispatch", "undo-nao-aninha", "rollback-cobertura"]
  .map(name => `apps/after-effects-cep/tests/${name}.test.mjs`);
