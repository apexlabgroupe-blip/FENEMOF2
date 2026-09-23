@echo off
set "PORT=8000"
set "HOST=0.0.0.0"
set "PYTHONUNBUFFERED=1"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=C:\Python313\python.exe"
if not exist "%PY%" set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"
REM tuer zombie si port bloque
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
start "" /min "%PY%" "%~dp0server.py"
