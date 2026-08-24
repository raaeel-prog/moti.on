# Adobe CrossHost Plugin Starter

Base funcional para um produto que atua no **Premiere Pro** e no **After Effects**, respeitando o runtime atual de cada aplicativo.

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

```text
src/shared/                 código e tema compartilhados
src/premiere-uxp/           plugin do Premiere Pro
src/after-effects-cep/      extensão do After Effects
scripts/                    build, validação e instalação de desenvolvimento
tests/                      testes automatizados
dist/                       artefatos carregáveis nos hosts
```

## Estado de validação

O comando `npm run check` executa build limpo, validação dos manifests, verificação sintática e testes unitários. A validação final de um plugin Adobe exige também carregamento e teste dentro dos aplicativos-alvo; este repositório não substitui essa etapa de QA.

## Personalização obrigatória

Antes de publicar:

1. troque os IDs `com.example...` por um namespace próprio;
2. defina nome, marca, ícones e versão;
3. implemente o fluxo real do produto;
4. adicione licença, assinatura, distribuição e matriz de QA;
5. teste dentro das versões reais do Premiere e do After Effects em Windows e macOS.

## Comandos

```bash
npm run build      # gera dist/
npm run validate   # valida manifests, arquivos e sintaxe
npm test           # executa testes unitários
npm run check      # build + validação + testes
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
