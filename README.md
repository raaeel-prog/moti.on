# Moti.on

Suíte de motion design que atua no **Premiere Pro** e no **After Effects**, respeitando o runtime atual de cada aplicativo.

> **Estado:** fase P0 (fundação), sobre a base `0.1.0`. Nenhum recurso de animação foi implementado ainda. O que existe hoje é a base carregável nos dois hosts, descrita abaixo. O plano completo está em [`docs/MASTER_BUILD_SPEC.md`](docs/MASTER_BUILD_SPEC.md); o histórico do ponto de partida em [`docs/BASELINE_STARTER_0.1.0.md`](docs/BASELINE_STARTER_0.1.0.md).

## O que já funciona

### Premiere Pro — UXP

- carrega como painel UXP;
- lê o projeto ativo;
- lê a sequência ativa;
- conta sequências e trilhas de vídeo/áudio;
- possui autoteste e tratamento de erros.

### After Effects — CEP + ExtendScript

- carrega como painel CEP;
- lê projeto e item ativo;
- identifica composição, resolução, duração e frame rate;
- cria uma composição de teste com texto;
- agrupa a alteração em um único `Undo Group`.

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

O comando `npm run check` executa build limpo, validação dos manifests, verificação sintática e testes unitários. A validação final de um plugin Adobe exige também carregamento e teste dentro dos aplicativos-alvo; este repositório não substitui essa etapa de QA.

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

Use `docs/PRODUCT-SCOPE.md` para transformar a ideia em requisitos verificáveis. A partir disso, os adapters atuais podem receber as operações reais sem reescrever a fundação.

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
