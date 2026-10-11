# Moti.on no Windows — guia de partida

Preparado em 2026-10-11, antes de o Mac ir para a garantia. O objetivo do
projeto continua sendo **funcionar nos dois sistemas**: nada do fluxo do Mac foi
alterado (o build nativo do Mac foi recompilado e passou 5/5 testes dos kernels;
`npm run lint`, `npm run build` e os 2365 testes de `npm test` passaram no Mac).

> Estado (2026-10-11, Windows 11 Pro 26200, Node 24.18, VS 2022 Build Tools
> 17.14, After Effects 26.5): build, testes, instalação, os 4 efeitos nativos e a
> abertura do painel **verificados no Windows** (ver §5). Ainda
> `IMPLEMENTED_NOT_HOST_VERIFIED`: ferramentas aplicadas pelo painel e o login
> Google real.

## 1. Preparar a máquina (uma vez)

1. **Node.js 22 LTS** (nodejs.org).
2. **Git for Windows**.
3. **Visual Studio 2022 Build Tools** (ou Community) com a carga
   *Desenvolvimento para desktop com C++* — traz `cl.exe`, o SDK do Windows e o
   CMake. Sem isso o painel ainda funciona, mas sem motor nativo e sem cofre da
   conta (login Google).
4. **After Effects** 2025+ (o manifesto aceita AEFT 25.0–99.9, CSXS 12).
5. **Claude Code** no Windows.

## 2. Trazer o projeto do Drive para o disco local

Não trabalhe dentro do Google Drive: `node_modules` (centenas de MB) e o `.git`
sincronizando o tempo todo deixam tudo lento e geram conflitos. Copie para uma
pasta local, sem o `node_modules` do Mac:

```powershell
robocopy "G:\Meu Drive\Moti.on\implementation" "C:\dev\Moti.on\implementation" /E /XD node_modules cmake-3.29.3-macos-universal /XF .DS_Store cmake.tar.gz
robocopy "G:\Meu Drive\Moti.on\AfterEffectsSDK_26.5_win" "C:\dev\Moti.on\AfterEffectsSDK_26.5_win" /E
```

(Troque `G:\Meu Drive` pela letra/caminho do Google Drive para desktop.) Com o
SDK em `C:\dev\Moti.on\AfterEffectsSDK_26.5_win`, o build nativo o encontra
sozinho; em outro lugar, defina `AESDK_ROOT`.

No repositório copiado, para o Git não marcar todos os arquivos como alterados
por causa de fim de linha:

```powershell
cd C:\dev\Moti.on\implementation
git config core.autocrlf false
git status
```

O trabalho da conta Google / admin / modo desenvolvedor foi commitado no Windows
em 2026-10-11 (`561b9b9`, branch `codex/plugin-review`). O projeto de trabalho
agora é `C:\dev\Moti.on\implementation`; a pasta do Drive ficou só como cópia.

Visual Studio Build Tools com C++ e CMake, sem abrir o instalador:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.CMake.Project --includeRecommended"
```

## 3. Atualizar e instalar (um clique)

Dê dois cliques em **`Atualizar Moti.on.cmd`** (equivalente ao
`Atualizar Moti.on.command` do Mac). Ele roda `scripts/update-windows.ps1`, que:

1. roda `npm ci` se o `node_modules` não for do Windows;
2. `npm run build` — e compila o cofre da conta
   (`account/bin/win32-x64/motion-account-vault.exe`, Gerenciador de
   Credenciais do Windows) se houver Visual Studio;
3. compila `MotionCore.aex` (`plugin/build-windows.ps1`) e instala em
   `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore`
   (`plugin/install-dev.ps1`, pede administrador; faz backup). Se falhar, avisa e
   segue — o painel funciona, só os efeitos nativos ficam indisponíveis;
4. instala o painel em `%APPDATA%\Adobe\CEP\extensions\com.motion.plugin.ae` em
   **modo desenvolvedor** (licença dispensada) e liga o `PlayerDebugMode`
   (CSXS.12) para a extensão não assinada carregar.

Opções (rodando pelo terminal): `"Atualizar Moti.on.cmd" -RealLicense` instala
sem o modo desenvolvedor, para testar o login Google real; `-SkipNative` pula o
motor C++.

Remover: `scripts\uninstall-ae-dev.ps1`.

## 4. O que muda por sistema

| Parte | macOS | Windows |
|---|---|---|
| Painel CEP + ExtendScript | igual | igual |
| Login Google (navegador + callback 127.0.0.1) | igual | igual |
| Cofre da conta | Keychain | Gerenciador de Credenciais (mesmo `native/account-vault/main.cpp`) |
| Modo desenvolvedor | `install-ae-dev.sh --dev-unlock` | `install-ae-dev.ps1 -DevUnlock` |
| Motor nativo | `MotionCore.plugin` (Rez, Mach-O) | `MotionCore.aex` (PiPLtool, `plugin/cmake/pipl-win.cmake`) |
| Gradient | CPU + GPU Metal | **CPU** (GPU = fase 2, abaixo) |
| Barra rápida na timeline + arraste nativo (AEGP Live Gestures) | `MotionGestureBridge.plugin` (AppKit, `plugin/gesture/*.mm`) | `MotionGestureBridge.aex` (Win32 + GDI+, `plugin/gesture/win/`); mesmo protocolo de arquivos, pasta `%USERPROFILE%\AppData\Local\Moti.on\{QuickBar,Gestures}` |

## 5. Primeira sessão no Windows — checklist

Resultado da primeira sessão (2026-10-11):

| # | Verificação | Resultado |
|---|---|---|
| 1 | `npm ci` / `npm run lint` / `npm run build` | **PASS** |
| 1 | `npm test` | **PASS** — 2365/2365 (mesma contagem do Mac) |
| 2 | `plugin\build-windows.ps1` (MSVC 17.14, SDK 10.0.26100) | **PASS** — `MotionCore.aex` gerado; 4/4 testes de kernel |
| 2 | `.aex`: exports e PiPL | **PASS** — `GlitchMain`, `WaveMain`, `TransitionMain`, `GradientMain` exportados; recurso `PiPL` 16000 com `CodeWin64X86`; só depende de `KERNEL32.dll` (CRT estático) |
| 2 | Cofre da conta (`motion-account-vault.exe`) | **PASS** depois de correção — ver abaixo; `tests/account-vault-runtime.test.mjs` |
| 3 | `scripts\update-windows.ps1` (instala `.aex` + painel) | **PASS** — `.aex` em `MediaCore` com hash igual ao do build; painel em `%APPDATA%\Adobe\CEP\extensions\com.motion.plugin.ae` com `developer-unlock`; `PlayerDebugMode` = 1 |
| 3 | Efeitos dentro do After Effects 26.5 (x89) | **PASS** — `scripts/verify-ae-native.jsx`: os 4 matchNames em `app.effects` (categoria *Moti.on*), aplicados num sólido e renderizados sem erro. Glitch fatia com RGB split, Wave ondula as bordas, Gradient renderiza (CPU), Transition fica igual à base nos valores padrão |
| 4 | Painel no AE em modo desenvolvedor | **PASS** — abre sem licença; Ferramentas (44), Suavização e Presets; rodapé "Sem composição" vindo do host |
| 4 | Ferramentas aplicadas pelo painel / login Google real | **NOT RUN** |

Correções feitas no Windows:

- **Cofre da conta respondia `\r\n`:** o stdout do CRT em modo texto troca `\n`
  por `\r\n`, e `account/runtime.cjs` exige a linha exata do protocolo. Toda
  leitura ou escrita virava `VAULT_UNAVAILABLE` (o login nunca persistiria).
  `native/account-vault/main.cpp` agora põe stdin/stdout em modo binário só no
  `_WIN32`; o teste novo faz ida e volta real no Gerenciador de Credenciais
  pelo próprio `runtime.cjs`.
- `scripts/build.mjs`: o `vcvars64.bat` procura o `vswhere` no PATH e imprimia
  um erro inofensivo; o script temporário agora põe a pasta do Installer no PATH.
- npm 11 não roda o `postinstall` do esbuild sem `allowScripts`; não faz falta,
  o binário vem do `@esbuild/win32-x64`.

- **Pasta do `.aex` estava errada:** `install-dev.ps1` copiava para
  `C:\Program Files\Common Files\Adobe\Common\...`, que o AE não varre. No
  Windows a pasta comum é `C:\Program Files\Adobe\Common\Plug-ins\7.0\MediaCore`
  (confirmado no `Plugin Loading.log`). O script agora instala lá e apaga a cópia
  do caminho antigo.

Para verificar os efeitos de novo: com o **AE já aberto** e pronto,

```powershell
& "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\AfterFX.exe" -r "C:\dev\Moti.on\implementation\scripts\verify-ae-native.jsx"
```

O script cria um projeto descartável, confere se os 4 matchNames estão em
`app.effects`, aplica cada efeito num sólido, salva um PNG por efeito e grava
`artifacts\ae-native-verify\result.json`.

Armadilhas encontradas no AE 26.5 para Windows:

- `AfterFX.exe -r script.jsx` com o **AE fechado** abre e sai sozinho ~30 ms
  depois de ficar pronto (estados `kStateAppRunning` → `kStatePrepareToQuit` no
  Sentry, sem crash e sem rodar o script). Com o AE aberto, o `-r` repassa o
  script para a instância e funciona.
- O `Plugin Loading.log` diz "No loaders recognized this plugin" para o
  `MotionCore.aex`, e o cache `HKCU\Software\Adobe\After Effects\26.5\PluginCache`
  grava `Ignore = 1`. Isso vem dos loaders do MediaCore (Premiere). O loader de
  efeitos do AE carrega o PiPL normalmente, e os 4 efeitos funcionam.

### Barra rápida na timeline (2026-10-11)

Portada para Windows como o plug-in AEGP `MotionGestureBridge.aex`, que hospeda
também o arraste nativo de parâmetros dos presets. O código fica em
`plugin/gesture/win/`; `build-windows.ps1` compila e `install-dev.ps1` instala
junto com o `MotionCore.aex`.

- `QuickBarWin.cpp`: janela popup em camadas, dona = janela principal do AE
  (`AEGP_GetMainHWND`), por isso fica acima do AE e nunca acima de outros
  apps. Não ativa (`WS_EX_NOACTIVATE`, `MA_NOACTIVATE`): a Timeline mantém o
  teclado. Desenho em GDI+ (cantos, sombra, glifos de curva), fade + escala
  (só fade sem animações do Windows), DPI por monitor e tooltips. Esc e clique
  fora fecham, por hooks `WH_KEYBOARD`/`WH_MOUSE` locais à thread do AE, ativos
  só com a barra visível.
- `GestureBridgeWin.cpp`: mesma validação do `GestureBridge.mm` (camada ativa e
  destravada, Slider com o nome exato, sem keys/expressão, faixa, um Desfazer,
  watchdog de 4 s).
- `NativeJson.h` / `QuickBarProtocol.h`: JSON estrito e limitado e as regras da
  barra, independentes da localidade (`from_chars`/`to_chars`); testes em
  `plugin/tests/QuickBarProtocolTests.cpp` (ctest `quickbar-protocol`).
- Painel: `native-gesture.ts` resolve a pasta no Windows a partir do caminho da
  própria extensão (perfil em `AppData\Roaming`). Caminhos com `..`, UNC ou
  fora do perfil são recusados.

Verificação no AE 26.5: handshakes dos dois módulos criados ao abrir; seleção
nova de keyframes → painel pede a barra → `visible: true`; cliques em
Ease/In/Out/InOut/Linear chegam como `pick` e o preset é gravado nas keys
(Bezier, influência conferida via ExtendScript); a barra continua aberta após
aplicar; Esc/clique fora/× geram `dismiss`; "Editor completo" gera `editor`.
**PASS.**

Correções depois do primeiro teste com o mouse (mesmo dia):

- **Trocar de preset não funcionava**: o painel aceitava só eventos com número
  de sequência *maior* que o último. Um evento com relógio adiantado (gravado na
  investigação) calava todos os cliques seguintes. Agora qualquer número
  diferente é clique novo; o arquivo só muda num clique.
- Clique durante uma aplicação em andamento era descartado como "ocupado" em
  silêncio; agora espera a aplicação atual e vale o último clique.
- Verificação com o mouse no AE 26.5: InOut → In → Ease → InOut → Linear →
  Out → In → Ease seguidos, sem fechar sozinha; as keys terminam com a curva do
  último clique e continuam selecionadas. **PASS.**
- Favoritos: a barra mostra só os presets com ★ na biblioteca (até 10; sem
  favoritos, os 5 padrão). A ★ diz "Mostrar na barra rápida da timeline" e a
  barra aberta se atualiza ao marcar/desmarcar.
- `event.json` de dispensa traz `reason` (`escape`, `close` ou
  `press:<mensagem>:<classe da janela>`) para diagnóstico; o painel ignora.
- Revisão de código aplicada: nenhuma exceção C++ atravessa os hooks/idle do
  AE; ids inteiros validados; JSON recusa `\u0000` e UTF-8 inválido; janela
  recriada limpa quando o AE recria a janela principal.

Arraste nativo de parâmetros (Gestures) compilado e com handshake,
mas o arraste em si no AE é **NOT RUN**. Leitor de tela (MSAA/UIA) não
implementado na barra: os mesmos presets ficam acessíveis no painel.

Falta: aplicar ferramentas pelo painel numa composição real e, por fim,
`-RealLicense` + login Google. matchNames e disk IDs são os mesmos do Mac, então
projetos `.aep` abrem nos dois.

## 6. Fase 2 — GPU NVIDIA e AMD no Windows

Pedido do dono em 2026-10-11: no Windows, usar a placa de vídeo (NVIDIA e AMD) e
não depender só da CPU; testar o Gradient (incluindo glow/difusão) na GPU.

- O AE entrega ao efeito, no Windows, **DirectX 12**, CUDA (só NVIDIA) ou
  OpenCL. **DirectX 12 cobre NVIDIA e AMD com um único código** — é o alvo.
- `plugin/host/GradientMath.inc` já é a fonte única da matemática, compilada como
  C++ e embutida como Metal. O mesmo arquivo deve virar HLSL (compute shader),
  com macros para os poucos tipos que diferem.
- Referência oficial no SDK: `AfterEffectsSDK_26.5_win/Examples/Effect/SDK_Invert_ProcAmp`
  (`.chlsl` DirectX, `.cu`, `.cl`, e o tratamento de `PF_GPU_Framework_DIRECTX`
  em `GPU_DEVICE_SETUP`/`SMART_RENDER_GPU`) e `Examples/GPUUtils`.
- Em `Gradient.cpp`, `GPU_DEVICE_SETUP` hoje recusa tudo que não é Metal (por
  isso o Windows cai na CPU com segurança). A fase 2 adiciona o ramo DirectX ao
  lado do Metal, sem tocar no caminho do Mac.
- Validação: comparar saída CPU × GPU (mesma tolerância dos testes Metal em
  `plugin/tests/GradientMetalTests.mm`) e medir tempo de render no AE com GPU
  NVIDIA e, se possível, AMD.
- Depois do Gradient, avaliar Glitch/Wave/Transition (hoje CPU nos dois sistemas).

## 7. Contexto que estava só na memória do Claude no Mac

- **Conta Google / admin (2026-10-08):** backend Supabase `motion-account`,
  migração de dispositivos admin, `services/supabase/scripts/setup.mjs <ref>`,
  CLI `services/supabase/admin/motion-admin.mjs`, guia `docs/ACCOUNT_ADMIN.md`.
  Projeto Supabase real, cliente OAuth do Google e login no AE **ainda não
  foram executados** — dependem dos passos do dono no painel do Supabase/Google.
- **Modo desenvolvedor (2026-10-11):** arquivo `account/developer-unlock` na
  pasta instalada (nunca entra em `dist/`); sem a flag o instalador o remove.
- **Confiabilidade (2026-10-07):** erros do host usam chaves `hostError.*`
  (`host/src/errors.jsx`); comandos que mexem em camadas existentes chamam
  `MotionPreflight.unlockedLayers`/`unlockedPropertyOwners`; requisitos de
  efeitos dos presets em `libraryRequiredEffects`. Verificação real no AE
  pendente.
- **UI "Onyx Vivo" (2026-10-06):** movimento "vivo equilibrado" (≤320 ms, sem
  loops decorativos, respeita reduced motion), ícones duotone animados, paleta
  Onyx suave original — não re-saturar. AE primeiro; Premiere UXP só herda o kit.
- O dono fala português.
