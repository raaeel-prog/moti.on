# Bootstrap ExtendScript no painel CEP do After Effects

**Question:** O painel deve carregar `host/index.jsx` automaticamente por
`<ScriptPath>` ou explicitamente pelo client CEP com
`CSInterface.evalScript("$.evalFile(...)")`?

**Decision date:** 2026-08-25

**Target host/version:** After Effects 26.3 (AEFT 26.3), CEP 12.0.1, Windows 11

**Status:** partial

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---:|---|---|
| O CEP documenta duas abordagens para carregar JSX: `ScriptPath` no manifest ou `evalScript` chamando `$.evalFile`. | `<ScriptPath>`; `CSInterface.evalScript`; `$.evalFile` | Documentado no CEP 9 | [Adobe CEP 9 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_9.x/Documentation/CEP%209.0%20HTML%20Extension%20Cookbook.md#load-multiple-jsx-files) | As abordagens são alternativas; não é necessário declarar ambas. |
| `ScriptPath` é opcional dentro de `Resources`. | `xs:element name="ScriptPath" minOccurs="0"` | Extension Manifest schema 6.0 | [XSD oficial no repositório Adobe CEP](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_7.x/ExtensionManifest_v_6_0.xsd#L230-L249) | O Cookbook CEP 9 informa que os elementos do XSD não mudaram desde o CEP 7. |
| Um sample oficial monta o caminho absoluto do JSX e o carrega com `evalScript("$.evalFile(...)")`. | `getSystemPath(SystemPath.EXTENSION)`; `$.evalFile` | CEP 8 sample | [Adobe CEP HTML Test Extension](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_8.x/Samples/CEP_HTML_Test_Extension-8.0/html/CSAPI.html#L589-L605) | Corrobora o mecanismo já usado pelo adapter do projeto. |
| No host-alvo real, `ScriptPath` e o bootstrap explícito tiveram resultados diferentes sobre o mesmo `host/index.jsx`. | `<ScriptPath>`: `FAIL`; `$.evalFile`: `PASS` | AE 26.3 / CEP 12.0.1 | Execução local registrada em 2026-08-25 | `ScriptPath` abriu o modal "Não é possível executar o script na linha 1. Erro de sintaxe". Depois de fechar o modal, o adapter carregou o mesmo arquivo por `$.evalFile`; `ae.context.read` e `ae.demo.createComposition` passaram, e Undo removeu a composição. |
| A remoção de `ScriptPath` elimina o modal sem perder o host. | Manifest sem `ScriptPath`; bootstrap explícito | AE 26.3x87 / CEP 12.0.1 | Execução local do build Moti.on em 2026-08-25 | Depois de build, reinstalação e reinício limpo, o painel abriu sem modal, mostrou `Conectado` e passou em contexto, capabilities e round-trip Unicode. |
| O locale CEP pode usar underscore, embora os catálogos usem BCP 47. | `appUILocale = "pt_BR"`; normalização para `pt-BR` | AE 26.3x87 / CEP 12.0.1 | Execução local do build Moti.on em 2026-08-25 | A primeira inspeção exibiu Undo em inglês. Após normalizar underscore, caixa e fallback por idioma, `Edit > Undo` mostrou `Desfazer Moti.on: criar composição de teste`. |

## Implementation decision

Remover `<ScriptPath>` do manifest CEP e manter uma única estratégia de
bootstrap: o adapter resolve o diretório da extensão com
`getSystemPath(SystemPath.EXTENSION)`, monta um caminho absoluto para
`host/index.jsx` e o carrega por `CSInterface.evalScript` + `$.evalFile`. Cada
instância nova do adapter carrega obrigatoriamente o arquivo atual uma vez,
impedindo que um `MotionAE.dispatch` antigo, preservado no `$.global`, seja
aceito após update/reload do painel. Chamadas concorrentes aguardam o mesmo
bootstrap single-flight em vez de avaliar o arquivo duas vezes.

O manifest continua declarando somente o `MainPath` do painel. Validação e
testes impedem simultaneamente a volta de `ScriptPath` e a remoção acidental do
bootstrap explícito no bundle.

## Fallback

Se `$.evalFile` não carregar ou não registrar `MotionAE.dispatch`, o adapter
falha fechado com `HOST_BOOTSTRAP_FAILED`, orienta reinstalar a extensão e
reabrir o painel, e não despacha a mutação. Não voltar automaticamente para
`ScriptPath`, pois esse caminho produziu um modal bloqueante no host medido.

## Capability flag

`after-effects.hostBootstrap.explicitEvalFile`

- `supported` quando a sonda retorna que `MotionAE.dispatch` é função depois do
  `$.evalFile`;
- `unavailable` quando o caminho da extensão não pode ser resolvido, o arquivo
  não pode ser avaliado ou o dispatcher não é registrado;
- o status depende da sonda em runtime, não apenas da versão do After Effects.

## Tests needed

- `PASS` automatizado — manifest fonte e artefato de build sem `<ScriptPath>`;
- `PASS` automatizado — bundle do client contendo o bootstrap explícito por
  `$.evalFile`;
- `PASS` automatizado — carga inicial obrigatória, single-flight, falha fechada,
  reset do engine e retry somente de comando de leitura;
- `PASS` host — abrir/reabrir o painel sem modal, executar `ae.context.read`,
  capability probe e round-trip Unicode no AE 26.3x87/Windows 11;
- `PASS` host — criar a composição de demonstração e verificar Undo em um passo;
- `PASS` host — confirmar o rótulo de Undo pt-BR após normalização de `pt_BR`;
- `NOT RUN` — repetir no After Effects 25.x suportado e no último 26.x/macOS
  antes de promover a matriz completa para `supported`.

## Open uncertainty

A causa interna de o CEP 12.0.1/AE 26.3 rejeitar esse bundle quando carregado
por `ScriptPath`, mas aceitar o mesmo arquivo por `$.evalFile`, não está
documentada pela Adobe. A decisão não depende dessa explicação: o mecanismo
escolhido é oficial, compatível com o esquema e passou no host-alvo medido. A
cobertura no After Effects 25.x permanece pendente.
