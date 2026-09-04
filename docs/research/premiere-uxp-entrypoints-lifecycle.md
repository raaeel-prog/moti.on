# Premiere UXP entrypoints e lifecycle

Question:
Qual é o contrato documentado de `entrypoints.setup()` para o painel UXP do Premiere e o ajuste atual de lifecycle é suportado?

Decision date:
2026-08-30

Target host/version:
Premiere Pro 26.3.x, manifest v5, Windows 11.

Status:
available para registro de painel por `entrypoints.setup`; host verification ainda `NOT RUN` até o painel instanciar e emitir `panel.started`.

## Evidence table

| Claim | Exact symbol or policy | Minimum version | Primary source | Notes |
|---|---|---:|---|---|
| O manifesto declara entrypoints e o JavaScript mapeia esses IDs para handlers. | `entrypoints` no `manifest.json`; `require("uxp").entrypoints.setup()` | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Entrypoints", seção "Entrypoints": https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/ | A página diz que o contrato tem duas partes: manifesto e JavaScript via `entrypoints.setup()`. |
| O host recebe hooks de ciclo de vida no nível do plugin. | `plugin.create()`, `plugin.destroy()` | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Entrypoints", seção "Plugin Lifecycle Hooks": https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/ | A implementação declara ambos. `plugin.create()` é propositalmente no-op porque ainda não há root de painel. |
| O host recebe hooks de ciclo de vida no nível do painel. | `panels.<panelId>.create(rootNode)`, `show(rootNode)`, `hide(rootNode)`, `destroy(rootNode)` | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Entrypoints", seção "Panel Lifecycle Hooks": https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/ | A chave `mainPanel` precisa bater com `apps/premiere-uxp/manifest.json`. O código usa `create`, `show` e `destroy`; `hide` não é necessário para a montagem atual. |
| `hide()` e `destroy()` ainda têm limitação documentada no Premiere. | `panels.<panelId>.hide`, `panels.<panelId>.destroy` | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Entrypoints", aviso logo após hooks de painel: https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/ | O cleanup também passa por `plugin.destroy()` para não depender só do painel. |
| Promises são permitidas em hooks de painel, mas há timeout curto; `plugin.create()` não aparece na lista de hooks com Promise. | Promise em `plugin.destroy`; Promise em `panel.create/show/hide/destroy`; timeout 300 ms | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Entrypoints", seção "Using Promises": https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/entrypoints/ | O setup atual mantém os callbacks síncronos e deixa trabalho async para runtime do painel. |
| O painel instalado deve ser aberto pelo menu do host. | Window > UXP Plugins | Premiere UXP | Adobe Premiere Pro UXP, "Install a UXP plugin": https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/ | A página diz que plugins UXP no Premiere aparecem em `Window > UXP Plugins`. |
| Developer Mode é requisito para conectar/depurar, não para o caminho comum de instalação `.ccx`. | Developer Mode; `.ccx`; UPIA | Premiere UXP | Adobe Premiere Pro UXP, "Install a UXP plugin": https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/ | A mesma página separa conexão/Developer Mode de instalação por Creative Cloud, `.ccx` ou UPIA. |
| Tamanhos do painel são declarados no entrypoint de painel do manifesto. | `minimumSize`, `maximumSize`, `preferredDockedSize`, `preferredFloatingSize` | Manifest v5 / Premiere UXP | Adobe Premiere Pro UXP, "UXP Manifest", `EntrypointDefinition`/panel size fields: https://developer.adobe.com/premiere-pro/uxp/plugins/concepts/manifest/ | `apps/premiere-uxp/manifest.json` declara mínimo 280x280 e tamanhos preferidos. |

## Host evidence measured locally

No Premiere Pro 26.3.2 em Windows 11, um build anterior declarou `plugin: { destroy() {} }` sem `plugin.create()`. O log UXP registrou:

```text
Error: create method is not defined for plugin.
    at Object._parsePluginData (uxp://uxp-internal/pluginmanager_scripts.js)
    at Object.setup (uxp://uxp-internal/pluginmanager_scripts.js)
```

Decisão: quando o objeto `plugin` é declarado, o build declara `create()` e `destroy()`. Esta exigência estrita é tratada como comportamento medido do host 26.3.2, não como frase explícita da documentação pública.

## Implementation decision

`apps/premiere-uxp/client/src/lifecycle.ts` expõe `buildEntrypointConfig()` para que o contrato de entrypoints seja testável fora do topo de módulo:

- `plugin.create()` é no-op e não monta UI;
- `plugin.destroy()` chama `lifecycle.destroy()`;
- `panels.mainPanel.create(rootNode)` monta o painel;
- `panels.mainPanel.show(rootNode)` atualiza/exibe sem duplicar montagem;
- `panels.mainPanel.destroy()` desmonta;
- `mainPanel` é mantido em paridade com `apps/premiere-uxp/manifest.json`.

## Fallback

Se `require("uxp").entrypoints.setup` não existir no runtime do host, o módulo lança erro durante setup em vez de mascarar como preview DOM. O fallback DOM continua exclusivo para preview fora do UXP.

## Capability flag

Nenhuma flag de produto nova. Isto é bootstrap/lifecycle obrigatório do painel.

## Tests needed

- Automatizado: `apps/premiere-uxp/tests/entrypoints.test.mjs` cobre a configuração, a paridade do ID `mainPanel`, a exigência medida de `plugin.create()` e a montagem/desmontagem sem duplicação.
- Host real: instalar o `.ccx`, abrir `Window > UXP Plugins > Moti.on` ou clicar na aba já registrada, confirmar `panel.started` em `%APPDATA%\Adobe\Premiere Pro\Logs\UXPLogs_*.log`, executar **Executar autoteste**, **Verificar sistema** e **Exportar diagnóstico** conforme `docs/INSTALLATION.md`.

## Open uncertainty

O log interno `_parsePluginData` não é API pública. Ele só sustenta o teste regressivo do bug observado. O contrato público continua sendo a página oficial de entrypoints, e qualquer mudança futura deve ser revalidada na documentação e no host.
