# Como carregar o plugin UXP no Premiere Pro

**Pergunta:** o `IMPLEMENTED_NOT_HOST_VERIFIED` do Premiere estava documentado como bloqueado no UXP Developer Tool. O bloqueio é real, e existe caminho sem ele?

**Data da decisão:** 2026-08-30

**Host alvo:** Premiere Pro 26.3.2 / Windows 11 Pro 10.0.26200 / UXP Developer Tools instalado em `C:\Program Files\Adobe\Adobe UXP Developer Tools`.

**Status:** `available` — existe caminho sem UDT e sem elevação, medido nesta máquina.

## O que a documentação oficial diz

| Afirmação | Fonte | Observação |
|---|---|---|
| "Before you can connect to a UXP plugin running within Premiere Pro, you must enable 'Developer Mode', in Premiere Pro's Plugins preferences" | [Install a UXP plugin](https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/) | Vale para **conectar** (depurar) o plugin, não para instalá-lo |
| Developer Mode também pode ser ligado criando `settings.json` com `{ "developer": true }` em `%CommonProgramFiles%/Adobe/UXP/Developer` | [Essential Development Tools](https://developer.adobe.com/premiere-pro/uxp/introduction/essentials/dev-tools/) | Caminho em `C:\Program Files\Common Files` — exige elevação |
| UPIA instala, remove e lista plugins pela linha de comando | [Install a UXP plugin](https://developer.adobe.com/premiere-pro/uxp/plugins/distribution/install/) | "Admin privileges **may** be required" |
| Não há caminho documentado para carregar plugin **despacotado** fora do UDT | idem | Confirmado lendo a página inteira |

## O que foi medido nesta máquina

**O modo desenvolvedor nunca foi habilitado.** `C:\Program Files\Common Files\Adobe\UXP\Developer` não existia. Tentar criá-lo sem elevação devolveu "O acesso ao caminho 'Developer' foi negado", e `WindowsPrincipal.IsInRole(Administrator)` deu `False`. O UDT, aberto duas vezes, encerrou sozinho em segundos — coerente com o prompt de elevação que ele exibe no primeiro uso não ter sido concedido.

**O UPIA instalou um `.ccx` não assinado, sem elevação.** O pacote foi um zip simples de `dist/premiere-uxp/` renomeado:

```powershell
Compress-Archive -Path 'dist\premiere-uxp\*' -DestinationPath motion.zip
# renomear para motion.ccx
& "C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe" /install motion.ccx
```

Resposta: `Installation Successful`. Nenhum prompt de assinatura, nenhuma elevação.

**Onde pousou:** `%APPDATA%\Adobe\UXP\Plugins\External\com.motion.plugin.premiere_0.1.0`, com os quatro arquivos idênticos ao build (`index.html`, `main.js`, `manifest.json`, `styles/theme.css`). A pasta `Plugins\External` não existia antes; o UPIA a criou.

**O Premiere reconheceu.** `UnifiedPluginInstallerAgent.exe /list all`:

```
1 extension installed for Premiere Pro (ver 26.3.2)
 Status                        Extension Name                         Version
 Enabled    Moti.on                                                      0.1.0
```

E o log do host, na primeira linha da sessão seguinte:

```
[2026-08-30_22-05-21][12420][Debug] upic::plugin with id: com.motion.plugin.premiere
  is added in uxp plugin manager with status as enabled
```

O log também mostra `upic::Loading plugins from system fallback plugins folder`, o que confirma que o Premiere varre pastas de plugin na inicialização, sem depender do UDT.

**A aba apareceu.** Captura de tela do Premiere mostra `Moti.on` como aba no grupo de painéis, ao lado de `Projeto`, `Efeitos` e `Film Impact Dashboard`.

**O painel não foi instanciado.** O log não contém nenhum `panel.started` — a linha que `apps/premiere-uxp/client/src/main.ts` emite no arranque — e não há saída alguma do plugin depois de 22:06. O UXP instancia o painel de forma preguiçosa, quando ele é exibido; a aba existe a partir do `entrypoint` do manifesto, antes de qualquer JavaScript rodar.

## Decisão de implementação

`docs/INSTALLATION.md` passa a documentar dois caminhos para o Premiere:

1. **UPIA** (medido) — instala sem UDT, sem modo desenvolvedor e sem elevação. Serve para verificar o plugin no host.
2. **UDT** (`Add Plugin` → `Load & Watch`) — continua sendo o único caminho para **depurar**: hot reload, console e inspetor exigem o modo desenvolvedor, que exige elevação.

## Fallback

Nenhum necessário para instalar. Para depurar sem elevação não há fallback: o modo desenvolvedor é pré-requisito documentado e o arquivo mora em `Program Files`.

## Testes necessários

O gate de host do Premiere continua aberto no que depende do painel **rodando**: versão do host, contexto, capacidades, transação/Undo e exportação de diagnóstico. Falta um clique humano na aba `Moti.on` para instanciar o painel; a partir daí a saída do painel cai no log UXP em `%APPDATA%\Adobe\Premiere Pro\Logs\` e pode ser lida sem GUI.

## Incerteza aberta

O UPIA aceitou um pacote não assinado nesta máquina. Não foi verificado se isso vale para distribuição (Marketplace/`.ccx` assinado) ou se é uma permissividade do agente local. Não conclua que o pacote está pronto para distribuir.
