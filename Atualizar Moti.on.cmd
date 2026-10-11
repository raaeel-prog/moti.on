@echo off
rem Atualizacao local do Moti.on no Windows (equivalente ao "Atualizar Moti.on.command" do Mac).
rem Feche o After Effects antes. Opcoes: -SkipNative  -RealLicense
chcp 65001 >nul
echo Atualizacao local do Moti.on - motor C++ e painel
echo Feche o After Effects antes de continuar. A instalacao atual sera copiada para artifacts\install-backups.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-windows.ps1" %*
if errorlevel 1 (
  echo.
  echo A atualizacao falhou. Veja a mensagem acima.
) else (
  echo.
  echo Reabra o After Effects.
)
pause
