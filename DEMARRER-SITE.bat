@echo off
title Serveur Fenemof
chcp 65001 >nul 2>&1
setlocal

REM === Config ===
set "BASE=C:\sedectous\Fenemof"
set "PORT=8000"
REM Detection python robuste
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=C:\Python313\python.exe"
if not exist "%PY%" set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"

echo [Fenemof] Verification du site...

REM Test si deja en ligne
powershell -NoProfile -Command "try { $r=Invoke-WebRequest 'http://127.0.0.1:%PORT%/health' -UseBasicParsing -TimeoutSec 3; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { try{ $r2=Invoke-WebRequest 'http://127.0.0.1:%PORT%/api/siteinfo' -UseBasicParsing -TimeoutSec 3; if($r2.StatusCode -eq 200){exit 0}else{exit 1}} catch{exit 1}}" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Le site est deja en ligne sur http://localhost:%PORT%
    start http://localhost:%PORT%
    timeout /t 2 >nul
    goto :ensure_watchdog
)

echo [DEMARRAGE] Lancement du serveur sur %PY%...
REM Tuer ancien zombie si port bloque mais muet
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { try{ Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }catch{} }" >nul 2>&1
timeout /t 1 >nul

REM Lancer serveur detache (sans fenetre)
powershell -NoProfile -Command "$env:PORT='%PORT%'; $env:HOST='0.0.0.0'; $env:PYTHONUNBUFFERED='1'; Start-Process -FilePath '%PY%' -ArgumentList 'server\server.py' -WorkingDirectory '%BASE%' -WindowStyle Hidden" >nul 2>&1

echo Attente demarrage (3s)...
timeout /t 3 >nul

REM Verification
powershell -NoProfile -Command "try { $r=Invoke-WebRequest 'http://127.0.0.1:%PORT%/health' -UseBasicParsing -TimeoutSec 5; if($r.StatusCode -eq 200){exit 0}else{exit 1}} catch{exit 1}" >nul 2>&1
if %errorlevel%==0 (
    echo [OK] Site en ligne ! http://localhost:%PORT%
    start http://localhost:%PORT%
) else (
    echo [ERREUR] Le serveur n'a pas demarre. Voir %BASE%\server\srv_err.log
    powershell -NoProfile -Command "Get-Content '%BASE%\server\srv_err.log' -Tail 20"
    pause
    exit /b 1
)

:ensure_watchdog
echo [WATCHDOG] Verification chien de garde...
powershell -NoProfile -Command "$t=Get-ScheduledTask -TaskName 'FenemofWatchdog' -ErrorAction SilentlyContinue; if(-not $t){ exit 1 } else { exit 0 }" >nul 2>&1
if %errorlevel%==1 (
    echo [WATCHDOG] Installation du chien de garde pour redemarrage auto...
    call "%BASE%\INSTALLER-AUTO.bat"
) else (
    REM Lancer watchdog si pas en cours
    powershell -NoProfile -Command "Get-Process | Where-Object { $_.CommandLine -like '*watchdog.py*' } | Measure-Object | ForEach-Object { if($_.Count -eq 0){ exit 1 } else { exit 0 } }" >nul 2>&1
    if %errorlevel%==1 (
        powershell -NoProfile -Command "$env:PORT='%PORT%'; Start-Process -FilePath '%PY%' -ArgumentList 'server\watchdog.py' -WorkingDirectory '%BASE%\server' -WindowStyle Hidden" >nul 2>&1
        echo [WATCHDOG] Relance.
    ) else (
        echo [WATCHDOG] Deja actif.
    )
)

echo.
echo Vous pouvez fermer cette fenetre, le site reste en ligne.
echo Le site redemarrera tout seul au prochain allumage du PC.
timeout /t 4 >nul
exit /b 0
