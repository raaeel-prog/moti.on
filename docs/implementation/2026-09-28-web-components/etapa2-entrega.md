# Web Components — etapa 2: Sistema e Diagnóstico

Data: 29/09/2026. Status: `IMPLEMENTED_NOT_HOST_VERIFIED`.

As quatro telas de suporte (Sistema e Diagnóstico em AE e Premiere) agora usam
o botão nativo `moti-button` através de uma barra compartilhada. A reescrita
remove a apresentação duplicada dos arquivos principais e preserva os comandos,
mensagens, idiomas, dados de diagnóstico e executores de cada host.

## Implementação

- `packages/ui-core/src/panel-action-bar.ts`: compõe `createActionButton`, mantém
  o fallback por capacidade e confere `canPress` a cada ativação. Depois de
  `dispose`, referências antigas não executam comandos.
- `packages/ui-core/src/diagnostics-view.ts`: snapshot somente de leitura, logs
  mais recentes primeiro, duração zero, nível, erro, descartados e estado vazio.
  Exportar, limpar e alternar debug são callbacks do app; não há acesso a logger,
  arquivo, clipboard ou Adobe neste módulo.
- `apps/after-effects-cep/client/src/views/system-view.ts` e equivalente no
  Premiere: apresentação de capabilities e resultados separada dos executores.
  Preservados tier, versão desconhecida, motivos, autoteste localizado e estado
  inicial que não finge uma verificação em andamento.
- Integração em ambos os `main.ts`: descarte antes de redesenhar/navegar e no
  encerramento. `canPress` confere busy atual; exportação do Premiere conserva
  picker, tratamento de cancelamento e tickets do request-scope existentes.
- `shell.ts`: restaura foco após redesenho na região original (conteúdo ou ações),
  inclusive para botões recriados. Navegar para outra tela não reaproveita essa
  chave; uma chave coincidente no conteúdo não rouba o foco do rodapé.
- CSS usa margens na barra para conservar compatibilidade do kit. A barra ocupa
  linhas adicionais conforme espaço/idioma; motivos de indisponibilidade ficam
  acima das ações, dentro da largura disponível.
- AE: notificações usam a altura medida do rodapé e acompanham resize; o
  observador é detectado por capacidade e descartado junto da view. Assim uma
  notificação não cobre as ações quando elas quebram linha.
- Premiere: overflow das abas fica dentro da navegação. Focar Diagnóstico em
  português a 360 px não desloca o `root` inteiro horizontalmente.

Continuam fora desta fatia os demais usos de `shell.button`, sliders, menus,
editores e comandos de projeto. Não foram removidos builders ainda consumidos.

## Verificação

| Verificação | Resultado |
|---|---|
| Build AE + Premiere | PASS |
| Typecheck | PASS |
| Lint dos módulos novos, integração Premiere e testes alterados | PASS |
| `npm run check`, antes e depois | FAIL: mesmos 4 erros globais de lint |
| Validação estrutural/sintática | PASS |
| Subconjunto ExtendScript | PASS: 77 arquivos |
| Contraste | PASS: 88 pares |
| Skills e mirror | PASS: 14 skills, 31 arquivos e 42 rotas |
| Testes focados | PASS: 151/151 |
| Suíte geral | FAIL: 1700/1749; 49 falhas |
| Chromium com bundles de produção e fronteiras Adobe simuladas | PASS: 93/93 |
| Adobe AE/CEP real | NOT RUN |
| Adobe Premiere/UXP real | NOT RUN |
| Leitor de tela, escalas adicionais e performance | NOT RUN |

Os 151 testes cobrem shell, componentes, moti-button, diagnostics-view, fronteira
de erros AE, fluxos de suporte AE, runtime Premiere, request-scope e lifetime
assíncrono do painel. Incluem navegação/destruição durante requests, cliques em
referências descartadas, teclado, recuperação de falha/cancelamento, dados de
exportação e mensagens que não expõem detalhes privados.

Os quatro erros globais reproduzidos no baseline desta etapa são dois `any` em
`host-adapter.ts`, um `any` no trecho de sincronização de tema do `main.ts` do AE
e a variável não usada `MotionJson` em `text-vertical-pulse.test.mjs`.
A lista nominal das 49 falhas da suíte geral é idêntica à registrada na etapa 1;
nenhum teste novo desta etapa falhou. Não foi feita uma execução completa com
checkout anterior: a comparação usa os logs preservados, não uma nova baseline.

### Navegador e revisão visual

Chromium real, bundles gerados com HTML/CSS/JS de produção. Apenas a fronteira
CEP/UXP é simulada: sem projeto Adobe, picker, clipboard ou gravação reais.
Versão, horário e hashes dos bundles estão no JSON da evidência.

Ações dos dois hosts verificadas por clique, Enter e Espaço, com despacho único;
callbacks de render anterior descartados; busy e export indisponível explicados;
exportação/limpeza/debug, foco e concorrência com `panel.show` preservados.

Matriz: 2 hosts × 2 telas × 2 idiomas × 2 temas × 4 larguras
(280/360/480/720 px), com 64 capturas mais uma de indisponibilidade com foco.
Geometria confere botões e rótulos dentro da viewport, conteúdo visível e
nenhum deslocamento horizontal do painel. Capturas aguardam a animação de entrada
para não registrar o primeiro frame transparente. Amostras representativas de
ambos os hosts/temas foram inspecionadas visualmente.

A verificação encontrou e corrigiu dois problemas concretos: toast do AE sobre
botões após conclusão e deslocamento horizontal do Premiere provocado por abas
longas. Os testes agora conferem os alvos de clique após a notificação e a posição
do painel depois da navegação.

## Evidência e reversão

Pasta: `artifacts/web-components-stage2/`.

- `source-before/`: fontes anteriores, incluindo shell e CSS; workspace sem Git.
- `changes.diff`: revisão consolidada das mudanças desta etapa.
- `build.log`, `typecheck.log`, `validate.log`, `scoped-tests.log`, `tests.log`,
  `final-check.log`, `baseline-check.log` e demais logs de gates.
- `tests-summary.txt`: contagens e comparação nominal das falhas.
- `verify-panels.mjs`: verificação reproduzível com as fronteiras simuladas.
- `browser-panels-results.json` e `.md`: resultado final e hashes.
- PNGs por host/tela/idioma/tema/largura. `failure-*.png` e
  `browser-panels-initial.json` são evidências intermediárias dos problemas
  encontrados, não o resultado final.

Reversão do produto: restaurar os arquivos de `source-before/` e remover somente
os novos módulos listados no diff; compilar novamente. Testes e documentação
novos podem ser mantidos como histórico ou retirados junto da etapa.

## Próxima verificação no host

Abrir o build nos dois aplicativos Adobe e verificar Sistema/Diagnóstico em
português e inglês: clique/Enter/Espaço, operação pendente, motivo por foco,
exportação/cancelamento, debug/limpeza, redimensionamento e fechamento/reabertura.
Conferir fallback quando o runtime não expõe Custom Elements. Registrar versões
e evidências antes de declarar esta migração pronta para distribuição.

```text
VERIFICATION REPORT
Build:             PASS
Static validation: PASS
Types/Lint:        FAIL — types PASS; 4 erros globais anteriores
Unit/contract:     PASS 151/151 no recorte; suite geral FAIL 1700/1749
Browser:           PASS 93/93, 65 capturas
AE host:           NOT RUN
Premiere host:     NOT RUN
Performance:       NOT MEASURED
Packaging:         NOT APPLICABLE
Overall:           IMPLEMENTED_NOT_HOST_VERIFIED
```
