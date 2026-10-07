# Parallax e espaçamentos — 12/09/2026

Implementação em `implementation/`; extensão local atualizada com backup reversível.

## Parallax

Corrigidos captura da seleção antes de criar objetos, leitura do Zoom no grupo correto da câmera, posição frontal, profundidades negativas com fundo em Z zero, compensação de Position XY e Scale XY, e ajuste calculado dos valores originais persistidos. A câmera e os planos não compartilham parent.

Quick e Create compartilham o executor. Quick repetido preserva a profundidade atual. Create/Adjust usam passo explícito ou zero para profundidade total automática de 25% do Zoom. Limite de 60%. A criação não anima automaticamente. Parallax completo permite movimento de câmera lateral, vertical, aproximação e suave, em três segundos, mantendo Zoom óptico separado. Remove restaura os planos originais após validar dependências. Foco/Wiggle/Zoom agora resolvem a câmera pela identidade do rig. Wiggle preserva Z; bake aceita a câmera com expressão gerenciada e sem keys anteriores.

O modo inicial recusa cenas incompatíveis: parents, propriedades separadas, animação/expressões nos planos, camadas bloqueadas, outras câmeras/3D, matte, efeitos/máscaras, estilos ativos, precomps/texto/shapes, pixels não quadrados e renderizadores diferentes de Classic 3D. Rigs antigos ou composições duplicadas com identidade divergente são recusados; não há migração automática.

### Evidência

- PASS: After Effects 26.5x89, macOS, quatro sólidos planos com posições e âncoras deslocadas, rotação, escala não uniforme e espelhada.
- PASS: maior erro nos cantos/âncoras: 0,00005654227931 pixel.
- PASS: reaplicar e ajustar A-B-A, erro máximo 0,00005253550466 pixel, sem duplicar câmera.
- PASS: deslocar câmera +100 px produz frente -133,333329 px e fundo -99,999997 px.
- PASS: remover restaura 2D, movimento nativo seguido de ajuste, repetição de movimento preserva keys.
- PASS: suíte completa final, 1.182 testes, lint, tipos, build, validação e contraste.
- PASS: reaplicação pelo botão Parallax no painel CEP instalado; status de ajuste confirmado, sete camadas preservadas no teste.
- PASS: painel nativo reaberto com os espaçamentos atualizados e redimensionado.
- NOT RUN: matriz completa com arquivos PSD/PNG reais, salvar/reabrir AEP, Undo/Redo via painel e todas as operações auxiliares no host. As medições nativas acima não equivalem à homologação integral do MD.
- O resultado do comando informa `referenceProjectionCheck: not-run`: a medição de projeção está no teste nativo, não no executor de produção.

## Espaçamentos

A regra genérica de botões compactos (`flex-basis:100%`) fazia cada categoria ocupar uma linha. Os botões de ícone agora têm base fixa, sem margens herdadas. Margens menores em painéis estreitos/baixos, navegação inteira em 280 px e uso da largura disponível nos painéis largos. Abaixo de 300 px de altura o corpo permite rolagem para manter todos os controles acessíveis. Mesmos elementos, ordem, cores, ícones e estrutura.

Matriz com o bundle real e bridge simulada em iframe, inspecionada no navegador:

| Tamanho CSS | Resultado | Categorias | Área de ferramentas |
|---|---|---|---|
| 280 × 640 | PASS | 37 px | 360 px |
| 320 × 420 | PASS | 34 px | 167 px |
| 384 × 600 | PASS | 40 px | 308 px |
| 640 × 360 | PASS | 34 px | 107 px |
| 800 × 500 | PASS | 40 px | 208 px |
| 280 × 260 | PASS | 34 px | 64 px |

Todas mantêm 48 ferramentas, navegação visível e separação entre ferramentas e âncora. Prévia reproduzível: `artifacts/layout/index.html` servida na raiz do projeto. A matriz valida apresentação; não simula uma execução real do After Effects.
