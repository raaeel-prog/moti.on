# Refinamento visual e aviso que comprimía a galeria

Build local 0.2.0 — 2026-09-18T16:04:35.103Z.

## Implementado

- Edição de presets com rótulo, valor azul e unidade na mesma linha; setinha revela o slider. Controles numéricos preservam validação, teclado, edição local e Aplicar ajustes.
- Valores vindos do AE são apresentados com a precisão do campo, evitando resíduos de ponto flutuante como 125.599998474121. O alvo/fingerprint do host permanece original.
- Rodapé com tamanho de miniaturas discreto, indicador de Autoplay e remoção da linha de aplicação vazia. Categorias com seleção alinhada.
- Avisos do browser usam uma linha acima do conteúdo. Corrigido o flex horizontal que convertia o aviso em uma coluna gigante e esmagava a galeria. Mensagens longas têm altura limitada e rolagem própria.
- Biblioteca pessoal, presets, animações, curvas e comandos existentes preservados.

## Arquivos

- UI: apps/after-effects-cep/client/src/preset-workspace.ts, preset-gallery.ts, packages/ui-core/src/theme.css.
- Cores: packages/ui-tokens/src/tokens.css, shared/crosshost.tokens.css/json e packages/ui-tokens/scripts/check-contrast.mjs. Novo token value-editable com contraste AA nos dois temas.
- Host: nenhum código alterado.
- Evidências: artifacts/video-1242/verify-ui.mjs, verify-native.jsx, capturas e relatórios JSON.

## Verificação

- npm run check: lint, tipos, build, validação e contraste PASS; 1244/1266 testes PASS. As 22 falhas têm os mesmos nomes do baseline camera-ease-0917; nenhuma nova falha.
- npm run skills:validate: PASS.
- node --test com preset-gallery.test.mjs, preset-workspace-host.test.mjs e tokens.test.mjs: 11/11 PASS.
- verify-ui.mjs: PASS em larguras 280/360/480/720, painel baixo 280×320, escalas 100/125/150/200%, teclado, valores vazios/inválidos, decimal, envio dos ajustes, alvo obsoleto, recarga, inglês, tamanho de miniaturas, Autoplay e aviso acima do browser. Capturas revisadas.
- verify-native.jsx: PASS no AE 26.5x89, macOS 26.6.2/64. Fixture temporária de texto, aplicar/inspecionar/ajustar/inspecionar, preservação do texto, seleção e tempo. Fixture removida. Intensidade 125.6 lida como 125.599998474121 pelo slider nativo; comparação com tolerância 0.0001.
- UI nativa final: NOT RUN. Uma captura da build anterior foi obtida; a tentativa de reabrir o painel instalado terminou com cgWindowNotFound no controle de interface. Capturas do novo visual são do navegador de teste; não são prova de renderização no CEP.
- Instalação: 66 arquivos idênticos à build. Backup artifacts/install-backups/ae-20260918-130459/previous. Reabrir painel/reiniciar AE para garantir o carregamento.

```text
VERIFICATION REPORT

Build:             PASS
Static validation: PASS
Types/Lint:        PASS
Unit tests:        1244/1266 passed (inclui contratos)
Contract tests:    PASS para os caminhos exercitados
Golden tests:      PASS — UI de navegador revisada
AE host:           PASS — comandos; UI final NOT RUN
Premiere host:     NOT RUN — controles específicos de AE
Performance:       NOT MEASURED
Packaging:         PASS — instalação local, 66 arquivos verificados

Overall: NOT READY para release de produção
Blocking evidence:
- 22 falhas anteriores da suíte geral.
- Conferência visual da build final dentro do CEP pendente.
- Assinatura e matriz completa de hosts não fazem parte desta atualização local.
```
