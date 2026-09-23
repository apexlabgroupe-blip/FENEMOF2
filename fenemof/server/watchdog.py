# -*- coding: utf-8 -*-
"""Chien de garde Fenemof : verifie le serveur toutes les 10 secondes et le
relance automatiquement s'il ne repond plus. Journal : watchdog.log"""

import subprocess
import sys
import time
import os
import urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(BASE, "server")
LOG = os.path.join(SERVER_DIR, "watchdog.log")
PORT = 8000
PY = sys.executable.replace("pythonw.exe", "python.exe")


def journal(msg):
    ligne = time.strftime("[%Y-%m-%d %H:%M:%S] ") + msg
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(ligne + "\n")
    except OSError:
        pass


def serveur_ok():
    try:
        r = urllib.request.urlopen("http://127.0.0.1:%d/api/siteinfo" % PORT, timeout=4)
        return r.status == 200
    except Exception:
        return False


def tuer_zombie():
    """Tue un processus eventuel qui occupe le port sans repondre."""
    cmd = ("Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue | "
           "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" % PORT)
    subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                   capture_output=True, timeout=20)


def demarrer():
    flags = 0x00000008  # DETACHED_PROCESS
    out = open(os.path.join(SERVER_DIR, "srv_err.log"), "a")
    subprocess.Popen([PY, "server.py"], cwd=SERVER_DIR,
                     stdout=out, stderr=subprocess.STDOUT,
                     creationflags=flags)


journal("=== Chien de garde demarre ===")
time.sleep(5)  # laisser le temps au serveur normal de demarrer si lance en meme temps
while True:
    if serveur_ok():
        pass  # tout va bien
    else:
        journal("Serveur muet -> reparation automatique")
        try:
            tuer_zombie()
        except Exception as e:
            journal("kill zombie: " + repr(e))
        time.sleep(1)
        try:
            demarrer()
            journal("Relance effectuee, attente du retour...")
        except Exception as e:
            journal("echec relance: " + repr(e))
        # attendre la remontee avant le prochain cycle
        for _ in range(6):
            time.sleep(10)
            if serveur_ok():
                journal("Serveur de nouveau en ligne")
                break
    time.sleep(10)
