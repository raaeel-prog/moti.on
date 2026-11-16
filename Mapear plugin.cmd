@echo off
setlocal
cd /d "%~dp0"
set "GRAPHIFY_EXE=%USERPROFILE%\.local\bin\graphify.exe"
if not exist "%GRAPHIFY_EXE%" (
  echo Graphify ausente. Instale com: uv tool install --python 3.12 "graphifyy[sql]==0.9.94"
  exit /b 1
)
"%GRAPHIFY_EXE%" extract . --code-only --no-cluster --max-workers 4
if errorlevel 1 exit /b %errorlevel%
"%GRAPHIFY_EXE%" cluster-only . --no-label --no-viz
if errorlevel 1 exit /b %errorlevel%
"%GRAPHIFY_EXE%" export html --node-limit 15000
if errorlevel 1 exit /b %errorlevel%
"%GRAPHIFY_EXE%" tree --root . --label "Moti.on"
if errorlevel 1 exit /b %errorlevel%
echo Mapa atualizado em graphify-out\graph.html
