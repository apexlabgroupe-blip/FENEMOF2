@echo off
set "PORT=8000"
set "PYTHONUNBUFFERED=1"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=C:\Python313\python.exe"
if not exist "%PY%" set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"
REM Verifie si watchdog deja en cours
powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { $_.CommandLine -like '*watchdog.py*' }; if($p){ exit 0 } else { exit 1 }" >nul 2>&1
if %errorlevel%==0 exit /b 0
start "" /min "%PY%" "%~dp0watchdog.py"
