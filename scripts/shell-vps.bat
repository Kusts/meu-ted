@echo off
REM Abre um shell interativo DENTRO do pi-stack que ja esta rodando na VPS.
REM Use isso para rodar `pi`, checar logs, editar configs, etc. direto no ambiente real.
REM Nao sobe uma copia local - evita conflito de sessao do WhatsApp e do banco.

ssh -t -i "%USERPROFILE%\.ssh\id_ed25519_hostinger_vps" deploy@187.77.249.47 "docker exec -it pi-stack bash"
