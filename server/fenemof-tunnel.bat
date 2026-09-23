@echo off
chcp 65001 >nul 2>&1
title Fenemof - Tunnel Internet
echo ================================
echo  TUNNEL INTERNET FENEMOF
echo  Laisse cette fenetre ouverte !
echo ================================
echo.
REM Verifie que le site local tourne
powershell -NoProfile -Command "try { Invoke-WebRequest 'http://127.0.0.1:8000/health' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Le site local ne tourne pas. Lance d'abord DEMARRER-SITE.bat
    pause
    exit /b 1
)
echo [OK] Site local detecte sur http://localhost:8000
echo.

REM Cherche cloudflared
set "CF=C:\Users\%USERNAME%\AppData\Local\Temp\opencode\cloudflared.exe"
if not exist "%CF%" set "CF=cloudflared"
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    if not exist "%CF%" (
        echo Telechargement de cloudflared...
        powershell -NoProfile -Command "Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CF%'"
    )
)
echo Lancement du tunnel...
echo Ton site sera accessible via une URL https://xxxx.trycloudflare.com
echo Garde cette fenetre ouverte !
echo.
"%CF%" tunnel --url http://localhost:8000
pause
