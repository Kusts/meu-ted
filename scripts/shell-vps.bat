@echo off
REM Abre um shell interativo DENTRO do pi-stack que ja esta rodando na VPS.
REM Use isso para rodar `pi`, checar logs, editar configs, etc. direto no ambiente real.
REM Nao sobe uma copia local - evita conflito de sessao do WhatsApp e do banco.
REM
REM Configuracao (nenhum valor operacional hardcoded): VPS_IP, VPS_SSH_USER e
REM VPS_SSH_KEY_PATH sao lidos de ..\vps-hostinger\.env a partir da raiz do repo
REM (mesma fonte de docs/ops/vps-access.md; formato KEY=value, uma por linha).
REM Exemplo de ..\vps-hostinger\.env:
REM   VPS_IP=<ip-da-vps>
REM   VPS_SSH_USER=<usuario-ssh>
REM   VPS_SSH_KEY_PATH=C:\Users\voce\.ssh\sua-chave
setlocal EnableDelayedExpansion
set "ENV_FILE=%~dp0..\..\vps-hostinger\.env"
if not exist "%ENV_FILE%" (
  echo [shell-vps] Arquivo de configuracao nao encontrado: "%ENV_FILE%"
  echo [shell-vps] Veja docs/ops/vps-access.md e crie ..\vps-hostinger\.env a partir da raiz do repo.
  exit /b 1
)
set "VPS_IP="
set "VPS_SSH_USER="
set "VPS_SSH_KEY_PATH="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  if /i "%%A"=="VPS_IP" set "VPS_IP=%%B"
  if /i "%%A"=="VPS_SSH_USER" set "VPS_SSH_USER=%%B"
  if /i "%%A"=="VPS_SSH_KEY_PATH" set "VPS_SSH_KEY_PATH=%%B"
)
if not defined VPS_IP ( echo [shell-vps] VPS_IP ausente em "%ENV_FILE%". & exit /b 1 )
if not defined VPS_SSH_USER ( echo [shell-vps] VPS_SSH_USER ausente em "%ENV_FILE%". & exit /b 1 )
if not defined VPS_SSH_KEY_PATH ( echo [shell-vps] VPS_SSH_KEY_PATH ausente em "%ENV_FILE%". & exit /b 1 )
ssh -t -i "%VPS_SSH_KEY_PATH%" "%VPS_SSH_USER%@%VPS_IP%" "docker exec -it pi-stack bash"
