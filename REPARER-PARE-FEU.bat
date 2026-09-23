@echo off
:: A executer en tant qu'administrateur (clic droit > Executer en tant qu'admin)
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Relance en administrateur...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b 0
)
echo Ouverture pare-feu port 8000...
netsh advfirewall firewall delete rule name="Fenemof-8000" >nul 2>&1
netsh advfirewall firewall add rule name="Fenemof-8000" dir=in action=allow protocol=TCP localport=8000 profile=private,public
echo OK - Pare-feu configure
pause
