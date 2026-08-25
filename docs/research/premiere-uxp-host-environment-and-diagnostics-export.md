# Premiere UXP — versão do host e exportação de diagnóstico

**Question:** Como obter a versão/locale reais do Premiere no UXP e como salvar um bundle de diagnóstico num local escolhido pelo usuário, sem ampliar a permissão de filesystem?

**Decision date:** 2026-08-25

**Target host/version:** Premiere Pro 25.6+; UXP Developer Tool 2.2+; manifest v5.

**Status:** available

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---:|---|---|
| O módulo UXP expõe nome, versão e locale do host | `require("uxp").host.name`, `.version`, `.uiLocale` | Premiere 25.6 | [Adobe — Host Environment Information](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/host-info/) | A receita oficial mostra `host.version` e `host.uiLocale` no Premiere. |
| O usuário pode escolher um arquivo de saída gravável | `require("uxp").storage.localFileSystem.getFileForSaving(name, { types })` | Premiere 25.6 / manifest v5 | [Adobe — Local File System](https://developer.adobe.com/premiere-pro/uxp/uxp-api/reference-js/modules/uxp/persistent-file-storage/file-system-provider) | Retorna `File` ou `null` quando o picker é cancelado. |
| O conteúdo é escrito de forma assíncrona no `File` retornado | `await file.write(contents)` | Premiere 25.6 | [Adobe — Filesystem Operations](https://developer.adobe.com/premiere-pro/uxp/resources/recipes/filesystem-operations/) | O código deve tratar cancelamento e exceção sem registrar caminho nativo. |
| Picker para arquivo escolhido pelo usuário usa permissão mínima | `requiredPermissions.localFileSystem = "request"` | manifest v5 | [Adobe — UXP Manifest](https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/) | `fullAccess` não é necessário para esta operação. |

## Implementation decision

- Ler `host.version` e `host.uiLocale` uma vez na montagem do painel e passá-los no `CommandRequest.context`.
- Não derivar a versão a partir de nome de executável, path, API do sistema ou comparação com símbolos de outra classe.
- Exportar o support bundle somente após clique explícito em **Exportar diagnóstico**.
- Abrir `getFileForSaving("motion-diagnostics.json", { types: ["json"] })` e escrever o JSON já redigido pelo logger.
- Tratar retorno `null` como cancelamento do usuário, sem erro e sem arquivo parcial criado pelo plugin.
- Não registrar `nativePath`, nome escolhido nem conteúdo criativo no logger.

## Fallback

- Se `host.version` estiver ausente ou vazio, manter `unknown` e exibir estado `Não verificado`; nunca converter a ausência de evidência em `unsupported` por conta própria.
- Se o provider/picker ou `file.write` não estiver disponível, desabilitar a ação com motivo explícito. Não usar Node `fs`, processo externo ou acesso amplo ao disco.

## Capability flag

- A leitura de `host.version` é contexto básico do runtime, não uma capability de produto independente.
- A exportação de diagnóstico depende de `storage.localFileSystem.getFileForSaving` e de um `File.write` callable, verificados por símbolo no momento da ação.

## Tests needed

- `host.version` e `uiLocale` entram no request, no logger e na matriz sem `parseFloat`.
- Ausência de `host.version` resulta em estado `unknown`, não em tier inventado.
- Picker retorna arquivo: JSON é escrito uma vez.
- Picker retorna `null`: operação termina como cancelada e não grava.
- `file.write` lança: erro recuperável e redigido aparece na própria view.
- O manifest mantém somente `localFileSystem: "request"` para este fluxo.

## Open uncertainty

- O carregamento e o picker ainda precisam de execução no Premiere real. A documentação estabelece a API suportada, mas não substitui o smoke test no host nem confirma o comportamento de cada patch suportado.
