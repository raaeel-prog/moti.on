# Moti.on no Windows — guia de partida

Preparado em 2026-10-11, antes de o Mac ir para a garantia. O objetivo do
projeto continua sendo **funcionar nos dois sistemas**: nada do fluxo do Mac foi
alterado (o build nativo do Mac foi recompilado e passou 5/5 testes dos kernels;
`npm run lint`, `npm run build` e os 2365 testes de `npm test` passaram no Mac).

> Estado: tudo abaixo para Windows está `IMPLEMENTED_NOT_HOST_VERIFIED` — foi
> escrito no Mac, sem Windows/Visual Studio/After Effects para Windows à mão. A
> primeira tarefa no Windows é rodar e corrigir o que aparecer.

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
robocopy "G:\Meu Drive\Moti.on\implementation" "C:\dev\Moti.on\implementation" /E /XD node_modules /XF .DS_Store
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

O trabalho da conta Google / admin / modo desenvolvedor ainda **não está
commitado** (branch `codex/plugin-review`); ele vem junto na cópia. Vale fazer um
commit dele no Windows logo no início.

## 3. Atualizar e instalar (um clique)

Dê dois cliques em **`Atualizar Moti.on.cmd`** (equivalente ao
`Atualizar Moti.on.command` do Mac). Ele roda `scripts/update-windows.ps1`, que:

1. roda `npm ci` se o `node_modules` não for do Windows;
2. `npm run build` — e compila o cofre da conta
   (`account/bin/win32-x64/motion-account-vault.exe`, Gerenciador de
   Credenciais do Windows) se houver Visual Studio;
3. compila `MotionCore.aex` (`plugin/build-windows.ps1`) e instala em
   `C:\Program Files\Common Files\Adobe\Common\Plug-ins\7.0\MediaCore`
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
| Barra rápida nativa / gestos (`plugin/gesture`) | AppKit | **ainda não portado** — o painel detecta a ausência e segue sem ela |

## 5. Primeira sessão no Windows — checklist

1. `npm ci`, `npm run lint`, `npm run build`, `npm test` — tudo verde.
2. `plugin\build-windows.ps1` — confirmar que o PiPL compila e os 4 testes de
   kernel passam com MSVC. Arquivos tocados para isso: `plugin/CMakeLists.txt`
   (ramo `WIN32`), `plugin/resources/MotionCorePiPL.r` (entradas
   `CodeWin64X86`), `plugin/host/GradientMetalStub.cpp`.
3. Instalar e abrir o AE: os 4 efeitos aparecem em *Moti.on* (Glitch Core, Wave
   Core, Native Transition, Gradient)? matchNames e disk IDs são os mesmos do
   Mac, então projetos `.aep` abrem nos dois.
4. Painel abre em modo desenvolvedor; depois testar `-RealLicense` + login Google.
5. Registrar a evidência como pede `/testing-adobe-hosts`.

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
