@echo off
title Fenemof - Tunnel Internet
echo ================================
echo  TUNNEL INTERNET FENEMOF
echo  Laisse cette fenetre ouverte !
echo ================================
"C:\Users\divine\AppData\Local\Temp\opencode\cloudflared.exe" tunnel --url http://localhost:8000
actif
