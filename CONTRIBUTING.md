# Como contribuir com o Moti.on

Este guia descreve como o repositório é organizado no GitHub. Ele vale para pessoas e para agentes de código (veja também `AGENTS.md` e `CLAUDE.md`).

## Branches

| Prefixo | Uso | Exemplo |
|---|---|---|
| `feat/<tema>` | recurso novo | `feat/emulsion-transitions-pack-20261103` |
| `fix/<tema>` | correção | `fix/cep-dispose-beforeunload` |
| `docs/<tema>` | só documentação | `docs/compatibilidade-ae` |
| `chore/<tema>` | infraestrutura, build, CI, organização | `chore/repo-infra-20261120` |
| `ui/<recorte>` | recorte de interface em avaliação | `ui/help-settings` |
| `dev/<área>-<tema>` | trabalho em andamento de um dev | `dev/ferramentas-alinhar` |

- Datas vão no fim, no formato `AAAAMMDD`.
- Uma branch nasce da ponta atual da `main` e é rebaseada (ou recebe merge da `main`) antes do PR.
- Nunca abra PR de uma branch que contenha um commit `chore(wip): snapshot…`. Faça cherry-pick só dos commits úteis numa branch nova.

## Pull requests

1. Abra o PR contra `main` com um título no formato Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …).
2. Preencha o template: o que muda, arquivos-ônibus tocados, como foi testado e o estado no host.
3. A CI (`check` em Ubuntu e Windows, Node 22 e 24) precisa estar verde. Rode `npm run check` localmente antes.
4. Merge: **merge commit** para trens com histórico que vale preservar; **squash** para PRs de um assunto só.
5. Nada de force-push na `main`. A `main` é protegida: PR obrigatório, CI obrigatória, sem force-push e sem deleção.

### Arquivos-ônibus

Estes caminhos são editados por várias frentes ao mesmo tempo. Não renomeie nem mova sem avisar no título e no corpo do PR:

- `packages/command-registry/src/descriptors.ts`
- `apps/after-effects-cep/client/src/main.ts`
- `packages/ui-core/src/locales.ts`
- `scripts/build-extendscript.mjs`
- `apps/after-effects-cep/host/**` (inclui o gerado `host/generated/motion-library.jsx`)

## Estado no host

Um `npm run check` verde não prova que o painel funciona no After Effects ou no Premiere Pro. O que foi implementado mas ainda não foi visto no aplicativo real leva o rótulo `needs-host-verification` e o estado `IMPLEMENTED_NOT_HOST_VERIFIED` em `docs/HOST_LIMITATIONS.md`.

## Labels

| Label | Para quê |
|---|---|
| `bug` | algo quebrado |
| `enhancement` | melhoria ou recurso |
| `documentation` | documentação |
| `ui` | interface do painel, CSS, tokens |
| `host` | ExtendScript/JSX e integração com o After Effects |
| `tooling` | build, CI, scripts, Git |
| `qa` | testes e cobertura |
| `premiere` | painel UXP do Premiere Pro |
| `needs-host-verification` | implementado, falta prova no host real |

## Tags

- `vX.Y.Z` — releases (versão do painel After Effects em `apps/after-effects-cep/CSXS/manifest.xml` e `package.json`).
- `base/<nome>-AAAAMMDD` — marcos da `main`.
- `backup/<nome>-AAAAMMDD` — estados de segurança antes de operações grandes.
- `archive/<branch>` — branch encerrada, preservada antes de ser removida.

## Mídia e Git LFS

- Prévias de presets (`*.mp4`, `*.jpg`, `*.png`) ficam no Git normal e são declaradas como binário em `.gitattributes`. O conjunto atual tem cerca de 40 MB.
- Formatos pesados **novos** — `*.mov`, `*.wav`, `*.aif`, `*.aiff`, `*.flac`, `*.psd`, `*.aep`, `*.mxf` — entram por **Git LFS**. Rode `git lfs install` uma vez por máquina.
- Nenhum arquivo pode passar de 50 MB no Git normal (o GitHub recusa acima de 100 MB).
- O histórico existente **não** é migrado para LFS. `git lfs migrate`, `filter-repo` e qualquer reescrita de histórico exigem aprovação explícita do dono do repositório.
