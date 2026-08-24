# Moti.on

Suíte de motion design que atua no **Premiere Pro** e no **After Effects**, respeitando o runtime atual de cada aplicativo.

> **Estado:** fase P0 (fundação), sobre a base `0.1.0`. Nenhum recurso de animação foi implementado ainda. O que existe hoje é a base carregável nos dois hosts, descrita abaixo. O plano completo está em [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md); o histórico do ponto de partida em [`docs/BASELINE_STARTER_0.1.0.md`](docs/BASELINE_STARTER_0.1.0.md).

## O que existe hoje

A fundação da fase P0: a ponte painel↔host, o contrato de comandos e a sonda de capacidades. **Nenhum recurso de motion design foi implementado ainda** — as ~50 operações do catálogo começam na fase P1.

### Fundação compartilhada

- **Contrato de comandos v1** (`packages/contracts`): `CommandRequest`/`CommandResponse` com `requestId`, `warnings` e `timing`, e os 22 códigos de erro como união fechada em nível de tipo.
- **Escape para `evalScript`** com saída sempre ASCII imprimível, coberto por 13 testes e um fuzz semeado. É a única função que impede injeção de código dentro do After Effects, e existe uma cópia só dela.
- **Matriz de capacidades** (`packages/capability-matrix`) sondada por presença de símbolo, nunca por comparação de versão. Uma sonda que não conclui reporta `unknown`, não `false`.
- **Registro de comandos** (`packages/command-registry`) onde o descriptor declara se o comando muta, se é destrutivo e qual o rótulo de Undo — separado de onde ele é implementado.

### After Effects — CEP + ExtendScript

- painel carrega e lê projeto, item ativo, composição, resolução, duração e frame rate;
- **`MotionAE.dispatch` é o único ponto de entrada**; nenhum comando é chamado por nome através do `evalScript`;
- cria uma composição de teste agrupada num único `Undo Group`;
- **Verificar ponte com o host**: envia acento, japonês, emoji e aspas, e confere a volta — o único jeito de saber se o transporte preserva os bytes naquela máquina;
- **Verificar sistema**: mostra tier de suporte, motor de expressões e uma linha por capacidade, cada ausência com motivo.

### Premiere Pro — UXP

- painel carrega e lê projeto, sequência ativa, contagem de sequências e trilhas;
- **fronteira de transação** com `lockedAccess` envolvendo `executeTransaction`, conforme a referência oficial da Adobe, com as regras de lint oficiais ativas e verificadas;
- autoteste e sonda de capacidades;
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
apps/after-effects-cep/          extensão do After Effects (CEP 12)
  client/                        painel HTML/JS
  host/src/                      camada ExtendScript, ES5 escrito à mão
  host/types/                    declarações de tipo do ExtendScript
packages/contracts/legacy/       envelope de resposta compartilhado (UMD)
packages/ui-core/src/            CSS e componentes da apresentação
scripts/                         build, validação, scanner ES5, instalação dev
tests/                           testes automatizados
dist/                            artefatos carregáveis nos hosts (derivado)
```

Os diretórios `native/`, `services/`, `presets/` e `installers/` que o master spec §7 prevê ainda **não existem**, e nem os outros packages que ele lista. Eles nascem na issue CHMS que primeiro precisa deles — a tabela está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Criá-los vazios agora seria exatamente o esqueleto de placeholders que a §0.5 proíbe.

## Estado de validação

`npm run check` executa lint, typecheck, build, validação de manifests e permissões, 145 testes e a validação do pacote de skills.

**Isso não prova que o plugin funciona.** Prova que a lógica está correta e que os contratos batem entre si. Não prova que o painel carrega no After Effects, que o Undo agrupa numa entrada só, nem que os bytes atravessam o `evalScript` intactos — só o aplicativo real responde isso.

O que está e o que não está verificado em host real está em [`docs/HOST_LIMITATIONS.md`](docs/HOST_LIMITATIONS.md), item a item. [`docs/INSTALLATION.md`](docs/INSTALLATION.md) traz o roteiro que fecha vários deles numa única sessão dentro dos aplicativos.

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

Concluído da fase P0: CHMS-001 a CHMS-006. Falta, ainda dentro do P0:

- **CHMS-007** — logger estruturado com redaction. Hoje não existe logger: mensagens de diagnóstico vão para a caixa de log do painel. A §25 proíbe registrar nome e caminho de projeto, e é essa camada que garante.
- **CHMS-008** — shell de UI: tokens canônicos `#1D1D1D`, navegação, i18n pt-BR/en-US, comportamento responsivo em 280/360/480/720 px e a view Settings → System Check. Os painéis atuais ainda são o layout do starter.

Depois disso começam as features da P1. O plano completo está em [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md); as decisões de arquitetura tomadas até aqui estão em [`docs/adr/`](docs/adr/).

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
