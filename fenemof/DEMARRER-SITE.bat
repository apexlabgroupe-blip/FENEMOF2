@echo off
title Serveur Fenemof
cd /d "C:\sedec1\Default Project\fenemof"

REM Le serveur tourne-t-il deja ?
powershell -NoProfile -Command "try { Invoke-WebRequest 'http://localhost:8000/api/siteinfo' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 (
    echo Le site est deja en ligne.
    start http://localhost:8000
    timeout /t 2 >nul
    exit /b 0
)

echo Demarrage du serveur Fenemof...
start "" /min "C:\Users\divine\AppData\Local\Programs\Python\Python312\python.exe" server\server.py
timeout /t 3 >nul
echo Site en ligne !
start http://localhost:8000
echo.
echo Vous pouvez fermer cette fenetre, le site reste en ligne.
timeout /t 4 >nul
