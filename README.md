# Moti.on

Suíte de motion design projetada para **Premiere Pro** e **After Effects**, respeitando o runtime de cada aplicativo.

> **Estado:** fase P0 (fundação), sobre a base `0.1.0`. CHMS-001 a CHMS-008 estão implementados; o shell atual passou por smoke test no After Effects 26.3x87/CEP 12.0.1/Windows 11, mas o fechamento do P0 ainda depende do Premiere real e da matriz Adobe restante. O núcleo puro do CHMS-009 está concluído e verificado automaticamente; integração com `Layer.comment`, filesystem e Undo real continua `NOT RUN`. Nenhum recurso visual de animação foi implementado. O plano completo está em [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md); o histórico do ponto de partida em [`docs/BASELINE_STARTER_0.1.0.md`](docs/BASELINE_STARTER_0.1.0.md).

## O que existe hoje

A fundação da fase P0: ponte painel↔host, contrato e registro de comandos, matriz de capacidades, logging com redaction e shell compartilhado. **Nenhum recurso de motion design foi implementado ainda** — as operações do catálogo começam na fase P1.

### Fundação compartilhada

- **Contrato de comandos v1** (`packages/contracts`): `CommandRequest`/`CommandResponse` com `requestId`, `warnings` e `timing`, os 22 códigos de erro como união fechada e quatro JSON Schemas Draft 2020-12 versionados.
- **Validação CSP-safe**: Ajv 8 existe somente como dependência de desenvolvimento para validar schemas e gerar funções standalone; o runtime usa guards profundos sem `eval`, `Function`, `require` ou import do Ajv.
- **Escape para `evalScript`** com saída sempre ASCII imprimível e fuzz semeado. As únicas rotas autorizadas a gerar código para esse canal ficam em `packages/contracts/src/evalscript.ts`.
- **Matriz de capacidades** (`packages/capability-matrix`) com disponibilidade de feature sondada por presença de símbolo; a versão rotula o tier, não libera recurso sozinha. Uma sonda que não conclui reporta `unknown`, não `false`.
- **Registro de comandos** (`packages/command-registry`) onde o descriptor declara se o comando muta, se é destrutivo e qual o rótulo de Undo — separado de onde ele é implementado.
- **Logging estruturado** (`packages/logging`) com redaction na escrita, rotação por contagem e bytes UTF-8, bundle de suporte e modo debug temporário. Payload arbitrário vindo do host não é persistido nem no modo debug.
- **Shell compartilhado** (`packages/ui-core`) com tokens sobre `#1D1D1D`, i18n pt-BR/en-US, navegação acessível e modos de largura para 280/360/480/720 px.
- **Metadata de rigs** (`packages/rig-metadata`): create/read/update/remove/migrate em domínio puro, JSON canônico, base64url, SHA-256 e plano de sidecar sem fazer I/O.

### After Effects — CEP + ExtendScript

Implementado no código. Em **2026-08-25**, este build foi exercitado no After Effects **26.3x87**, CEP **12.0.1**, Windows 11: inicialização limpa sem modal, estado ocioso da verificação de sistema, contexto, capability probe, round-trip Unicode, criação da composição de teste, rótulo de Undo em pt-BR e Undo em um passo passaram. A matriz AE 25.x/macOS e os gates visuais completos continuam `NOT RUN`.

- painel carrega e lê projeto, item ativo, composição, resolução, duração e frame rate;
- **`MotionAE.dispatch` é o único ponto de entrada**; nenhum comando é chamado por nome através do `evalScript`;
- cria uma composição de teste agrupada num único `Undo Group`;
- **Verificar ponte com o host**: envia acento, japonês, emoji e aspas, e confere a volta — o único jeito de saber se o transporte preserva os bytes naquela máquina;
- **Verificar sistema**: mostra tier de suporte, motor de expressões e uma linha por capacidade, cada ausência com motivo;
- pedidos cujo JSON codificado ultrapassa 60.000 caracteres falham fechados antes do `evalScript`; o transporte alternativo por arquivo temporário ainda não foi implementado.

### Premiere Pro — UXP

Implementado no código; execução deste build no host real: `NOT RUN`.

- painel carrega e lê projeto, sequência ativa, contagem de sequências e trilhas;
- **fronteira de transação** com `lockedAccess` envolvendo `executeTransaction`, conforme a referência oficial da Adobe, com as regras de lint cobertas por teste; a execução real da transação continua `NOT RUN`;
- autoteste e sonda de capacidades;
- leitura de versão e locale por `require("uxp").host.version`/`.uiLocale`, com `unknown` honesto quando o runtime não informa;
- exportação explícita do bundle de diagnóstico pelo picker do UXP, sem registrar caminho nativo;
- permissões mínimas no manifest: só `localFileSystem: "request"`.

## Por que existem dois shells

O Premiere Pro possui UXP oficial a partir da versão 25.6. O After Effects continua expondo sua automação por scripts/painéis e seu SDK nativo. Portanto, o desenho mais sustentável é compartilhar regras e interface sempre que possível, mas manter adapters específicos por host.

## Requisitos

- Node.js 18 ou posterior para build e validação;
- Premiere Pro 25.6+;
- UXP Developer Tool 2.2+;
- After Effects 25.0+ com CEP 12.

## Primeiro uso

```bash
npm run check
```

Depois siga `docs/INSTALLATION.md`. As decisões técnicas e fontes oficiais estão em `docs/ARCHITECTURE.md` e `docs/OFFICIAL-REFERENCES.md`.

## Estrutura

npm workspaces. `apps/*` são os shells que carregam dentro de cada aplicativo Adobe; `packages/*` é o código compartilhado entre eles.

```text
apps/premiere-uxp/               plugin do Premiere Pro (UXP)
  client/src/                    shell e fronteira com o runtime UXP
  host/src/                      adapter e comandos da API `premierepro`
apps/after-effects-cep/          extensão do After Effects (CEP 12)
  client/src/                    shell CEP e adapter `CSInterface`
  host/src/                      camada ExtendScript, ES5 escrito à mão
  host/types/                    declarações de tipo do ExtendScript
packages/contracts/legacy/       compatibilidade UMD com o envelope legado
packages/contracts/src/          protocolo v1, erros, capabilities e evalScript seguro
packages/contracts/schemas/      quatro JSON Schemas Draft 2020-12 v1
packages/command-registry/       descriptors allowlisted e cliente de comandos
packages/capability-matrix/      probes, tiers e cache de sessão
packages/logging/                logger, redaction, rotação e bundle de suporte
packages/rig-metadata/           metadata canônica, migração e planos de sidecar
packages/test-fixtures/          doubles de host reutilizáveis
packages/ui-core/                shell, CSS, tokens, componentes e i18n
scripts/                         build, validação, scanner ES5, instalação dev
tests/                           testes automatizados
dist/                            artefatos carregáveis nos hosts (derivado)
```

Os diretórios `native/`, `services/`, `presets/` e `installers/` e os packages das fases seguintes ainda **não existem**. Eles nascem na issue CHMS que primeiro precisa deles — a tabela está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Criá-los vazios agora seria exatamente o esqueleto de placeholders que a §0.5 proíbe.

## Estado de validação

`npm run check` executa lint, typecheck, build, validação de manifests e permissões, testes automatizados e a validação do pacote de skills. Em **2026-08-25**, no branch `Codex`, o gate final antes do commit terminou com `PASS`: lint, typecheck, build, validate, **326/326 testes** e skills validate. Um snapshot anterior deste mesmo ciclo havia passado com **319/319 testes** antes do hardening final do bootstrap AE.

**Isso não prova que o plugin funciona.** Um `PASS` comprova somente que os checks automatizados daquele worktree terminaram sem falha. Não prova que o painel carrega no After Effects, que o Undo agrupa numa entrada só, que o picker do Premiere grava, nem que os bytes atravessam o `evalScript` intactos — só o aplicativo real responde isso.

O que está e o que não está verificado em host real está em [`docs/HOST_LIMITATIONS.md`](docs/HOST_LIMITATIONS.md), item a item. [`docs/INSTALLATION.md`](docs/INSTALLATION.md) traz o roteiro que fecha vários deles numa única sessão dentro dos aplicativos.

O ponto exato de continuidade deste ciclo está em [`docs/HANDOFF_CODEX_2026-08-25.md`](docs/HANDOFF_CODEX_2026-08-25.md).

## Pendente antes de publicar

Os identificadores já são definitivos — `com.motion.plugin.premiere` e `com.motion.plugin.ae.panel`, registrados em [`docs/adr/0001-marca-e-namespace.md`](docs/adr/0001-marca-e-namespace.md) — e `npm run validate` falha se um placeholder voltar. Continua pendente:

1. ícones e identidade visual;
2. o fluxo real do produto (fases P1 a P6 do master spec);
3. licença comercial, assinatura de código, distribuição e matriz de QA;
4. teste dentro das versões reais do Premiere e do After Effects, em Windows e macOS.

O item 4 não é formalidade: nenhum recurso dependente de host pode ser declarado concluído sem execução no aplicativo real. O que está implementado mas ainda não foi verificado num host fica marcado `IMPLEMENTED_NOT_HOST_VERIFIED`.

## Comandos

```bash
npm run lint       # ESLint + scanner do subconjunto ExtendScript
npm run typecheck  # tsc -b, inclui checkJs sobre o host ExtendScript
npm run build      # gera dist/
npm run validate   # valida manifests, arquivos e sintaxe
npm test           # executa testes unitários
npm run check      # lint + typecheck + build + validate + testes + skills
```

## Próxima etapa de desenvolvimento

CHMS-001 a CHMS-008 têm implementação e evidência automatizada no worktree, e o shell AE já possui smoke real em uma combinação de host. Antes de considerar o P0 fechado, ainda é preciso:

1. carregar **este build** no Premiere Pro com o UXP Developer Tool;
2. completar no AE e no Premiere os roteiros ainda abertos de exportação, largura/DPI, foco, acessibilidade, outras versões e macOS descritos em [`docs/INSTALLATION.md`](docs/INSTALLATION.md);
3. registrar cada resultado como `PASS`, `FAIL` ou `NOT RUN` em [`docs/HOST_LIMITATIONS.md`](docs/HOST_LIMITATIONS.md) e [`docs/VERIFICATION_GATES.md`](docs/VERIFICATION_GATES.md).

Até esses passos, o P0 não está fechado para a matriz declarada. O shell e o adapter AE estão verificados somente no ambiente acima; Premiere, exportação e a matriz visual completa permanecem `IMPLEMENTED_NOT_HOST_VERIFIED`. O núcleo puro do CHMS-009 está concluído, mas ainda faltam o adapter do After Effects, persistência sidecar e prova de Undo/host. O plano completo está em [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md); as decisões de arquitetura tomadas até aqui estão em [`docs/adr/`](docs/adr/).

## Master implementation specification

The production implementation plan is in [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md). Claude Code should also read `CLAUDE.md`; Codex and other coding agents should read `AGENTS.md`.

## Agent Skills v2.0.0

Este repositório inclui **14 skills repo-local** para Claude Code, Codex e agentes compatíveis, com cópia canônica em `.agents/skills/` e espelho em `.claude/skills/`.

O pacote cobre orquestração, pesquisa de capacidades Adobe, design workstation minimalista, UI CEP/UXP, After Effects, Premiere Pro, motion rigs, assets, AI Captions/SFX, núcleo nativo C++/ML, testes, segurança, performance e release.

```bash
npm run skills:sync
npm run skills:validate
npm run check
```

Pontos de entrada:

- `docs/AGENT_SKILLS_GUIDE.md`
- `docs/UI_FOUNDATION.md`
- `docs/MULTI_AGENT_ROLES.md`
- `docs/VERIFICATION_GATES.md`
- `skills-manifest.json`
- `.agents/skills/orchestrating-crosshost-work/SKILL.md`

A direção visual é fixa: base `#1D1D1D`, uma tarefa dominante por tela, property rows compactas e progressive disclosure. Recursos dependentes do host permanecem `IMPLEMENTED_NOT_HOST_VERIFIED` até serem executados em uma instalação real do After Effects ou Premiere Pro.
