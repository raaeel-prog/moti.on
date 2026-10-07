# Impacto e tremor — plano

1. Sondar no AE 26.5 os parâmetros de Wave Warp, Glow, Exposure e Transform, identidade em valor neutro e motion blur próprio do Transform com as chaves da comp desligadas.
2. Estender `cameraSpec` com `impact` e escrever `cameraImpactSample` em ES3, compartilhada entre expressões e prévia.
3. Dez receitas em `motion-library-camera.ts`; ids no schema `cameraTransitionArgs`.
4. Host: `impactEffects`/`configureImpact` em `preset-camera-transition.jsx`, só com efeitos usados; ajuste, bake e remoção continuam genéricos.
5. Prévia e filtro "Impacto e tremor" na galeria.
6. Testes de matemática, catálogo, host (paridade), prévia e galeria; renders reais com análise de bordas e identidade; capturas do painel em 280/360/480/720 px.

Decisões do usuário: apenas efeitos nativos do AE (sem o motor C++) e um filtro próprio na galeria. Linha de base: 2.127/2.132, com 5 falhas anteriores (`artifacts/impact-shake-20261006/baseline-tests.log`). Sem Git nesta pasta.
