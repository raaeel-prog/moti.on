# Revisão de design e biblioteca — 2026-09-16

## Evidência e intenção
Os dois vídeos foram transcritos localmente. Os 8.057 frames foram decodificados e indexados; a revisão visual cobre a sequência completa em folhas de contato por segundo e por mudança, com ampliações nos momentos relevantes. Cores são etiquetas de pastas (vídeo 2, 17–23s), não cor da animação. Implementar agora: pastas recolhíveis, etiquetas locais, Browse/Editar, autoplay, tamanho de miniaturas, In/Out/Ambos, duplo clique, biblioteca pessoal .ffx e renovação de Ferramentas preservando atalhos. Títulos cinematográficos são referência de organização; o vídeo prioriza funcionalidades antes de novos conteúdos.

## Fatias e arquivos
1. Contratos/registry: proprietário único design_contract; inspeção e ajuste de preset aplicado, catálogo pessoal e aplicação nativa .ffx. Contratos existentes preservados.
2. Host: preset-library.jsx para ler valores nativos + ajustar com alvo/fingerprint; personal-preset-library.jsx para pastas escolhidas pelo usuário, listagem limitada e applyPreset documentado.
3. UI: preset-gallery.ts, preset-workspace.ts, personal-library.ts, main.ts; árvore, edição, ações rápidas e autoplay visível coordenado.
4. Preferências: labels, recolhimento, autoplay e tamanho apenas locais; nenhum dado de projeto persistido. Pastas escolhidas persistidas nas preferências AE, sem copiar arquivos.
5. Tema: theme.css, preservar tokens base; superfícies neutras e divisórias discretas, atalhos existentes intactos.

## Invariantes e riscos
Nunca inferir alvo de um draft antigo. Ajustar exige composição, camada, instância e fingerprint iguais ao snapshot, uma única camada selecionada. Valores animados/expressões em controles não serão sobrescritos. Biblioteca .ffx aceita somente IDs emitidos pela listagem e arquivos dentro de raízes escolhidas, sem scripts ou aliases; limites de profundidade/quantidade/tamanho. Apply nativo uma única chamada para seleção (AE aplica a todos), preservando tempo e seleção, Undo coerente. Arquivos pessoais permanecem editáveis nos controles nativos; Editor Moti.on é para seus presets gerenciados.

## Testes e evidência
Checks completos do repositório; testes de contratos, rejeição de alvo obsoleto, persistência, árvore/etiquetas, autoplay fora de tela e reduced motion, atalhos e biblioteca. Capturas 280/360/480/720. Fixture temporária AE 26.5 para leitura, ajustes reais e conflicts, .ffx, seleção/tempo e Undo. Não tocar composições do usuário. Falhas preexistentes separadas.

## Reversão
Fonte anterior em artifacts/design-review/source-before/source.tgz. Instalação dev gera backup próprio antes de atualizar extensão. Sem publicação/release assinado.
