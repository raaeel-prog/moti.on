# Changelog

## Não lançado

Fase P0 (fundação) conforme `docs/MASTER_BUILD_SPEC.md` §39. Ainda não é release: `package.json` e os dois manifests continuam em `0.1.0`. A versão só sobe quando houver o que numerar, e a sincronização entre os quatro lugares que hoje repetem a versão à mão chega no CHMS-002.

### CHMS-001 — Baseline e rebranding

- **Baseline do starter registrado** em `docs/BASELINE_STARTER_0.1.0.md`: saída verbatim de `npm run check` (exit 0, 6/6 testes), ambiente, e inventário de `dist/` com SHA-256. Tag `starter-0.1.0` criada. A forma legível por máquina está em `tests/fixtures/dist-baseline-pre-rebrand.json`.
- **Renomeado de "CrossHost Toolkit" para "Moti.on".** Namespace `com.example.crosshosttoolkit.*` → `com.motion.plugin.*`; globais `CrossHostAE` → `MotionAE` e `CrossHostProtocol` → `MotionProtocol`; pacote npm `adobe-crosshost-plugin-starter` → `motion-plugin`. Prefixos reservados para os rigs que chegam no CHMS-009: `[MOTION_META_V1]`, `// MOTION_EXPRESSION v1 |`, `MOTION | `. Registrado em `docs/adr/0001-marca-e-namespace.md`.
- **Corrigido: o arquivo `.debug` do CEP ia parar em `dist/`.** `scripts/build.mjs` copiava a árvore de `src/` sem lista de exclusão, então a porta de depuração remota (8091) entrava no output de build. Agora é excluído, e `scripts/validate.mjs` falha se voltar.
- **Corrigido: `BUILD_INFO.json` podia mentir.** `name` e `version` eram literais hardcoded em `scripts/build.mjs`; agora vêm de `package.json`.
- **Corrigido: `scripts/validate.mjs` escrevia na raiz do repositório.** A cópia temporária usada para checar a sintaxe do `.jsx` era gravada como `.tmp-index-jsx-check.js` na raiz e removida num `finally` — se o processo morresse no meio, o arquivo ficava. Agora usa `os.tmpdir()`.
- **Removidos os `console.log` do ciclo de vida do plugin UXP**, proibidos pela §34. Os hooks continuam existindo porque o UXP os exige; o logger estruturado chega no CHMS-007.
- **Novas proteções:** `tests/brand.test.mjs` varre a árvore inteira contra os identificadores antigos, com allowlist documental que exige motivo escrito por entrada. `scripts/validate.mjs` assere os IDs definitivos nos manifests construídos. `tests/manifests.test.mjs`, que antes **fixava** os placeholders `com.example`, agora fixa os IDs reais.
- **`.gitattributes` adicionado** normalizando fim de linha, necessário porque o gate de paridade de bytes do CHMS-002 roda em Linux e Windows. `dist/` entrou no `.gitignore`: é saída derivada, reproduzível por `npm run build` a partir da tag.

## 0.1.0 — 2026-08-24

- Starter Premiere Pro UXP funcional para leitura do projeto e da sequência ativa.
- Starter After Effects CEP/ExtendScript funcional para leitura do contexto e criação de composição de teste.
- Contrato compartilhado de respostas, build sem dependências, validação, testes e CI.
