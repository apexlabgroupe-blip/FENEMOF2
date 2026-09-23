@echo off
chcp 65001 >nul 2>&1
setlocal
title Installer Fenemof Auto-Start

set "BASE=C:\sedectous\Fenemof"
set "PY=C:\Python314\python.exe"
if not exist "%PY%" set "PY=C:\Python313\python.exe"
if not exist "%PY%" set "PY=C:\Python312\python.exe"
if not exist "%PY%" set "PY=python"
set "PORT=8000"

echo ========================================
echo  FENEMOF - Installation auto-demarrage
echo ========================================
echo.

REM Verif admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Relance en administrateur...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

echo [1/4] Ajout Python au PATH...
powershell -NoProfile -Command "$p='C:\Python314'; $envPath=[Environment]::GetEnvironmentVariable('Path','Machine'); if($envPath -notlike \"*$p*\"){ [Environment]::SetEnvironmentVariable('Path', $envPath+';'+$p+';'+$p+'\Scripts','Machine'); Write-Host 'PATH mis a jour' } else { Write-Host 'PATH deja OK' }"

echo [2/4] Regle pare-feu port %PORT%...
netsh advfirewall firewall delete rule name="Fenemof-8000" >nul 2>&1
netsh advfirewall firewall add rule name="Fenemof-8000" dir=in action=allow protocol=TCP localport=%PORT% profile=private,public >nul
if %errorlevel%==0 (echo    Pare-feu OK) else (echo    Pare-feu deja configure ou erreur)

echo [3/4] Creation tache planifiee : FenemofServeur (au demarrage)...
schtasks /delete /tn "FenemofServeur" /f >nul 2>&1
schtasks /create /tn "FenemofServeur" /tr "powershell -NoProfile -WindowStyle Hidden -Command \"\$env:PORT='%PORT%'; \$env:HOST='0.0.0.0'; \$env:PYTHONUNBUFFERED='1'; Start-Process -FilePath '%PY%' -ArgumentList 'server\server.py' -WorkingDirectory '%BASE%' -WindowStyle Hidden\"" /sc onlogon /ru "%USERNAME%" /rl highest /f >nul
if %errorlevel%==0 (echo    Tache FenemofServeur creee) else (echo    Erreur creation FenemofServeur)

echo       + Tache au demarrage systeme (ONSTART)...
schtasks /delete /tn "FenemofServeur-Boot" /f >nul 2>&1
schtasks /create /tn "FenemofServeur-Boot" /tr "powershell -NoProfile -WindowStyle Hidden -Command \"Start-Sleep 15; \$env:PORT='%PORT%'; \$env:HOST='0.0.0.0'; \$env:PYTHONUNBUFFERED='1'; Start-Process -FilePath '%PY%' -ArgumentList 'server\server.py' -WorkingDirectory '%BASE%' -WindowStyle Hidden\"" /sc onstart /ru "SYSTEM" /rl highest /f >nul 2>&1
if %errorlevel%==0 (echo    Tache Boot creee) else (echo    Tache Boot: peut necessiter ajustement manuel)

echo [4/4] Creation tache planifiee : FenemofWatchdog (toutes les 2 min)...
schtasks /delete /tn "FenemofWatchdog" /f >nul 2>&1
schtasks /create /tn "FenemofWatchdog" /tr "powershell -NoProfile -WindowStyle Hidden -Command \"\$env:PORT='%PORT%'; Start-Process -FilePath '%PY%' -ArgumentList 'server\watchdog.py' -WorkingDirectory '%BASE%\server' -WindowStyle Hidden\"" /sc minute /mo 2 /ru "%USERNAME%" /rl highest /f >nul
if %errorlevel%==0 (echo    Tache Watchdog creee) else (echo    Erreur creation Watchdog)

echo.
echo [DEMARRAGE IMMEDIAT]
call :start_now
goto :fin

:start_now
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 1 >nul
powershell -NoProfile -Command "$env:PORT='%PORT%'; $env:HOST='0.0.0.0'; $env:PYTHONUNBUFFERED='1'; Start-Process -FilePath '%PY%' -ArgumentList 'server\server.py' -WorkingDirectory '%BASE%' -WindowStyle Hidden" >nul 2>&1
timeout /t 3 >nul
powershell -NoProfile -Command "$env:PORT='%PORT%'; Start-Process -FilePath '%PY%' -ArgumentList 'server\watchdog.py' -WorkingDirectory '%BASE%\server' -WindowStyle Hidden" >nul 2>&1
echo    Serveur + Watchdog lances.
exit /b 0

:fin
echo.
echo ========================================
echo  Installation terminee !
echo  - Le site se lance au demarrage du PC
echo  - Le Watchdog verifie toutes les 2 min
echo  - URL: http://localhost:%PORT%
echo ========================================
powershell -NoProfile -Command "try{ Invoke-WebRequest 'http://127.0.0.1:%PORT%/health' -UseBasicParsing -TimeoutSec 4 | Select-Object -ExpandProperty Content; Write-Host 'Health: OK' }catch{ Write-Host 'Health: attente...' }"
pause
exit /b 0
