# ADR 0001 — Marca, namespace e prefixos reservados

- **Status:** aceito
- **Data:** 2026-08-24
- **Issue:** CHMS-001b
- **Decidido com:** o proprietário do repositório

## Contexto

O repositório nasceu como `adobe-crosshost-plugin-starter`, um starter genérico. Todos os identificadores eram placeholders explícitos:

- `com.example.crosshosttoolkit` — bundle CEP
- `com.example.crosshosttoolkit.ae.panel` — painel After Effects
- `com.example.crosshosttoolkit.premiere` — plugin UXP
- `CrossHost Toolkit` — nome de produto exibido
- `CrossHostAE` — global do ExtendScript
- `CrossHostProtocol` — global UMD do protocolo

`README.md` e `docs/INSTALLATION.md` instruíam a trocá-los antes de publicar. `docs/MASTER_BUILD_SPEC.md` diz o mesmo no cabeçalho: *"O nome CrossHost Motion Suite e o código CHMS são temporários. Antes da publicação, substituir marca, namespace, ícones, domínio, identificadores e dados comerciais."*

A pergunta era **quando** trocar. A alternativa era manter os placeholders durante toda a fase P0 e renomear perto do release.

## Decisão

Trocar agora, no primeiro commit que toca código de produto, antes de qualquer arquitetura nova.

| Antigo | Novo |
|---|---|
| `com.example.crosshosttoolkit` | `com.motion.plugin` |
| `com.example.crosshosttoolkit.ae.panel` | `com.motion.plugin.ae.panel` |
| `com.example.crosshosttoolkit.premiere` | `com.motion.plugin.premiere` |
| `com.example.crosshosttoolkit.ae` (diretório de instalação) | `com.motion.plugin.ae` |
| `CrossHost Toolkit` | `Moti.on` |
| `CrossHostAE` | `MotionAE` |
| `CrossHostProtocol` | `MotionProtocol` |
| `adobe-crosshost-plugin-starter` (nome npm) | `motion-plugin` |

E reservar, para uso a partir do CHMS-009 e CHMS-011:

| Convenção | Valor |
|---|---|
| Bloco de metadata em comentário de layer | `[MOTION_META_V1]` … `[/MOTION_META_V1]` |
| Cabeçalho de expressão gerada | `// MOTION_EXPRESSION v1 \| <commandId>` |
| Prefixo de nome de layer de rig | `MOTION \| ` |

## Justificativa

**Renomear cedo é barato; renomear tarde não é.** Os identificadores não ficam apenas em manifests. A partir do CHMS-009 eles entram em dados que o usuário grava no próprio projeto: comentários de layer com metadata de rig, cabeçalhos de expressão, nomes de layers de controlador. Um projeto `.aep` salvo com `[CHMS_META_V1]` continuaria existindo na máquina do usuário depois da renomeação, e o plugin teria de reconhecer os dois marcadores para sempre. Trocar antes de qualquer rig existir elimina esse débito por completo.

**Os placeholders passavam por todos os gates.** `npm run check` estava verde com `com.example` em cinco arquivos. Pior: `tests/manifests.test.mjs` *afirmava* os placeholders por asserção, ou seja, o único teste que olhava para IDs travava os valores errados. Trocar agora permitiu inverter isso — hoje `scripts/validate.mjs` **falha** se `com.example` reaparecer em qualquer manifest.

**O nome já estava decidido de fato.** O diretório do projeto é `Moti.on` e o repositório é `github.com/raaeel-prog/moti.on`. Manter `CrossHost Toolkit` no código era divergência gratuita entre o que o projeto é e o que ele diz ser.

## Consequências

### Sem migração de dados, por opção deliberada

`[MOTION_META_V1]` **não** é retrocompatível com `[CHMS_META_V1]`, e não existe caminho de migração.

Isto é aceitável por um motivo específico e verificável: **nada foi publicado**. Não existe versão distribuída, não existe usuário, e nenhum projeto `.aep` ou `.prproj` no mundo contém metadata deste plugin. Não há dado de usuário para preservar, logo não se deve migração a ninguém.

Se este ADR for revisitado depois do primeiro release público, a conclusão muda: a partir daí qualquer troca de marcador exige leitor dos dois formatos e um plano de migração.

### O que o rebranding não tocou

As **agent skills** continuam com "crosshost" no nome: `building-crosshost-panel-ui`, `orchestrating-crosshost-work`, `securing-crosshost-plugins`, `optimizing-crosshost-performance`.

Isso é intencional. Elas são ferramenta interna de desenvolvimento, não identidade de produto — não aparecem em nenhum artefato distribuível. Renomeá-las cascatearia em `skills-manifest.json`, nos 42 casos de `evals/skill-routing.json`, na checagem `name === nome-do-diretório` de `scripts/skills-lib.mjs`, e no espelho byte-a-byte por SHA-256 entre `.agents/skills/` e `.claude/skills/`. Custo real, benefício zero para o usuário final.

`docs/MASTER_BUILD_SPEC.md` também não foi reescrito. Ele é o documento normativo e usa `CHMS` como código de issue (`CHMS-001` … `CHMS-050`) e como prefixo de exemplo. Reescrevê-lo tornaria o rastreamento das issues incoerente com o próprio plano. As convenções `MOTION_*` desta tabela **prevalecem** sobre os exemplos `CHMS_*` do spec sempre que houver conflito.

### Verificação

Três mecanismos independentes impedem a volta dos placeholders:

1. `tests/brand.test.mjs` varre a árvore inteira procurando `com.example`, `CrossHost Toolkit`, `CrossHostAE`, `CrossHostProtocol`, `CHMS_META_V1`, `CHMS_EXPRESSION` e `CHMS |`, com uma allowlist de cinco arquivos documentais — cada entrada exigindo um motivo escrito, e falhando se o arquivo allowlistado deixar de existir.
2. `scripts/validate.mjs` assere os IDs definitivos nos manifests **construídos**, em `dist/`.
3. `tests/manifests.test.mjs` foi atualizado para afirmar `com.motion.plugin.*`.

### Ainda pendente antes de publicar

O rebranding trocou nome e namespace. Não trocou o que ainda não existe: ícones, domínio real por trás de `com.motion.plugin`, dados comerciais, e a decisão de licença/preço. `docs/MASTER_BUILD_SPEC.md` §35 exige ADR próprio para política comercial e licenciamento — este ADR não decide nada disso.
