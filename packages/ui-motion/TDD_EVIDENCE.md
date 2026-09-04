# CHMS-UX-002 — evidência TDD

Data: 2026-09-02

## RED

- `node --test "packages/ui-motion/tests/*.test.mjs"`
- Resultado inicial: `0/10`; o package compilado, a folha CSS, a fiação dos
  hosts e as novas chaves de idioma ainda não existiam.
- Após a primeira integração, o teste normativo de localização detectou que o
  toggle estava em Sistema em vez de **Settings → Interface**: `2/3` passaram.
- A auditoria seguinte tornou obrigatório um fallback explícito por item e por
  fonte da preferência; o CSS genérico anterior deixou `css.test.mjs` em `4/5`.
- A nova view também foi adicionada ao gate de iconografia; antes do glifo
  próprio, o teste dirigido ficou em `1/2` e identificou `settings` como fallback.

## GREEN

- `node --experimental-test-coverage --test "packages/ui-motion/tests/*.test.mjs"`
- Resultado: `20/20 PASS`.
- Cobertura: `100 %` linhas, `100 %` funções e `97,78 %` branches.
- `npm.cmd run build`: `PASS`; clientes AE/CEP e Premiere/UXP gerados.
- `ui-core` focado: `57/57 PASS`; `ui-tokens`: `5/5 PASS`.

## Jornadas cobertas

- catálogo A6.2 com exatamente 25 entradas e ordem estável;
- proibição de layout animado, `transition: all` e duração literal no CSS;
- preferência persistida sem preferência do sistema;
- regra efetiva `internal OR system`;
- storage indisponível, falha de escrita, getter hostil e `matchMedia` ausente;
- listeners moderno e legado removidos, inclusive `dispose` idempotente;
- view Settings, toggle e descarte do controller nos dois clientes;
- concatenação de `motion.css` ao tema entregue aos dois hosts.

## Limite da prova

Nenhum teste deste arquivo executa dentro do After Effects ou Premiere Pro.
Render visual, persistência após reiniciar o host, propagação real de
`matchMedia`, acessibilidade e frames perdidos permanecem `NOT RUN`.

## Gate integrado no worktree concorrente

- `npm.cmd run check`: `PASS`, com `841/841` testes nessa invocação.
- Lint, typecheck, build, validação, 68 pares de contraste e validação das
  skills também passaram nessa mesma invocação.
- Durante a concorrência, o gate detectou uma colisão do glifo Settings e quatro
  comandos Parallax escondidos atrás de despacho dinâmico. O glifo ganhou
  fallback único; os comandos passaram a usar branches literais com payloads
  exatos, sem afrouxar o teste nem criar allowlist falsa.
