# -*- coding: utf-8 -*-
"""Chien de garde Fenemof : verifie le serveur toutes les 10 secondes et le
relance automatiquement s'il ne repond plus. Journal : watchdog.log"""

import subprocess
import sys
import time
import os
import urllib.request
import urllib.error

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVER_DIR = os.path.join(BASE, "server")
LOG = os.path.join(SERVER_DIR, "watchdog.log")
PORT = int(os.environ.get("PORT", "8000"))
# Detection robuste du python
PY_CANDIDATES = [
    sys.executable.replace("pythonw.exe", "python.exe"),
    r"C:\Python314\python.exe",
    r"C:\Python313\python.exe",
    r"C:\Python312\python.exe",
    r"C:\Users\DELL\AppData\Local\Programs\Python\Python314\python.exe",
    r"C:\Users\DELL\AppData\Local\Microsoft\WindowsApps\python.exe",
]
PY = None
for cand in PY_CANDIDATES:
    if cand and os.path.isfile(cand):
        PY = cand
        break
if not PY:
    PY = sys.executable  # fallback

MAX_LOG_SIZE = 2 * 1024 * 1024  # 2 Mo max

def journal(msg):
    ligne = time.strftime("[%Y-%m-%d %H:%M:%S] ") + msg
    print(ligne, flush=True)
    try:
        # rotation simple
        if os.path.isfile(LOG) and os.path.getsize(LOG) > MAX_LOG_SIZE:
            try:
                os.rename(LOG, LOG + ".old")
            except OSError:
                pass
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(ligne + "\n")
    except OSError:
        pass


def serveur_ok():
    for url in [f"http://127.0.0.1:{PORT}/health", f"http://127.0.0.1:{PORT}/api/siteinfo"]:
        try:
            r = urllib.request.urlopen(url, timeout=4)
            if r.status == 200:
                return True
        except Exception:
            continue
    return False


def tuer_zombie():
    """Tue un processus eventuel qui occupe le port sans repondre."""
    cmd = ("Get-NetTCPConnection -LocalPort %d -State Listen -ErrorAction SilentlyContinue | "
           "ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" % PORT)
    subprocess.run(["powershell", "-NoProfile", "-Command", cmd],
                   capture_output=True, timeout=20)


def demarrer():
    # Cherche un python valide
    python_exe = PY
    if not os.path.isfile(python_exe):
        # dernier recours : python dans PATH
        python_exe = "python"
    flags = 0x00000008  # DETACHED_PROCESS
    # CreationFlags + pas de fenetre
    out_path = os.path.join(SERVER_DIR, "srv_err.log")
    # rotation srv_err.log si trop gros (>5Mo)
    try:
        if os.path.isfile(out_path) and os.path.getsize(out_path) > 5*1024*1024:
            # garde 2000 dernieres lignes
            with open(out_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            with open(out_path, "w", encoding="utf-8") as f:
                f.writelines(lines[-2000:])
    except Exception:
        pass
    out = open(out_path, "a", encoding="utf-8", errors="replace")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PORT"] = str(PORT)
    env["HOST"] = "0.0.0.0"
    subprocess.Popen([python_exe, "server.py"], cwd=SERVER_DIR,
                     stdout=out, stderr=subprocess.STDOUT,
                     creationflags=flags, env=env)
    journal(f"Demarrage avec {python_exe} sur port {PORT}")


journal(f"=== Chien de garde demarre (PY={PY} PORT={PORT}) ===")
time.sleep(5)  # laisser le temps au serveur normal de demarrer si lance en meme temps
consecutive_failures = 0
while True:
    if serveur_ok():
        consecutive_failures = 0
    else:
        consecutive_failures += 1
        # 2 echecs consecutifs avant de relancer (evite les faux positifs)
        if consecutive_failures < 2:
            journal(f"Serveur muet (tentative {consecutive_failures}/2) - re-test dans 10s")
            time.sleep(10)
            continue
        journal("Serveur muet -> reparation automatique")
        try:
            tuer_zombie()
        except Exception as e:
            journal("kill zombie: " + repr(e))
        time.sleep(2)
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
                consecutive_failures = 0
                break
        else:
            journal("Serveur toujours muet apres relance - nouvel essai au prochain cycle")
    time.sleep(10)
