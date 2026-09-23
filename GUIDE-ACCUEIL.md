# MON GUIDE — Modifier mon site moi-même

Tout se modifie dans **VS Code** : enregistrez avec `Ctrl+S`, actualisez le
navigateur, c'est en ligne. **Aucun redémarrage nécessaire.**

⚠️ **Pour voir le site, ouvrez toujours http://localhost:8000 dans le
navigateur** (pas le fichier index.html directement : la page afficherait
« impossible d'obtenir » car elle a besoin du serveur).

---

## 1. Les textes de l'accueil → `public/index.html`

L'accueil est **tout en haut du fichier, lignes 42 à 69** (section `hero`) :

| Ligne | Ce que c'est |
|---|---|
| 45 | Le GRAND titre (`<h1>...</h1>`) |
| 47 | La phrase sous le titre |
| 48 | L'adresse affichée |
| 50-54 | Le paragraphe d'explication |

**Astuce couleur** : gardez `<span class="accent">...</span>` autour de la partie
du titre à voir en doré.

⚠️ Ne supprimez pas les balises `<` `>` qui entourent votre texte.

---

## 2. Contacts, montants, liens → `config.json`

| Clé | Ce que ça change |
|---|---|
| `"but_fenemof"` | Texte de la section « Notre but » |
| `"location"` | Adresse affichée |
| `"phone"` / `"email"` / `"whatsapp"` | Contacts |
| `"montant_par_section"` | Prix Fenemof par section (3300) |
| `"cosudo_montant_par_section"` | Prix Cosudo (2200) |
| `"cosudo_payment_link_lycee"` / `"..._universite"` | Liens paiement Cosudo |
| `"payment_link_1_section"` / `_2_` / `_3_` | Liens paiement Fenemof |

---

## 3. Les images → dossier `public/img/`

| Fichier | Où il apparaît |
|---|---|
| `logo.png` | Logo du menu |
| `cosudo-logo.*` | Logo Cosudo |
| `eleves/e1.jpg … e6.jpg` | Photos « La vie à Fenemof » |

Remplacez le fichier en gardant **le même nom**.
Logo et arrière-plan : aussi changeables dans le panneau créateur du site.

---

## 4. Les couleurs → `public/style.css`

Tout en haut du fichier :

```css
--accent: #d4af37;   /* couleur principale */
```

---

## 5. Lancer et voir le site

1. VS Code → menu **Terminal → Exécuter la tâche…** → **« SITE : tout en un »**
2. Ouvrez **http://localhost:8000** dans le navigateur

Téléphones (même Wi-Fi) : http://192.168.1.69:8000

*(Si le serveur s'arrête, le chien de garde le relance tout seul.)*
