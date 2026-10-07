# Biblioteca de presets: capacidades nativas

Verificado em After Effects 26.5x89 / macOS, setembro de 2026.

Fontes primárias de comportamento:

- Adobe, [Animating text](https://helpx.adobe.com/after-effects/desktop/animating-text/text-animation/animating-text.html): animadores e seletores de texto.
- Adobe, [Cycore plugins](https://helpx.adobe.com/after-effects/desktop/apply-effects-and-animation-presets/list-of-effects/cycore-plugins.html): efeitos nativos instalados.
- Dicionário AppleScript instalado com o aplicativo, `Contents/Resources/ae.sdef`: execução de scripts pelo comando público `DoScriptFile`.

Nomes de correspondência e valores não foram inferidos das traduções da UI. Foram medidos por scripts na instalação local. Evidência: `artifacts/presets/probe.json`, `probe-extra.json`, `probe-more.json`, `probe-parameters.json`.

Descobertas importantes:

- Text Animator Properties expõe propriedades ocultas antes de adicioná-las. A criação precisa chamar `addProperty`; consultar a propriedade não comprova que ela está ativa.
- Níveis simplificados e saturação mestre não aceitam expressões nessa versão. Contraste usa Brightness & Contrast 2, e a saturação usa valor nativo fixo com opacidade de efeito dirigida pelo controle de intensidade.
- Grupos indexados invalidam referências ao adicionar novos itens. Restauração usa caminhos e nomes próprios, resolvidos novamente.
- Consultar nomes inexistentes com mais de 39 bytes pode lançar erro. A localização de grupos próprios percorre os filhos por índice.
- TextDocument horizontalScale/verticalScale usa fator 1 para 100%; a fixture normaliza esse valor.
- O catálogo usa somente efeitos verificados com `canAddProperty`. Ausência de efeito produz erro antes de mutar.
