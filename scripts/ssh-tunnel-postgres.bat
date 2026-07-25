@echo off
REM Abre um tunel SSH local:5432 -> Postgres da VPS (127.0.0.1:5432, fechado para a internet).
REM Use isso somente se precisar rodar o pi-stack localmente contra o banco da VPS.
REM Mantenha esta janela aberta enquanto estiver usando; Ctrl+C para fechar o tunel.

ssh -i "%USERPROFILE%\.ssh\id_ed25519_hostinger_vps" -L 5432:127.0.0.1:5432 -N deploy@187.77.249.47
