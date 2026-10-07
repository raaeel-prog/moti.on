# Presets com Motion Core — 20/09/2026

Adicionar quatro receitas novas na coleção `native`, mantendo integralmente as receitas existentes e seus IDs. O renderer `CHMS Motion Core` conserva seu contrato de cinco parâmetros; não é modificado aqui. CEP/ExtendScript mantém timing, transformações e animadores editáveis, Apply/Adjust/Remove e Bake para motion. Bake de texto continua indisponível porque seletores dependem de textIndex.

Arquivos: contrato `motion-library-native.ts`, agregador de receitas, adapter `preset-library.jsx`, prévia SVG e testes correspondentes. Requisito: `canAddProperty` antes de mutar; parâmetros existentes verificados no preflight e a instância nova validada antes de configurar, com rollback se incompatível. Nenhuma substituição visual automática quando o core está ausente.

Parâmetros do core: intensidade limitada a 0–100, RGB em pixels de referência 1080 e ajustado à altura da composição, frequência 0 para RGB ou 12 para glitch, deslocamento 0 ou 64 pixels de referência, seed 17. Transições usam o envelope In/Out; estático mantém envelope 1. Intensidade de receita acima de 100% satura no limite do core. As prévias SVG são ilustrações, não renderizações de referência do C++.

Provas: identidades, nomes, preservação das 131 receitas antigas, capability ausente/incompatível, zero/entrada/repouso/saída, reaplicação e ajuste sem duplicação, rollback e remoção preservando efeitos alheios. Build e testes completos mais fixture/render no After Effects são coordenados pelo agente integrador. Reversão: remover as quatro receitas e os caminhos `native-*`; o binário e presets antigos não mudam.

Estado inicial: IMPLEMENTED_NOT_HOST_VERIFIED até conclusão da evidência do integrador.
