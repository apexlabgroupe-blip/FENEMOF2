# Guide Publication Fenemof — en ligne 24h/24

Ton site tourne déjà en local sur `http://localhost:8000` et `http://192.168.1.67:8000` (corrigé avec watchdog + autostart).

Pour le rendre accessible **sur internet pour tout le monde**, 2 méthodes :

---

## Méthode 1 — Instantanée (2 min) : Tunnel Cloudflare
> Idéal pour partager tout de suite. Ton PC doit rester allumé.

1. Double-clic `DEMARRER-SITE.bat` (vérifie que `http://localhost:8000/health` répond `{"ok":true}`)
2. Double-clic `server\fenemof-tunnel.bat`
3. Garde la fenêtre ouverte → il affiche une URL du type `https://xxxx-xxxxx.trycloudflare.com`
4. Partage cette URL : c'est ton site public !

**Avantages :** gratuit, 0 config, HTTPS automatique  
**Inconvénient :** URL change à chaque redémarrage, PC doit rester allumé. Pour une URL fixe, crée un tunnel Cloudflare gratuit sur https://one.dash.cloudflare.com → Zero Trust → Networks → Tunnels.

---

## Méthode 2 — Permanente (10 min) : Hébergement gratuit Render
> Ton site reste en ligne même PC éteint. Recommandé.

### Prérequis
- Compte GitHub (https://github.com)
- Compte Render (https://render.com) → "Sign up with GitHub"
- Git installé : https://git-scm.com/download/win

### Étapes

#### A. Préparer le projet (déjà fait)
Fichiers déjà prêts :
- `render.yaml` → `healthCheckPath: /health`, `HOST=0.0.0.0`, `PORT=10000`
- `server/server.py` écoute `0.0.0.0:$PORT`
- `requirements.txt` vide (bibliothèque standard uniquement, rien à installer)

#### B. Mettre sur GitHub
```bash
# Dans C:\sedectous\Fenemof
git init
git add .
git commit -m "Fenemof prêt pour publication"
# Crée un repo vide sur github.com (ex: DELL/fenemof), puis :
git remote add origin https://github.com/TON_USER/fenemof.git
git branch -M main
git push -u origin main
```

#### C. Déployer sur Render
1. Sur https://dashboard.render.com → **New +** → **Blueprint** → connecte ton repo `fenemof`
2. Render détecte `render.yaml` automatiquement → clique **Apply**
3. Attends 2-3 min : status passe à **Live** → URL du type `https://fenemof.onrender.com`
4. Teste : `https://fenemof.onrender.com/health` doit renvoyer `{"ok":true}`

#### D. Domaine personnalisé (optionnel, si tu as fenemof.com)
Render → ton service → **Settings** → **Custom Domains** → ajoute `fenemof.com` + `www.fenemof.com` → mets les DNS indiqués chez ton registrar.

#### E. Données (important)
Render efface le SQLite à chaque redéploiement (disque éphémère). 2 solutions :
- **Gratuit simple** : accepte remise à zéro à chaque deploy (ok pour test)
- **Persistant** : Render → **New+ → Disk** (1GB gratuit) monté sur `/opt/render/project/src/data` + `/opt/render/project/src/uploads`, ou migrer vers Postgres (Render Add-on).

---

## Quelle méthode choisir ?
| Besoin | Choix |
|---|---|
| Partager vite à un client / école | Méthode 1 Tunnel |
| Site officiel permanent | Méthode 2 Render |
| Les 2 | Fais 1 maintenant, puis 2 quand prêt |

---

## Vérification après publication
Ouvre en navigation privée :
- `https://TON_URL/` → page d'accueil
- `https://TON_URL/health` → `{"ok":true}`
- `https://TON_URL/api/siteinfo` → JSON avec `site_name` Fenemof

Si besoin d'aide : envoie ton nom GitHub et je te génère les commandes exactes, ou dis "publie avec tunnel" / "publie avec Render" et je lance les étapes.
