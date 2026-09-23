#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fenemof - Serveur web (bibliothèque standard Python uniquement)
Aucune installation requise. Lancer :  python3 server.py
"""

import os
import io
import json
import csv
import time
import uuid
import shutil
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default as email_policy
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
DATA_DIR = os.path.join(BASE_DIR, "data")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
LOGO_DIR = os.path.join(UPLOADS_DIR, "logo")
PHOTOS_DIR = os.path.join(UPLOADS_DIR, "photos")
PARTNERS_DIR = os.path.join(UPLOADS_DIR, "partners")
EDITIONS_DIR = os.path.join(UPLOADS_DIR, "editions")
CREATEUR_DIR = os.path.join(UPLOADS_DIR, "createur")
ELEVES_DIR = os.path.join(UPLOADS_DIR, "eleves")
COSUDO_DIR = os.path.join(UPLOADS_DIR, "cosudo")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")

DEFAULT_CONFIG = {
    "creator_password": "fenemof2026",
    "transaction_number": "064618646",
    "email": "fenemof@gmail.com",
    "phone": "064618646",
    "whatsapp": "064618646",
    "domaine": "fenemof.com",
    "location": "Congo Brazzaville, Massengo, Église Catholique",
    "site_name": "Fenemof",
    "logo": None,
    "montant_par_eleve": 1350,
    "edition_actuelle": "2026",
    "createur_nom": "",
    "createur_prenom": "",
    "createur_photo": None,
    "but_fenemof": "Fenemof est la Fédération Nationale de l'École Mère et de l'École Fille. "
                   "Elle unit les établissements scolaires des sections primaire, collège et lycée "
                   "pour promouvoir l'éducation, la solidarité et l'excellence en République du Congo.",
    "cosudo_nom": "Cosudo",
    "cosudo_but": "Cosudo est la plateforme d'inscription des sections collège, lycée et université. "
                  "Elle accompagne les étudiants et les établissements du supérieur vers l'excellence.",
    "cosudo_montant_par_eleve": 1350,
    "cosudo_transaction_number": "064618646",
}

LOCK = threading.Lock()

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"}
ALLOWED_DOC_EXT = ALLOWED_IMAGE_EXT | {".pdf", ".doc", ".docx", ".pptx", ".xlsx"}


# ----------------------------------------------------------------------------
# Gestion des fichiers de données
# ----------------------------------------------------------------------------
def load_json(path, default):
    with LOCK:
        if not os.path.exists(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return default


def save_json(path, data):
    with LOCK:
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)


def load_config():
    if not os.path.exists(CONFIG_PATH):
        save_json(CONFIG_PATH, DEFAULT_CONFIG)
        return dict(DEFAULT_CONFIG)
    cfg = load_json(CONFIG_PATH, {})
    merged = dict(DEFAULT_CONFIG)
    merged.update(cfg)
    return merged


def save_config(cfg):
    save_json(CONFIG_PATH, cfg)


def regs_path():
    return os.path.join(DATA_DIR, "registrations.json")


def anns_path():
    return os.path.join(DATA_DIR, "announcements.json")


def sess_path():
    return os.path.join(DATA_DIR, "session.json")


def partners_path():
    return os.path.join(DATA_DIR, "partners.json")


def editions_path():
    return os.path.join(DATA_DIR, "editions.json")


def historique_path():
    return os.path.join(DATA_DIR, "historique.json")


def partner_requests_path():
    return os.path.join(DATA_DIR, "partner_requests.json")


def meilleurs_eleves_path():
    return os.path.join(DATA_DIR, "meilleurs_eleves.json")


def ecoles_path():
    return os.path.join(DATA_DIR, "ecoles.json")


def cosudo_regs_path():
    return os.path.join(DATA_DIR, "cosudo_registrations.json")


def get_registrations():
    return load_json(regs_path(), [])


def get_announcements():
    return load_json(anns_path(), [])


def get_partners():
    return load_json(partners_path(), [])


def get_editions():
    return load_json(editions_path(), [])


def get_historique():
    return load_json(historique_path(), [])


def get_partner_requests():
    return load_json(partner_requests_path(), [])


def get_meilleurs_eleves():
    return load_json(meilleurs_eleves_path(), [])


def get_ecoles():
    return load_json(ecoles_path(), [])


def get_cosudo_registrations():
    return load_json(cosudo_regs_path(), [])


def faq_path():
    return os.path.join(DATA_DIR, "faq.json")


def get_faq():
    return load_json(faq_path(), [])


def log_action(action_type, detail):
    """Enregistre une action dans l'historique (limité aux 500 dernières)."""
    entry = {
        "id": str(uuid.uuid4()),
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "type": action_type,
        "detail": detail,
    }
    hist = get_historique()
    hist.insert(0, entry)
    save_json(historique_path(), hist[:500])


def get_token():
    return load_json(sess_path(), {}).get("token")


# ----------------------------------------------------------------------------
# Analyseur multipart/form-data (upload de fichiers)
# ----------------------------------------------------------------------------
def parse_multipart(content_type, body):
    """Retourne (champs, fichiers) où fichiers est une liste de dicts."""
    fields = {}
    files = []
    if "boundary=" not in content_type:
        return fields, files
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
    msg_bytes = (
        "Content-Type: multipart/form-data; boundary={}\r\n\r\n".format(boundary)
    ).encode("utf-8") + body
    msg = BytesParser(policy=email_policy).parsebytes(msg_bytes)
    for part in msg.iter_parts():
        cd = part.get("Content-Disposition")
        if cd is None:
            continue
        params = {}
        if hasattr(cd, "params"):
            params = cd.params or {}
        name = params.get("name")
        if name is None:
            continue
        filename = params.get("filename")
        payload = part.get_payload(decode=True)
        if payload is None:
            payload = b""
        if filename:
            files.append({"field": name, "filename": os.path.basename(filename), "data": payload})
        else:
            try:
                fields[name] = payload.decode("utf-8")
            except UnicodeDecodeError:
                fields[name] = payload.decode("latin-1", errors="replace")
    return fields, files


# ----------------------------------------------------------------------------
# Gestion des sessions / autorisation
# ----------------------------------------------------------------------------
def check_auth(handler):
    token = handler.headers.get("Authorization", "")
    if token.startswith("Bearer "):
        token = token[7:]
    return bool(token) and token == get_token()


def require_auth(handler):
    if not check_auth(handler):
        handler.send_json(401, {"error": "Non autorisé. Veuillez vous reconnecter."})
        return False
    return True


def send_json_error(handler, code, message):
    handler.send_json(code, {"error": message})


# ----------------------------------------------------------------------------
# Serveur HTTP
# ----------------------------------------------------------------------------
class FenemofHandler(BaseHTTPRequestHandler):
    server_version = "Fenemof/1.0"

    chat_memory = {}

    def log_message(self, fmt, *args):
        print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args))

    # ---- helpers -----------------------------------------------------------
    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(length) if length else b""

    def read_json_body(self):
        body = self.read_body()
        if not body:
            return {}
        try:
            return json.loads(body.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return {}

    def serve_static(self, relpath):
        safe = os.path.normpath(relpath).lstrip("/\\")
        if safe.startswith(".."):
            return self.send_json(400, {"error": "Chemin invalide"})
        filepath = os.path.join(PUBLIC_DIR, safe)
        if not os.path.isfile(filepath):
            self.send_error(404, "Fichier introuvable")
            return
        ctype = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
        }.get(os.path.splitext(filepath)[1].lower(), "application/octet-stream")
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def serve_upload(self, subdir, relpath):
        safe = os.path.normpath(relpath).lstrip("/\\")
        if safe.startswith(".."):
            return self.send_json(400, {"error": "Chemin invalide"})
        filepath = os.path.join(UPLOADS_DIR, subdir, safe)
        if not os.path.isfile(filepath):
            self.send_error(404, "Fichier introuvable")
            return
        ctype = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".bmp": "image/bmp",
            ".pdf": "application/pdf",
            ".doc": "application/msword",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }.get(os.path.splitext(filepath)[1].lower(), "application/octet-stream")
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    # ---- routes ------------------------------------------------------------
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/siteinfo":
            return self.api_siteinfo()
        if path == "/api/announcements":
            return self.api_public_announcements()
        if path == "/api/registrations":
            if require_auth(self):
                return self.api_registrations()
            return
        if path == "/api/cosudo-registrations":
            if require_auth(self):
                return self.api_cosudo_registrations()
            return
        if path == "/api/export":
            return self.api_export()
        if path == "/api/export-cosudo":
            return self.api_export_cosudo()
        if path == "/api/partner-requests":
            if require_auth(self):
                return self.api_partner_requests()
            return
        if path == "/api/historique":
            if require_auth(self):
                return self.api_historique()
            return
        if path == "/api/faq":
            if require_auth(self):
                return self.send_json(200, {"faq": get_faq()})
            return
        if path == "/api/backup":
            if require_auth(self):
                return self.api_backup()
            return

        if path.startswith("/uploads/logo/"):
            return self.serve_upload("logo", path[len("/uploads/logo/"):])
        if path.startswith("/uploads/photos/"):
            return self.serve_upload("photos", path[len("/uploads/photos/"):])
        if path.startswith("/uploads/partners/"):
            return self.serve_upload("partners", path[len("/uploads/partners/"):])
        if path.startswith("/uploads/editions/"):
            return self.serve_upload("editions", path[len("/uploads/editions/"):])
        if path.startswith("/uploads/createur/"):
            return self.serve_upload("createur", path[len("/uploads/createur/"):])
        if path.startswith("/uploads/eleves/"):
            return self.serve_upload("eleves", path[len("/uploads/eleves/"):])
        if path.startswith("/uploads/cosudo/"):
            return self.serve_upload("cosudo", path[len("/uploads/cosudo/"):])

        if path == "/" or path == "":
            return self.serve_static("index.html")
        if path == "/createur":
            return self.serve_static("createur.html")
        if path.startswith("/recu/"):
            return self.serve_static("recu.html")
        if path.startswith("/api/recu/"):
            return self.api_recu(path[len("/api/recu/"):])
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Endpoint inconnu"})

        return self.serve_static(path.lstrip("/"))

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/register":
            return self.api_register()
        if path == "/api/register-cosudo":
            return self.api_register_cosudo()
        if path == "/api/delete-cosudo-registration":
            if require_auth(self):
                return self.api_delete_cosudo_registration()
            return
        if path == "/api/upload-cosudo-photo":
            if require_auth(self):
                return self.api_upload_cosudo_photo()
            return
        if path == "/api/delete-cosudo-photo":
            if require_auth(self):
                return self.api_delete_cosudo_photo()
            return
        if path == "/api/login":
            return self.api_login()
        if path == "/api/announce":
            if require_auth(self):
                return self.api_create_announcement()
            return
        if path == "/api/delete-announce":
            if require_auth(self):
                return self.api_delete_announcement()
            return
        if path == "/api/upload-logo":
            if require_auth(self):
                return self.api_upload_logo()
            return
        if path == "/api/upload-photo":
            if require_auth(self):
                return self.api_upload_photo()
            return
        if path == "/api/delete-photo":
            if require_auth(self):
                return self.api_delete_photo()
            return
        if path == "/api/change-password":
            if require_auth(self):
                return self.api_change_password()
            return
        if path == "/api/delete-registration":
            if require_auth(self):
                return self.api_delete_registration()
            return
        if path == "/api/partner":
            if require_auth(self):
                return self.api_add_partner()
            return
        if path == "/api/delete-partner":
            if require_auth(self):
                return self.api_delete_partner()
            return
        if path == "/api/edition":
            if require_auth(self):
                return self.api_add_edition()
            return
        if path == "/api/delete-edition":
            if require_auth(self):
                return self.api_delete_edition()
            return
        if path == "/api/update-but":
            if require_auth(self):
                return self.api_update_but()
            return
        if path == "/api/update-cosudo":
            if require_auth(self):
                return self.api_update_cosudo()
            return
        if path == "/api/update-montant":
            if require_auth(self):
                return self.api_update_montant()
            return
        if path == "/api/partner-request":
            return self.api_partner_request()
        if path == "/api/partner-requests":
            if require_auth(self):
                return self.api_partner_requests()
            return
        if path == "/api/delete-partner-request":
            if require_auth(self):
                return self.api_delete_partner_request()
            return
        if path == "/api/meilleur-eleve":
            if require_auth(self):
                return self.api_add_meilleur_eleve()
            return
        if path == "/api/delete-meilleur-eleve":
            if require_auth(self):
                return self.api_delete_meilleur_eleve()
            return
        if path == "/api/ecole":
            if require_auth(self):
                return self.api_add_ecole()
            return
        if path == "/api/delete-ecole":
            if require_auth(self):
                return self.api_delete_ecole()
            return
        if path == "/api/createur-profile":
            if require_auth(self):
                return self.api_update_createur_profile()
            return
        if path == "/api/edition-photo":
            if require_auth(self):
                return self.api_add_edition_photo()
            return
        if path == "/api/delete-edition-photo":
            if require_auth(self):
                return self.api_delete_edition_photo()
            return
        if path == "/api/historique":
            if require_auth(self):
                return self.api_historique()
            return
        if path == "/api/update-edition-actuelle":
            if require_auth(self):
                return self.api_update_edition_actuelle()
            return
        if path == "/api/chat":
            return self.api_chat()
        if path == "/api/faq":
            if require_auth(self):
                return self.api_add_faq()
            return
        if path == "/api/delete-faq":
            if require_auth(self):
                return self.api_delete_faq()
            return
        if path == "/api/backup":
            if require_auth(self):
                return self.api_backup()
            return

        return self.send_json(404, {"error": "Endpoint inconnu"})

    # ---- API : info publique du site ---------------------------------------
    def api_siteinfo(self):
        cfg = load_config()
        photos = sorted(os.listdir(PHOTOS_DIR)) if os.path.isdir(PHOTOS_DIR) else []
        cosudo_photos = sorted(os.listdir(COSUDO_DIR)) if os.path.isdir(COSUDO_DIR) else []
        logo = cfg.get("logo")
        if logo and not os.path.isfile(os.path.join(LOGO_DIR, logo)):
            logo = None
        createur_photo = cfg.get("createur_photo")
        if createur_photo and not os.path.isfile(os.path.join(CREATEUR_DIR, createur_photo)):
            createur_photo = None
        meilleurs = get_meilleurs_eleves()
        for m in meilleurs:
            if m.get("photo") and not os.path.isfile(os.path.join(ELEVES_DIR, m["photo"])):
                m["photo"] = None
        self.send_json(200, {
            "site_name": cfg.get("site_name", "Fenemof"),
            "email": cfg.get("email", ""),
            "phone": cfg.get("phone", ""),
            "whatsapp": cfg.get("whatsapp", ""),
            "domaine": cfg.get("domaine", ""),
            "transaction_number": cfg.get("transaction_number", ""),
            "location": cfg.get("location", ""),
            "logo": "/uploads/logo/" + logo if logo else None,
            "photos": sorted(photos, reverse=True),
            "cosudo_photos": sorted(cosudo_photos, reverse=True),
            "cosudo_registrations_count": len(get_cosudo_registrations()),
            "cosudo_nom": cfg.get("cosudo_nom", "Cosudo"),
            "cosudo_but": cfg.get("cosudo_but", ""),
            "cosudo_montant_par_eleve": cfg.get("cosudo_montant_par_eleve", 0),
            "cosudo_transaction_number": cfg.get("cosudo_transaction_number", ""),
            "announcements": get_announcements(),
            "partners": get_partners(),
            "editions": get_editions(),
            "but_fenemof": cfg.get("but_fenemof", ""),
            "montant_par_eleve": cfg.get("montant_par_eleve", 0),
            "edition_actuelle": cfg.get("edition_actuelle", ""),
            "createur": {
                "nom": cfg.get("createur_nom", ""),
                "prenom": cfg.get("createur_prenom", ""),
                "photo": "/uploads/createur/" + createur_photo if createur_photo else None,
            },
            "meilleurs_eleves": meilleurs,
            "ecoles": get_ecoles(),
            "registrations_count": len(get_registrations()),
        })

    def api_public_announcements(self):
        self.send_json(200, {"announcements": get_announcements()})

    # ---- API : reçu ----------------------------------------------------------
    def build_receipt(self, reg, regs, cosudo=False):
        cfg = load_config()
        if cosudo:
            montant = int(cfg.get("cosudo_montant_par_eleve", 0) or 0)
        else:
            montant = int(cfg.get("montant_par_eleve", 0) or 0)
        nb_eleves = len(reg.get("eleves", []))
        total = montant * nb_eleves
        sections_set = set()
        for r in regs:
            if r.get("etablissement", "").strip().lower() == reg.get("etablissement", "").strip().lower():
                sections_set.add(r.get("section", ""))
        if reg.get("section"):
            sections_set.add(reg["section"])
        return {
            "numero": reg.get("id", "")[:8].upper(),
            "etablissement": reg.get("etablissement", ""),
            "telephone": reg.get("telephone", ""),
            "suivi": reg.get("suivi", ""),
            "section": reg.get("section", ""),
            "sections": sorted(sections_set),
            "nb_sections": len(sections_set),
            "nb_eleves": nb_eleves,
            "montant_par_eleve": montant,
            "total": total,
            "date": reg.get("date", ""),
            "paiement": reg.get("paiement", ""),
            "transaction": reg.get("transaction", ""),
        }

    def api_recu(self, rid):
        rid = rid.strip("/")
        regs = get_registrations()
        for r in regs:
            if r.get("id") == rid:
                return self.send_json(200, {"recu": self.build_receipt(r, regs)})
        cosudo_regs = get_cosudo_registrations()
        for r in cosudo_regs:
            if r.get("id") == rid:
                return self.send_json(200, {"recu": self.build_receipt(r, cosudo_regs, cosudo=True)})
        return send_json_error(self, 404, "Reçu introuvable.")

    # ---- API : inscription ---------------------------------------------------
    def api_register(self):
        data = self.read_json_body()

        required = [
            "etablissement", "telephone", "suivi", "section",
            "paiement", "transaction", "eleves",
        ]
        for key in required:
            if not data.get(key):
                return send_json_error(self, 400, "Le champ « {} » est obligatoire.".format(key))

        section = str(data["section"]).strip().lower()
        if section not in ("primaire", "college", "lycee"):
            return send_json_error(self, 400, "La section doit être primaire, college ou lycee.")

        eleves = data.get("eleves")
        if not isinstance(eleves, list) or len(eleves) < 1:
            return send_json_error(self, 400, "Ajoutez au moins un élève.")
        if len(eleves) > 6:
            return send_json_error(self, 400, "Maximum 6 élèves par inscription.")

        clean_eleves = []
        for i, e in enumerate(eleves, start=1):
            if not isinstance(e, dict):
                return send_json_error(self, 400, "Élève invalide n°{}.".format(i))
            nom = str(e.get("nom", "")).strip()
            prenom = str(e.get("prenom", "")).strip()
            age = str(e.get("age", "")).strip()
            classe = str(e.get("classe", "")).strip()
            sexe = str(e.get("sexe", "")).strip().lower()
            if not nom or not prenom:
                return send_json_error(self, 400, "Nom et prénom obligatoires pour l'élève n°{}.".format(i))
            if sexe not in ("masculin", "feminin"):
                return send_json_error(self, 400, "Le sexe de l'élève n°{} doit être masculin ou feminin.".format(i))
            clean_eleves.append({
                "nom": nom, "prenom": prenom,
                "age": age, "classe": classe, "sexe": sexe,
            })

        inscription = {
            "id": str(uuid.uuid4()),
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "etablissement": str(data["etablissement"]).strip(),
            "telephone": str(data["telephone"]).strip(),
            "suivi": str(data["suivi"]).strip(),
            "section": section,
            "paiement": str(data["paiement"]).strip(),
            "transaction": str(data["transaction"]).strip(),
            "eleves": clean_eleves,
            "statut": "en attente",
        }

        regs = get_registrations()
        regs.append(inscription)
        save_json(regs_path(), regs)

        log_action("Inscription", "Établissement « {} » — section {} — {} élève(s) (transaction {})".format(
            inscription["etablissement"], inscription["section"], len(clean_eleves), inscription["transaction"]))

        recu = self.build_receipt(inscription, regs)
        self.send_json(200, {
            "ok": True,
            "message": "Inscription enregistrée avec succès.",
            "id": inscription["id"],
            "recu": recu,
            "recu_url": "/recu/" + inscription["id"],
        })

    # ---- API : inscription Cosudo -----------------------------------------------
    def api_register_cosudo(self):
        data = self.read_json_body()

        required = [
            "etablissement", "telephone", "suivi", "section",
            "paiement", "transaction", "eleves",
        ]
        for key in required:
            if not data.get(key):
                return send_json_error(self, 400, "Le champ « {} » est obligatoire.".format(key))

        section = str(data["section"]).strip().lower()
        if section not in ("college", "lycee", "universite"):
            return send_json_error(self, 400, "La section Cosudo doit être college, lycee ou universite.")

        eleves = data.get("eleves")
        if not isinstance(eleves, list) or len(eleves) < 1:
            return send_json_error(self, 400, "Ajoutez au moins un élève.")
        if len(eleves) > 6:
            return send_json_error(self, 400, "Maximum 6 élèves par inscription.")

        clean_eleves = []
        for i, e in enumerate(eleves, start=1):
            if not isinstance(e, dict):
                return send_json_error(self, 400, "Élève invalide n°{}.".format(i))
            nom = str(e.get("nom", "")).strip()
            prenom = str(e.get("prenom", "")).strip()
            age = str(e.get("age", "")).strip()
            classe = str(e.get("classe", "")).strip()
            sexe = str(e.get("sexe", "")).strip().lower()
            if not nom or not prenom:
                return send_json_error(self, 400, "Nom et prénom obligatoires pour l'élève n°{}.".format(i))
            if sexe not in ("masculin", "feminin"):
                return send_json_error(self, 400, "Le sexe de l'élève n°{} doit être masculin ou feminin.".format(i))
            clean_eleves.append({
                "nom": nom, "prenom": prenom,
                "age": age, "classe": classe, "sexe": sexe,
            })

        inscription = {
            "id": str(uuid.uuid4()),
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "etablissement": str(data["etablissement"]).strip(),
            "telephone": str(data["telephone"]).strip(),
            "suivi": str(data["suivi"]).strip(),
            "section": section,
            "paiement": str(data["paiement"]).strip(),
            "transaction": str(data["transaction"]).strip(),
            "eleves": clean_eleves,
            "statut": "en attente",
        }

        regs = get_cosudo_registrations()
        regs.append(inscription)
        save_json(cosudo_regs_path(), regs)

        log_action("Inscription Cosudo", "Établissement « {} » — section {} — {} élève(s) (transaction {})".format(
            inscription["etablissement"], inscription["section"], len(clean_eleves), inscription["transaction"]))

        recu = self.build_receipt(inscription, regs, cosudo=True)
        self.send_json(200, {
            "ok": True,
            "message": "Inscription Cosudo enregistrée avec succès.",
            "id": inscription["id"],
            "recu": recu,
            "recu_url": "/recu/" + inscription["id"],
        })

    def api_cosudo_registrations(self):
        self.send_json(200, {"registrations": get_cosudo_registrations()})

    def api_delete_cosudo_registration(self):
        data = self.read_json_body()
        rid = str(data.get("id", ""))
        regs = get_cosudo_registrations()
        new_regs = [r for r in regs if r.get("id") != rid]
        if len(new_regs) == len(regs):
            return send_json_error(self, 404, "Inscription Cosudo introuvable.")
        save_json(cosudo_regs_path(), new_regs)
        log_action("Inscription Cosudo", "Inscription Cosudo supprimée")
        self.send_json(200, {"ok": True})

    # ---- API : photos Cosudo -------------------------------------------------------
    def api_upload_cosudo_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier reçu.")
        uploaded = []
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in ALLOWED_IMAGE_EXT:
                continue
            if len(f["data"]) > 15 * 1024 * 1024:
                continue
            fname = "cosudo_" + time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
            with open(os.path.join(COSUDO_DIR, fname), "wb") as out:
                out.write(f["data"])
            uploaded.append({"name": fname})
        if not uploaded:
            return send_json_error(self, 400, "Aucune image valide reçue.")
        log_action("Photos Cosudo", "{} photo(s) Cosudo ajoutée(s)".format(len(uploaded)))
        self.send_json(200, {"ok": True, "count": len(uploaded), "files": uploaded})

    def api_delete_cosudo_photo(self):
        data = self.read_json_body()
        fname = os.path.basename(str(data.get("name", "")))
        if not fname or fname in (".", ".."):
            return send_json_error(self, 400, "Nom de fichier invalide.")
        fpath = os.path.join(COSUDO_DIR, fname)
        if not os.path.isfile(fpath):
            return send_json_error(self, 404, "Photo introuvable.")
        try:
            os.remove(fpath)
        except OSError as exc:
            return send_json_error(self, 500, str(exc))
        log_action("Photos Cosudo", "Photo Cosudo supprimée : {}".format(fname))
        self.send_json(200, {"ok": True})

    # ---- API : authentification créateur --------------------------------------
    def api_login(self):
        data = self.read_json_body()
        password = str(data.get("password", ""))
        cfg = load_config()
        if password != cfg.get("creator_password", ""):
            return send_json_error(self, 401, "Mot de passe incorrect.")
        token = secrets.token_hex(32)
        save_json(sess_path(), {"token": token})
        self.send_json(200, {"ok": True, "token": token})

    # ---- API : annonces --------------------------------------------------------
    def api_create_announcement(self):
        data = self.read_json_body()
        text = str(data.get("texte", "")).strip()
        if not text:
            return send_json_error(self, 400, "Le texte de l'annonce est vide.")
        ann = {
            "id": str(uuid.uuid4()),
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "texte": text[:2000],
        }
        anns = get_announcements()
        anns.insert(0, ann)
        save_json(anns_path(), anns)
        log_action("Annonce", "Annonce publiée : « {} »".format(ann["texte"][:60]))
        self.send_json(200, {"ok": True, "announcement": ann})

    def api_delete_announcement(self):
        data = self.read_json_body()
        ann_id = str(data.get("id", ""))
        anns = get_announcements()
        new_anns = [a for a in anns if a.get("id") != ann_id]
        if len(new_anns) == len(anns):
            return send_json_error(self, 404, "Annonce introuvable.")
        save_json(anns_path(), new_anns)
        log_action("Annonce", "Annonce supprimée")
        self.send_json(200, {"ok": True})

    # ---- API : upload logo --------------------------------------------------------
    def api_upload_logo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier reçu.")
        f = files[0]
        ext = os.path.splitext(f["filename"])[1].lower()
        if ext not in ALLOWED_IMAGE_EXT:
            return send_json_error(self, 400, "Format d'image non supporté (jpg, png, gif, webp, svg).")
        if len(f["data"]) > 5 * 1024 * 1024:
            return send_json_error(self, 400, "Image trop volumineuse (max 5 Mo).")

        # retire l'ancien logo
        cfg = load_config()
        old = cfg.get("logo")
        if old:
            old_path = os.path.join(LOGO_DIR, old)
            if os.path.isfile(old_path):
                try:
                    os.remove(old_path)
                except OSError:
                    pass

        fname = "logo" + ext
        with open(os.path.join(LOGO_DIR, fname), "wb") as out:
            out.write(f["data"])
        cfg["logo"] = fname
        save_config(cfg)
        log_action("Logo", "Logo du site mis à jour")
        self.send_json(200, {"ok": True, "logo": "/uploads/logo/" + fname})

    # ---- API : photos d'événements -------------------------------------------------
    def api_upload_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier reçu.")
        caption = fields.get("caption", "")
        uploaded = []
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in ALLOWED_IMAGE_EXT:
                continue
            if len(f["data"]) > 15 * 1024 * 1024:
                continue
            fname = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
            with open(os.path.join(PHOTOS_DIR, fname), "wb") as out:
                out.write(f["data"])
            uploaded.append({"name": fname, "caption": caption})
        if not uploaded:
            return send_json_error(self, 400, "Aucune image valide reçue.")
        log_action("Photos", "{} photo(s) d'événement ajoutée(s)".format(len(uploaded)))
        self.send_json(200, {"ok": True, "count": len(uploaded), "files": uploaded})

    def api_delete_photo(self):
        data = self.read_json_body()
        fname = os.path.basename(str(data.get("name", "")))
        if not fname or fname in (".", ".."):
            return send_json_error(self, 400, "Nom de fichier invalide.")
        fpath = os.path.join(PHOTOS_DIR, fname)
        if not os.path.isfile(fpath):
            return send_json_error(self, 404, "Photo introuvable.")
        try:
            os.remove(fpath)
        except OSError as exc:
            return send_json_error(self, 500, str(exc))
        log_action("Photos", "Photo d'événement supprimée : {}".format(fname))
        self.send_json(200, {"ok": True})

    # ---- API : mot de passe ----------------------------------------------------------
    def api_change_password(self):
        data = self.read_json_body()
        newp = str(data.get("new_password", ""))
        if len(newp) < 4:
            return send_json_error(self, 400, "Le mot de passe doit avoir au moins 4 caractères.")
        cfg = load_config()
        cfg["creator_password"] = newp
        save_config(cfg)
        log_action("Sécurité", "Mot de passe créateur modifié")
        self.send_json(200, {"ok": True})

    # ---- API : registrations ------------------------------------------------------------
    def api_registrations(self):
        self.send_json(200, {"registrations": get_registrations()})

    def api_delete_registration(self):
        data = self.read_json_body()
        rid = str(data.get("id", ""))
        regs = get_registrations()
        new_regs = [r for r in regs if r.get("id") != rid]
        if len(new_regs) == len(regs):
            return send_json_error(self, 404, "Inscription introuvable.")
        save_json(regs_path(), new_regs)
        log_action("Inscription", "Inscription supprimée")
        self.send_json(200, {"ok": True})

    # ---- API : partenaires / sponsors -----------------------------------------------
    def api_add_partner(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        nom = fields.get("nom", "").strip()
        description = fields.get("description", "").strip()
        if not nom:
            return send_json_error(self, 400, "Le nom du partenaire est obligatoire.")
        logo_name = None
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in ALLOWED_IMAGE_EXT and len(f["data"]) <= 5 * 1024 * 1024:
                logo_name = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
                with open(os.path.join(PARTNERS_DIR, logo_name), "wb") as out:
                    out.write(f["data"])
                break
        partner = {
            "id": str(uuid.uuid4()),
            "nom": nom,
            "description": description,
            "logo": logo_name,
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        partners = get_partners()
        partners.insert(0, partner)
        save_json(partners_path(), partners)
        log_action("Partenaire", "Partenaire ajouté : {}".format(nom))
        self.send_json(200, {"ok": True, "partner": partner})

    def api_delete_partner(self):
        data = self.read_json_body()
        pid = str(data.get("id", ""))
        partners = get_partners()
        new_partners = []
        for p in partners:
            if p.get("id") == pid:
                if p.get("logo"):
                    lp = os.path.join(PARTNERS_DIR, os.path.basename(p["logo"]))
                    if os.path.isfile(lp):
                        try:
                            os.remove(lp)
                        except OSError:
                            pass
            else:
                new_partners.append(p)
        if len(new_partners) == len(partners):
            return send_json_error(self, 404, "Partenaire introuvable.")
        save_json(partners_path(), new_partners)
        log_action("Partenaire", "Partenaire supprimé")
        self.send_json(200, {"ok": True})

    # ---- API : éditions -----------------------------------------------------------------
    def api_add_edition(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        titre = fields.get("titre", "").strip()
        description = fields.get("description", "").strip()
        annee = fields.get("annee", "").strip() or fields.get("edition_actuelle", "").strip()
        if not titre:
            return send_json_error(self, 400, "Le titre de l'édition est obligatoire.")
        photo = None
        doc = None
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if len(f["data"]) > 20 * 1024 * 1024:
                continue
            fname = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
            if ext in ALLOWED_IMAGE_EXT and photo is None:
                photo = fname
            elif ext in (".pdf", ".doc", ".docx", ".pptx", ".xlsx") and doc is None:
                doc = fname
            else:
                continue
            with open(os.path.join(EDITIONS_DIR, fname), "wb") as out:
                out.write(f["data"])
        if photo is None:
            return send_json_error(self, 400, "Joignez au moins une photo pour l'édition.")
        edition = {
            "id": str(uuid.uuid4()),
            "annee": annee or str(time.localtime().tm_year),
            "titre": titre,
            "description": description,
            "photo": photo,
            "photos": [],
            "fichier": doc,
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        editions = get_editions()
        editions.insert(0, edition)
        save_json(editions_path(), editions)
        log_action("Édition", "Édition ajoutée : {} ({})".format(titre, edition["annee"]))
        self.send_json(200, {"ok": True, "edition": edition})

    def api_delete_edition(self):
        data = self.read_json_body()
        eid = str(data.get("id", ""))
        editions = get_editions()
        new_editions = []
        for e in editions:
            if e.get("id") == eid:
                for key in ("photo", "fichier"):
                    f = e.get(key)
                    if f:
                        fp = os.path.join(EDITIONS_DIR, os.path.basename(f))
                        if os.path.isfile(fp):
                            try:
                                os.remove(fp)
                            except OSError:
                                pass
                for ph in e.get("photos", []):
                    fp = os.path.join(EDITIONS_DIR, os.path.basename(ph))
                    if os.path.isfile(fp):
                        try:
                            os.remove(fp)
                        except OSError:
                            pass
            else:
                new_editions.append(e)
        if len(new_editions) == len(editions):
            return send_json_error(self, 404, "Édition introuvable.")
        save_json(editions_path(), new_editions)
        log_action("Édition", "Édition supprimée")
        self.send_json(200, {"ok": True})

    # ---- API : but de Fenemof et montant par élève -----------------------------------------
    def api_update_but(self):
        data = self.read_json_body()
        texte = str(data.get("texte", "")).strip()
        if not texte:
            return send_json_error(self, 400, "Écrivez le but de Fenemof.")
        cfg = load_config()
        cfg["but_fenemof"] = texte[:3000]
        save_config(cfg)
        log_action("Site", "But de Fenemof modifié")
        self.send_json(200, {"ok": True, "but_fenemof": cfg["but_fenemof"]})

    def api_update_cosudo(self):
        data = self.read_json_body()
        cfg = load_config()
        if data.get("cosudo_nom"):
            cfg["cosudo_nom"] = str(data["cosudo_nom"]).strip()[:100]
        if data.get("cosudo_but"):
            cfg["cosudo_but"] = str(data["cosudo_but"]).strip()[:3000]
        if data.get("cosudo_transaction_number"):
            cfg["cosudo_transaction_number"] = str(data["cosudo_transaction_number"]).strip()[:30]
        if "cosudo_montant_par_eleve" in data:
            try:
                montant = int(float(str(data["cosudo_montant_par_eleve"]).replace(" ", "")))
            except ValueError:
                return send_json_error(self, 400, "Montant Cosudo invalide.")
            if montant < 0 or montant > 100000000:
                return send_json_error(self, 400, "Montant Cosudo invalide.")
            cfg["cosudo_montant_par_eleve"] = montant
        save_config(cfg)
        log_action("Cosudo", "Cosudo configuré (nom « {} », montant {} FCFA)".format(
            cfg.get("cosudo_nom", ""), cfg.get("cosudo_montant_par_eleve", 0)))
        self.send_json(200, {
            "ok": True,
            "cosudo_nom": cfg.get("cosudo_nom", ""),
            "cosudo_but": cfg.get("cosudo_but", ""),
            "cosudo_montant_par_eleve": cfg.get("cosudo_montant_par_eleve", 0),
            "cosudo_transaction_number": cfg.get("cosudo_transaction_number", ""),
        })

    def api_update_montant(self):
        data = self.read_json_body()
        try:
            montant = int(float(str(data.get("montant_par_eleve", "0")).replace(" ", "")))
        except ValueError:
            return send_json_error(self, 400, "Montant invalide.")
        if montant < 0 or montant > 100000000:
            return send_json_error(self, 400, "Montant invalide.")
        cfg = load_config()
        cfg["montant_par_eleve"] = montant
        save_config(cfg)
        log_action("Site", "Montant par élève modifié : {} FCFA".format(montant))
        self.send_json(200, {"ok": True, "montant_par_eleve": montant})

    # ---- API : nouvel ensemble de fonctionnalités (demandes, élève, écoles,
    #      profil créateur, photos par édition, historique, assistant IA) -----------------
    def api_partner_request(self):
        data = self.read_json_body()
        nom = str(data.get("nom", "")).strip()
        organisation = str(data.get("organisation", "")).strip()
        telephone = str(data.get("telephone", "")).strip()
        message = str(data.get("message", "")).strip()
        if not nom:
            return send_json_error(self, 400, "Votre nom est obligatoire.")
        req = {
            "id": str(uuid.uuid4()),
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "nom": nom,
            "organisation": organisation,
            "telephone": telephone,
            "message": message,
        }
        reqs = get_partner_requests()
        reqs.insert(0, req)
        save_json(partner_requests_path(), reqs)
        log_action("Partenaire", "Demande de partenariat reçue : {}".format(nom))
        self.send_json(200, {"ok": True, "message": "Votre demande de partenariat a bien été envoyée."})

    def api_partner_requests(self):
        self.send_json(200, {"requests": get_partner_requests()})

    def api_delete_partner_request(self):
        data = self.read_json_body()
        rid = str(data.get("id", ""))
        reqs = get_partner_requests()
        new_reqs = [r for r in reqs if r.get("id") != rid]
        if len(new_reqs) == len(reqs):
            return send_json_error(self, 404, "Demande introuvable.")
        save_json(partner_requests_path(), new_reqs)
        log_action("Partenaire", "Demande de partenariat supprimée")
        self.send_json(200, {"ok": True})

    def api_add_meilleur_eleve(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        nom = fields.get("nom", "").strip()
        prenom = fields.get("prenom", "").strip()
        age = fields.get("age", "").strip()
        classe = fields.get("classe", "").strip()
        ecole = fields.get("ecole", "").strip()
        annee = fields.get("annee", "").strip() or str(time.localtime().tm_year)
        if not nom or not prenom:
            return send_json_error(self, 400, "Nom et prénom de l'élève obligatoires.")
        photo = None
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in ALLOWED_IMAGE_EXT and len(f["data"]) <= 8 * 1024 * 1024:
                photo = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
                with open(os.path.join(ELEVES_DIR, photo), "wb") as out:
                    out.write(f["data"])
                break
        elv = {
            "id": str(uuid.uuid4()),
            "annee": annee,
            "nom": nom,
            "prenom": prenom,
            "age": age,
            "classe": classe,
            "ecole": ecole,
            "photo": photo,
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        eleves = get_meilleurs_eleves()
        eleves.insert(0, elv)
        save_json(meilleurs_eleves_path(), eleves)
        log_action("Meilleur élève", "Meilleur élève {} {} ({}) ajouté".format(prenom, nom, annee))
        self.send_json(200, {"ok": True, "eleve": elv})

    def api_delete_meilleur_eleve(self):
        data = self.read_json_body()
        eid = str(data.get("id", ""))
        eleves = get_meilleurs_eleves()
        new_eleves = []
        for e in eleves:
            if e.get("id") == eid:
                if e.get("photo"):
                    fp = os.path.join(ELEVES_DIR, os.path.basename(e["photo"]))
                    if os.path.isfile(fp):
                        try:
                            os.remove(fp)
                        except OSError:
                            pass
            else:
                new_eleves.append(e)
        if len(new_eleves) == len(eleves):
            return send_json_error(self, 404, "Meilleur élève introuvable.")
        save_json(meilleurs_eleves_path(), new_eleves)
        log_action("Meilleur élève", "Meilleur élève supprimé")
        self.send_json(200, {"ok": True})

    def api_add_ecole(self):
        data = self.read_json_body()
        nom = str(data.get("nom", "")).strip()
        section = str(data.get("section", "")).strip()
        if not nom:
            return send_json_error(self, 400, "Le nom de l'école est obligatoire.")
        ecole = {
            "id": str(uuid.uuid4()),
            "nom": nom,
            "section": section,
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        ecoles = get_ecoles()
        ecoles.insert(0, ecole)
        save_json(ecoles_path(), ecoles)
        log_action("Écoles", "École participante ajoutée : {}".format(nom))
        self.send_json(200, {"ok": True, "ecole": ecole})

    def api_delete_ecole(self):
        data = self.read_json_body()
        eid = str(data.get("id", ""))
        ecoles = get_ecoles()
        new_ecoles = [e for e in ecoles if e.get("id") != eid]
        if len(new_ecoles) == len(ecoles):
            return send_json_error(self, 404, "École introuvable.")
        save_json(ecoles_path(), new_ecoles)
        log_action("Écoles", "École participante supprimée")
        self.send_json(200, {"ok": True})

    def api_update_createur_profile(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        cfg = load_config()
        if fields.get("nom"):
            cfg["createur_nom"] = fields.get("nom", "").strip()[:100]
        if fields.get("prenom"):
            cfg["createur_prenom"] = fields.get("prenom", "").strip()[:100]
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in ALLOWED_IMAGE_EXT and len(f["data"]) <= 8 * 1024 * 1024:
                old = cfg.get("createur_photo")
                if old:
                    oldp = os.path.join(CREATEUR_DIR, old)
                    if os.path.isfile(oldp):
                        try:
                            os.remove(oldp)
                        except OSError:
                            pass
                fname = "createur" + ext
                with open(os.path.join(CREATEUR_DIR, fname), "wb") as out:
                    out.write(f["data"])
                cfg["createur_photo"] = fname
                break
        save_config(cfg)
        log_action("Profil", "Profil du créateur mis à jour")
        self.send_json(200, {"ok": True, "photo": cfg.get("createur_photo")})

    def api_add_edition_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        annee = fields.get("annee", "").strip()
        if not annee:
            return send_json_error(self, 400, "Indiquez l'année de l'édition.")
        editions = get_editions()
        edition = None
        for e in editions:
            if str(e.get("annee", "")) == annee:
                edition = e
                break
        if edition is None:
            return send_json_error(self, 400, "Aucune édition trouvée pour l'année {}.".format(annee))
        added = 0
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in ALLOWED_IMAGE_EXT or len(f["data"]) > 15 * 1024 * 1024:
                continue
            fname = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
            with open(os.path.join(EDITIONS_DIR, fname), "wb") as out:
                out.write(f["data"])
            edition.setdefault("photos", []).append(fname)
            added += 1
        if not added:
            return send_json_error(self, 400, "Aucune photo valide reçue.")
        save_json(editions_path(), editions)
        log_action("Édition", "{} photo(s) ajoutée(s) à l'édition {}".format(added, annee))
        self.send_json(200, {"ok": True, "count": added})

    def api_delete_edition_photo(self):
        data = self.read_json_body()
        annee = str(data.get("annee", "")).strip()
        photo = str(data.get("photo", "")).strip()
        editions = get_editions()
        found = False
        for e in editions:
            if str(e.get("annee", "")) == annee and photo in e.get("photos", []):
                e["photos"] = [p for p in e["photos"] if p != photo]
                fp = os.path.join(EDITIONS_DIR, os.path.basename(photo))
                if os.path.isfile(fp):
                    try:
                        os.remove(fp)
                    except OSError:
                        pass
                found = True
                break
        if not found:
            return send_json_error(self, 404, "Photo introuvable.")
        save_json(editions_path(), editions)
        log_action("Édition", "Photo supprimée de l'édition {}".format(annee))
        self.send_json(200, {"ok": True})

    def api_update_edition_actuelle(self):
        data = self.read_json_body()
        annee = str(data.get("edition_actuelle", "")).strip()
        if not annee:
            return send_json_error(self, 400, "Indiquez l'année de l'édition actuelle.")
        cfg = load_config()
        cfg["edition_actuelle"] = annee[:10]
        save_config(cfg)
        log_action("Édition", "Édition actuelle définie : {}".format(annee))
        self.send_json(200, {"ok": True, "edition_actuelle": annee})

    def api_historique(self):
        self.send_json(200, {"historique": get_historique()})

    # ---- Sauvegarde complète des données dans un compte/archive -----------------------
    def api_backup(self):
        def _list(d):
            return sorted(os.listdir(d)) if os.path.isdir(d) else []
        backup = {
            "outil": "Fenemof — sauvegarde complète",
            "cree_le": time.strftime("%Y-%m-%d %H:%M:%S"),
            "config": load_config(),
            "registrations": get_registrations(),
            "cosudo_registrations": get_cosudo_registrations(),
            "announcements": get_announcements(),
            "partners": get_partners(),
            "editions": get_editions(),
            "historique": get_historique(),
            "partner_requests": get_partner_requests(),
            "meilleurs_eleves": get_meilleurs_eleves(),
            "ecoles": get_ecoles(),
            "faq": get_faq(),
            "uploads": {
                "logo": _list(LOGO_DIR),
                "photos": _list(PHOTOS_DIR),
                "partners": _list(PARTNERS_DIR),
                "editions": _list(EDITIONS_DIR),
                "createur": _list(CREATEUR_DIR),
                "eleves": _list(ELEVES_DIR),
                "cosudo": _list(COSUDO_DIR),
            },
        }
        backup_dir = os.path.join(BASE_DIR, "backups")
        try:
            os.makedirs(backup_dir, exist_ok=True)
            fname = "backup_" + time.strftime("%Y%m%d_%H%M%S") + ".json"
            with open(os.path.join(backup_dir, fname), "w", encoding="utf-8") as f:
                json.dump(backup, f, ensure_ascii=False, indent=2)
        except OSError as exc:
            return send_json_error(self, 500, "Impossible de créer la sauvegarde : " + str(exc))
        log_action("Sauvegarde", "Sauvegarde complète créée : " + fname)
        self.send_json(200, {"ok": True, "fichier": fname, "date": backup["cree_le"]})

    # ---- Assistant IA conversationnel (comme un vrai chat, en texte) -----------------
    def normalize_text(self, text):
        import unicodedata
        t = unicodedata.normalize("NFD", text.lower())
        t = "".join(c for c in t if not unicodedata.combining(c))
        return t.replace("'", " ").replace("'", " ").replace("-", " ")

    @staticmethod
    def fmt_montant(n):
        try:
            return "{:,}".format(int(n)).replace(",", " ") + " FCFA"
        except (TypeError, ValueError):
            return "—"

    def chat_data(self):
        cfg = load_config()
        return {
            "montant": self.fmt_montant(cfg.get("montant_par_eleve", 0)),
            "montant_n": int(cfg.get("montant_par_eleve", 0) or 0),
            "phone": cfg.get("phone", ""),
            "whatsapp": cfg.get("whatsapp", ""),
            "email": cfg.get("email", ""),
            "loc": cfg.get("location", ""),
            "transac": cfg.get("transaction_number", ""),
            "domaine": cfg.get("domaine", ""),
            "edition": cfg.get("edition_actuelle", ""),
            "ecoles": get_ecoles(),
            "editions": get_editions(),
            "meilleurs": get_meilleurs_eleves(),
            "partners": get_partners(),
            "annonces": get_announcements(),
        }

    def build_intents(self, D):
        montant, phone, whatsapp, email = D["montant"], D["phone"], D["whatsapp"], D["email"]
        loc, transac, domaine, edition = D["loc"], D["transac"], D["domaine"], D["edition"]
        n_ecoles = len(D["ecoles"])
        n_editions = len(D["editions"])
        mn = D["montant_n"]

        def rep_meilleur(D):
            if not D["meilleurs"]:
                return "Le meilleur élève de l'édition actuelle sera annoncé sur la page d'accueil dès sa publication. 🏆"
            m = D["meilleurs"][0]
            parts = ["Le meilleur élève de l'édition {} est {} {}.".format(m.get("annee", "?"), m.get("prenom", ""), m.get("nom", ""))]
            if m.get("age"):
                parts.append("{} ans".format(m["age"]))
            if m.get("classe"):
                parts.append("en {}".format(m["classe"]))
            if m.get("ecole"):
                parts.append("de {}".format(m["ecole"]))
            return " ".join(parts)

        def rep_ecoles(D):
            if not D["ecoles"]:
                return "Les écoles participantes seront bientôt listées ici. Les inscriptions sont déjà ouvertes !"
            noms = ", ".join(str(e.get("nom", "")) for e in D["ecoles"][:8])
            more = " ..." if n_ecoles > 8 else ""
            return "{} école(s) participante(s) actuellement : {}{}. Pour rejoindre, inscrivez votre établissement sur la page d'accueil.".format(n_ecoles, noms, more)

        def rep_editions(D):
            if not D["editions"]:
                return "La première édition est en préparation. L'édition actuelle est l'édition {}.".format(edition or "2026")
            annees = ", ".join(str(e.get("annee", "?")) for e in D["editions"][:6])
            more = " ..." if n_editions > 6 else ""
            return "{} édition(s) au total ({}{}). L'édition actuelle est l'édition {}. Les photos et le meilleur élève de chaque édition sont sur la page d'accueil.".format(n_editions, annees, more, edition or "2026")

        def rep_part(D):
            if not D["partners"]:
                return "Vous pouvez devenir partenaire/sponsor de Fenemof via le formulaire « Devenir partenaire » sur la page d'accueil, ou en nous écrivant sur WhatsApp au {}.".format(whatsapp)
            noms = ", ".join(str(p.get("nom", "")) for p in D["partners"][:6])
            return "Nos partenaires : {}. Vous voulez nous rejoindre ? Remplissez le formulaire « Devenir partenaire » ou écrivez-nous sur WhatsApp au {}.".format(noms, whatsapp)

        def rep_annonces(D):
            if not D["annonces"]:
                return "Aucune annonce pour le moment. Les activités seront annoncées sur le site et sur WhatsApp au {}.".format(whatsapp)
            top = " / ".join(str(a.get("texte", ""))[:80] for a in D["annonces"][:3])
            return "Les dernières annonces : {}. Suivez aussi nos annonces sur WhatsApp au {}.".format(top, whatsapp)

        def rep_montant(D):
            ex = self.fmt_montant(3 * mn) if mn else "—"
            return "Le montant est de {} par élève. Le total est calculé automatiquement : nombre d'élèves × {}. Par exemple, 3 élèves = {}. Vous payez par MTN Money (*126#) ou Airtel Money (*123#) au numéro {}.".format(montant, montant, ex, transac)

        intents = [
            ("salutation", {"bonjour":2,"salut":2,"hello":2,"bonsoir":2,"bjr":1,"slt":1,"salutations":1},
             "Bonjour et bienvenue chez Fenemof ! 👋 Je suis l'assistant du site. Je peux vous renseigner sur les inscriptions, le paiement MTN/Airtel, les sections, les reçus, les éditions, le meilleur élève et les partenaires. Que souhaitez-vous savoir ?"),
            ("ca_va", {"comment ca va":2,"comment tu vas":2,"ca va":1,"tu vas bien":1,"ca va bien":1},
             "Je vais très bien, merci de demander ! 😊 Et vous, comment allez-vous ?"),
            ("qui_es_tu", {"qui es tu":2,"tu es qui":2,"qui etes vous":2,"presente toi":2,"presentation":1,"es tu un robot":1,"es tu reel":1},
             "Je suis l'assistant virtuel de Fenemof 🤖. Je discute avec vous en texte et je connais tout sur le site : inscriptions, paiements, sections, reçus, éditions, meilleur élève, partenaires et écoles. Posez-moi n'importe quelle question !"),
            ("aide", {"que peux tu faire":2,"que sais tu faire":2,"comment ca marche":1,"aide moi":1,"aidez moi":1,"aide":1},
             "Je peux vous aider avec :\n1) L'inscription d'un établissement 📋\n2) Le paiement par MTN/Airtel 💳\n3) Les sections (primaire, collège, lycée) 🏫\n4) Le reçu automatique 🧾\n5) Les éditions et le meilleur élève 🏆\n6) Les partenaires et écoles 🤝\nDemandez-moi par exemple : « Comment inscrire mon établissement ? »"),
            ("fenemof", {"c est quoi fenemof":2,"presente fenemof":2,"qu est ce que fenemof":2,"qu est ce que c est":1,"c est quoi":1},
             "Fenemof est une organisation qui unit les écoles mères et les écoles filles du Congo, à Massengo (Brazzaville, Église Catholique). Elle organise à chaque édition les inscriptions des établissements par section (primaire, collège, lycée), récompense le meilleur élève et fédère la communauté éducative. Vous pouvez tout savoir sur la page d'accueil."),
            ("inscription", {"inscription":2,"inscrire":2,"s inscrire":2,"adherer":1,"enregistrer":1,"comment inscrire":4,"inscrire mon":3,"inscrire un":3,"inscrire mon etablissement":6,"comment inscrire mon etablissement":7,"je veux inscrire":4},
             "Pour inscrire votre établissement :\n1) Ouvrez la page d'accueil et allez dans la section « Inscription » 📋\n2) Renseignez le nom de l'établissement, le téléphone et le suivi\n3) Choisissez la section (primaire, collège ou lycée)\n4) Ajoutez les élèves (nom, prénom, âge, sexe, classe)\n5) Payez par MTN Money ou Airtel Money\nUn reçu automatique s'affiche à la fin ! 🧾"),
            ("montant", {"montant":4,"combien":3,"prix":3,"tarif":3,"combien coute":4,"cout":3,"coût":3,"frais":3,"c est combien":3,"quel est le montant":5,"montant de l inscription":6,"combien je paye":4,"payer":2,"paye":1,"paiement":2},
             rep_montant),
            ("paiement", {"mtn":2,"airtel":2,"mobile money":2,"money":2,"momo":2,"transfert":1,"transaction":1,"payer":2,"paiement":2,"envoyer l argent":2,"comment payer":4,"comment payer par mtn":5,"paiement par mtn":5},
             "Les paiements se font par MTN Money (*126#) ou Airtel Money (*123#) : composez le code, choisissez « Envoyer de l'argent », envoyez le montant au numéro {} puis notez le numéro de transaction. Indiquez-le dans le formulaire d'inscription. C'est rapide et sécurisé ! 💳".format(transac)),
            ("recu", {"recu":3,"reçu":3,"facture":2,"justificatif":2,"attestation":1,"mon recu":4,"obtenir le recu":5,"avoir le recu":5,"ou est mon recu":5,"mon reçu":4},
             "Votre reçu s'affiche automatiquement juste après l'inscription 🧾. Il contient : le numéro du reçu, le nom de l'établissement, les sections, le nombre d'élèves, le montant par élève, le total à payer et la date. Vous pouvez l'imprimer ou l'enregistrer en PDF depuis la page du reçu."),
            ("section", {"section":2,"primaire":2,"college":2,"lycee":2,"lycée":2,"classe":1,"niveau":1,"les sections":3},
             "Fenemof compte 3 sections : Primaire, Collège et Lycée 🏫. Lors de l'inscription, vous choisissez votre section et vous ajoutez vos élèves (nom, prénom, âge, sexe, classe)."),
            ("eleves", {"eleve":2,"élève":2,"mes eleves":3,"ajouter un eleve":4,"combien d eleves":4,"nombre d eleves":3,"eleves":2},
             "Lors de l'inscription, vous ajoutez vos élèves avec leur nom, prénom, âge, sexe et classe. Le total se calcule automatiquement ({} par élève). Vous pouvez enregistrer plusieurs élèves en une seule inscription.".format(montant)),
            ("ecoles", {"ecoles":2,"école":2,"liste des ecoles":4,"combien d ecoles":4,"nombre d ecoles":3,"ecole participante":3,"ecoles participantes":3},
             rep_ecoles),
            ("editions", {"edition":3,"édition":3,"editions":3,"édition actuelle":4,"les editions":3,"quelles editions":4,"competition":2,"compétition":2,"concours":2,"annee":1,"année":1},
             rep_editions),
            ("meilleur", {"meilleur eleve":5,"meilleur élève":5,"laureat":3,"lauréat":3,"recompense":2,"récompense":2,"le meilleur":3,"prix du meilleur":4},
             rep_meilleur),
            ("partenaire", {"partenaire":3,"partenariat":3,"sponsor":3,"devenir partenaire":4,"parrain":2,"donateur":2,"mecene":2,"mécène":2,"aider fenemof":3,"finance":1},
             rep_part),
            ("annonces", {"annonce":3,"annonces":3,"evenement":2,"événement":2,"activite":2,"activité":2,"quand":1,"date":1,"jour":1,"a quelle date":3,"prochaine activite":3},
             rep_annonces),
            ("adresse", {"adresse":2,"ou etes vous":2,"ou se trouve":3,"ou se situe":3,"localisation":2,"massengo":3,"brazzaville":2,"congo":1,"eglise catholique":2},
             "Nous sommes situés à Massengo, Brazzaville, au Congo (Église Catholique). Adresse : {}. Vous trouverez aussi la localisation sur la page d'accueil.".format(loc)),
            ("contact", {"contact":2,"telephone":2,"téléphone":2,"numero":2,"numéro":2,"appeler":2,"votre numero":3,"donne moi le numero":4,"comment vous contacter":4,"me joindre":3},
             "Vous pouvez nous joindre au {} ou par e-mail à {}. Pour une réponse rapide, écrivez-nous sur WhatsApp au {}.".format(phone, email, whatsapp)),
            ("whatsapp", {"whatsapp":3,"whats app":3},
             "Vous pouvez nous écrire sur WhatsApp au {} (lien direct : https://wa.me/{}). C'est le moyen le plus rapide pour nous joindre !".format(whatsapp, whatsapp)),
            ("email", {"email":2,"mail":2,"courriel":1,"adresse mail":3,"votre email":3},
             "Notre adresse e-mail est : {}. Nous vous répondons dans les plus brefs délais.".format(email)),
            ("site", {"site":2,"siteweb":2,"site web":3,"domaine":2,"lien du site":3,"fenemof com":2,"fenemof.com":2,"adresse du site":4},
             "Le site officiel de Fenemof est accessible à l'adresse {}. Vous y trouverez les inscriptions, les paiements, les reçus, les éditions et toutes les actualités.".format(domaine)),
            ("but", {"but":2,"mission":2,"objectif":2,"valeur":1,"education":2,"éducation":2,"solidarite":2,"excellence":2,"promouvoir":1},
             "Le but de Fenemof est d'unir les écoles mères et les écoles filles du Congo pour promouvoir l'éducation, la solidarité et l'excellence. Chaque édition, les établissements s'inscrivent par section et le meilleur élève est récompensé 🏆."),
            ("remerciement", {"merci":2,"merci beaucoup":3,"remercie":2,"je te remercie":3,"c est parfait":1,"super":1,"genial":1,"génial":1,"parfait":1,"ok":1},
             "Avec plaisir ! 😊 Si vous avez d'autres questions, je suis là. Pour une aide rapide, écrivez-nous sur WhatsApp au {}.".format(whatsapp)),
            ("adieu", {"au revoir":3,"a plus":2,"bye":2,"a bientot":3,"bonne journee":3,"bonne nuit":3,"a demain":3},
             "Au revoir ! 👋 Merci de votre passage sur Fenemof. Revenez quand vous voulez, je suis toujours là pour vous aider."),
            ("galerie", {"galerie":2,"photo":2,"photos des evenements":4,"album":2,"images":1},
             "Vous pouvez voir les photos des événements et des éditions dans les sections « Galerie » et « Nos éditions » de la page d'accueil 📸."),
            ("insulte", {"con":1,"idiot":1,"stupide":1,"nul":1,"debile":1,"débile":1,"ferme ta":1,"ta geule":1},
             "Je comprends votre frustration 😅. Dites-moi plutôt ce que vous cherchez : inscription, paiement, reçu... et je vous aiderai tout de suite !"),
            ("nom", {"je m appelle":4,"je m'appelle":4,"mon nom est":4,"moi c est":3,"appelle moi":3,"appelez moi":3}, None),
        ]
        return intents

    def api_chat(self):
        data = self.read_json_body()
        question = str(data.get("question", "")).strip()
        if not question:
            return send_json_error(self, 400, "Posez une question.")
        session = str(data.get("session", ""))[:64]
        historique = data.get("historique") or []
        if not isinstance(historique, list):
            historique = []

        norm = self.normalize_text(question)
        D = self.chat_data()
        memo = self.chat_memory.setdefault(session, {"nom": None, "dernier": None})

        import re as _re
        name_match = _re.search(r"(?:je m appelle|je m'appelle|mon nom est|moi c est)\s+([a-zàâäéèêëîïôöùûüç]+)", question.lower())
        if not name_match:
            for turn in reversed(historique):
                if isinstance(turn, dict) and turn.get("role") == "user":
                    nm = _re.search(r"(?:je m appelle|je m'appelle|mon nom est|moi c est)\s+([a-zàâäéèêëîïôöùûüç]+)", str(turn.get("content", "")).lower())
                    if nm:
                        name_match = nm
                        break
        if name_match:
            memo["nom"] = name_match.group(1).capitalize()

        if not memo.get("dernier"):
            for turn in reversed(historique):
                if isinstance(turn, dict) and turn.get("role") == "assistant" and turn.get("content"):
                    memo["dernier"] = str(turn["content"])
                    break

        def est_suivi(n):
            courts = {"oui","non","combien","et","et alors","pourquoi","comment","c est combien","je sais","ca marche","bon","alors","donne moi","encore","mais","et puis","apres","ensuite"}
            if n in courts:
                return True
            if len(n) <= 18 and (n.startswith("et ") or n.startswith("et pour") or n.endswith("?")):
                for k in ("inscription","montant","recu","reçu","section","paiement","ecole","école","edition","édition","partenaire","meilleur"):
                    if k in n:
                        return False
                return True
            return False

        faq_custom = [("custom", {self.normalize_text(f.get("question", "")): 5}, f.get("reponse", "")) for f in get_faq() if f.get("question")]

        best = None
        best_score = 0
        best_mots = 0
        for intent in self.build_intents(D) + faq_custom:
            score = 0
            matched = 0
            for mot, w in intent[1].items():
                nm = self.normalize_text(mot)
                if nm and nm in norm:
                    score += w
                    matched += len(nm.split())
            if score > best_score or (score == best_score and matched > best_mots):
                best_score = score
                best_mots = matched
                best = intent

        reponse = None
        if best is not None and best_score > 0:
            if est_suivi(norm) and best_score <= 1 and memo.get("dernier"):
                reponse = memo["dernier"]
            elif best[0] == "nom":
                if memo.get("nom"):
                    reponse = "Enchanté de faire votre connaissance, {} ! 😊 Je suis l'assistant de Fenemof. Que puis-je faire pour vous ?".format(memo["nom"])
                else:
                    reponse = "Et vous, quel est votre prénom ? Je suis l'assistant de Fenemof, je peux vous aider pour les inscriptions, les paiements et les reçus."
            elif best[0] == "remerciement" and memo.get("nom"):
                reponse = "Avec plaisir, {} ! 😊 Si vous avez d'autres questions, je suis là. Pour une aide rapide, écrivez-nous sur WhatsApp au {}.".format(memo["nom"], D["whatsapp"])
            elif best[0] == "salutation" and memo.get("nom"):
                reponse = "Bonjour {} ! 👋 Comment puis-je vous aider ? Je connais tout sur les inscriptions, les paiements MTN/Airtel, les sections et les reçus.".format(memo["nom"])
            else:
                reponse = best[2](D) if callable(best[2]) else best[2]
            memo["dernier"] = reponse

        if reponse is None:
            reponse = "Je n'ai pas bien compris votre question 🤔. Vous pouvez me demander :\n• « Comment inscrire mon établissement ? »\n• « Quel est le montant de l'inscription ? »\n• « Comment payer par MTN ? »\n• « Où est mon reçu ? »\n• « Qui est le meilleur élève ? »\n\nOu écrivez-nous directement sur WhatsApp au {}.".format(D["whatsapp"])

        self.send_json(200, {"reponse": reponse, "session": session})

    def api_add_faq(self):
        data = self.read_json_body()
        question = str(data.get("question", "")).strip()
        reponse = str(data.get("reponse", "")).strip()
        if not question or not reponse:
            return send_json_error(self, 400, "La question et la réponse sont obligatoires.")
        entry = {
            "id": str(uuid.uuid4()),
            "question": question[:300],
            "reponse": reponse[:1500],
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        faq = get_faq()
        faq.insert(0, entry)
        save_json(faq_path(), faq)
        log_action("Assistant IA", "Nouvelle question IA ajoutée : {}".format(question[:50]))
        self.send_json(200, {"ok": True, "faq": entry})

    def api_delete_faq(self):
        data = self.read_json_body()
        fid = str(data.get("id", ""))
        faq = get_faq()
        new_faq = [f for f in faq if f.get("id") != fid]
        if len(new_faq) == len(faq):
            return send_json_error(self, 404, "Question introuvable.")
        save_json(faq_path(), new_faq)
        log_action("Assistant IA", "Question IA supprimée")
        self.send_json(200, {"ok": True})

    # ---- API : export CSV -------------------------------------------------------------------
    def api_export(self):
        regs = get_registrations()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Date", "Établissement", "Téléphone établissement", "Personnel de suivi",
            "Section", "Mode de paiement", "N° transaction", "Élève n°",
            "Nom", "Prénom", "Âge", "Sexe", "Classe", "Statut",
        ])
        for r in regs:
            for i, e in enumerate(r.get("eleves", []), start=1):
                writer.writerow([
                    r.get("date", ""), r.get("etablissement", ""),
                    r.get("telephone", ""), r.get("suivi", ""),
                    r.get("section", ""), r.get("paiement", ""),
                    r.get("transaction", ""), i,
                    e.get("nom", ""), e.get("prenom", ""),
                    e.get("age", ""), e.get("sexe", ""), e.get("classe", ""),
                    r.get("statut", ""),
                ])
        data = buf.getvalue().encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="fenemof_etablissements.csv"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    # ---- API : export CSV Cosudo -------------------------------------------------------
    def api_export_cosudo(self):
        regs = get_cosudo_registrations()
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Date", "Établissement", "Téléphone établissement", "Personnel de suivi",
            "Section", "Mode de paiement", "N° transaction", "Élève n°",
            "Nom", "Prénom", "Âge", "Sexe", "Classe", "Statut",
        ])
        for r in regs:
            for i, e in enumerate(r.get("eleves", []), start=1):
                writer.writerow([
                    r.get("date", ""), r.get("etablissement", ""),
                    r.get("telephone", ""), r.get("suivi", ""),
                    r.get("section", ""), r.get("paiement", ""),
                    r.get("transaction", ""), i,
                    e.get("nom", ""), e.get("prenom", ""),
                    e.get("age", ""), e.get("sexe", ""), e.get("classe", ""),
                    r.get("statut", ""),
                ])
        data = buf.getvalue().encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="cosudo_etablissements.csv"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(os.environ.get("PORT", "8000"))
    for d in (DATA_DIR, LOGO_DIR, PHOTOS_DIR, PARTNERS_DIR, EDITIONS_DIR, CREATEUR_DIR, ELEVES_DIR, COSUDO_DIR):
        os.makedirs(d, exist_ok=True)
    load_config()
    server = ThreadingHTTPServer(("0.0.0.0", port), FenemofHandler)
    print("=" * 60)
    print("  FENEMOF - Site web démarré")
    print("  Ouvrez le site : http://localhost:{}".format(port))
    print("  Sur un autre appareil du même réseau, utilisez l'adresse IP de ce PC")
    print("  Espace créateur : http://localhost:{}/createur".format(port))
    print("  Appuyez sur Ctrl+C pour arrêter.")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArrêt du serveur.")
        server.shutdown()


if __name__ == "__main__":
    main()
