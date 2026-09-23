#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fenemof - Serveur web (SQLite + biblioth\u00e8que standard Python uniquement)
S\u00e9curis\u00e9 : hachage des mots de passe, rate limiting, validation des entr\u00e9es,
requ\u00eates param\u00e9tr\u00e9es (anti-injection SQL), CORS strict.
Lancer :  python3 server.py
"""

import os
import io
import json
import uuid
import time
import secrets
import hashlib
import threading
import re
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from email.parser import BytesParser
from email.policy import default as email_policy
from urllib.parse import urlparse, parse_qs

import database as db

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
    "creator_password": "12345",
    "creator_token": "",
    "transaction_number": "064618646",
    "email": "fenemof@gmail.com",
    "phone": "064618646",
    "whatsapp": "064618646",
    "domaine": "fenemof.com",
    "location": "Congo Brazzaville, Massengo, \u00c9glise Catholique",
    "site_name": "Fenemof",
    "logo": None,
    "montant_par_eleve": 1350,
    "edition_actuelle": "2026",
    "createur_nom": "",
    "createur_prenom": "",
    "createur_photo": None,
    "but_fenemof": "Fenemof est la F\u00e9d\u00e9ration Nationale de l'\u00c9cole M\u00e8re et de l'\u00c9cole Fille. "
                   "Elle unit les \u00e9tablissements scolaires des sections primaire, coll\u00e8ge et lyc\u00e9e "
                   "pour promouvoir l'\u00e9ducation, la solidarit\u00e9 et l'excellence en R\u00e9publique du Congo.",
    "cosudo_nom": "Cosudo",
    "cosudo_but": "",
    "cosudo_montant_par_eleve": 1350,
    "cosudo_transaction_number": "",
}

SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none';",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), clipboard-write=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}

MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW = 300
MAX_CONTENT_LENGTH = 16 * 1024 * 1024


def _sanitize(text: str, max_len: int = 5000) -> str:
    if not text:
        return ""
    text = text.strip()
    return re.sub(r'[^\w\s\u00c0-\u024f\-\'\",.?:;!()\/]', '', text)[:max_len]


def _validate_int(text: str, min_val: int = 0, max_val: int = 10_000_000) -> int:
    try:
        n = int(float(str(text).replace(" ", "")))
        if min_val <= n <= max_val:
            return n
    except (ValueError, TypeError):
        pass
    return None


def _get_client_ip(handler) -> str:
    try:
        return handler.headers.get("X-Forwarded-For", handler.headers.get("CF-Connecting-IP", handler.client_address[0] if hasattr(handler, "client_address") else ""))
    except Exception:
        return ""


def _check_auth(handler) -> bool:
    token = handler.headers.get("X-Creator-Token", "")
    if not token or len(token) < 20:
        return False
    stored = db.get_creator_token()
    return stored and secrets.compare_digest(token, stored)


def send_json_error(handler, code, message):
    handler.send_json(code, {"error": message})


# ---- Multipart parser ----
def parse_multipart(content_type, body):
    fields = {}
    files = []
    if "boundary=" not in content_type:
        return fields, files
    boundary = content_type.split("boundary=", 1)[1].strip().strip('"')
    msg_bytes = ("Content-Type: multipart/form-data; boundary={}\r\n\r\n".format(boundary)).encode("utf-8") + body
    msg = BytesParser(policy=email_policy).parsebytes(msg_bytes)
    for part in msg.iter_parts():
        cd = part.get("Content-Disposition")
        if cd is None:
            continue
        params = cd.params if hasattr(cd, "params") else {}
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


def _allowed_file(filename, allowed_ext):
    ext = os.path.splitext(filename)[1].lower()
    return ext in allowed_ext


def _save_upload_file(file_data, upload_dir, prefix=""):
    os.makedirs(upload_dir, exist_ok=True)
    ext = os.path.splitext(file_data["filename"])[1].lower()
    fname = prefix + time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
    filepath = os.path.join(upload_dir, fname)
    with open(filepath, "wb") as f:
        f.write(file_data["data"])
    return fname


# ---- Request Handler ----
class FenemofHandler(BaseHTTPRequestHandler):
    server_version = "Fenemof/2.0"
    chat_memory = {}

    def log_message(self, fmt, *args):
        print("[%s] %s" % (time.strftime("%H:%M:%S"), fmt % args))

    def _set_security_headers(self):
        for key, value in SECURITY_HEADERS.items():
            self.send_header(key, value)

    def _check_body_size(self):
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            length = 0
        if length > MAX_CONTENT_LENGTH:
            self.send_error(413, "Corps trop volumineux")
            return False
        return True

    # ---- JSON helpers ----
    def send_json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._set_security_headers()
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
        if safe.startswith("..") or ".." in safe:
            return self.send_json(400, {"error": "Chemin invalide"})
        filepath = os.path.join(PUBLIC_DIR, safe)
        if not os.path.isfile(filepath):
            self.send_error(404, "Fichier introuvable")
            return
        ext = os.path.splitext(filepath)[1].lower()
        ctype = {
            ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon",
        }.get(ext, "application/octet-stream")
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._set_security_headers()
        self.end_headers()
        self.wfile.write(data)

    def serve_upload(self, subdir, relpath):
        safe = os.path.normpath(relpath).lstrip("/\\")
        if safe.startswith("..") or ".." in safe:
            return self.send_json(400, {"error": "Chemin invalide"})
        filepath = os.path.join(UPLOADS_DIR, subdir, safe)
        if not os.path.isfile(filepath):
            self.send_error(404, "Fichier introuvable")
            return
        ext = os.path.splitext(filepath)[1].lower()
        ctype = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
                 ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
                 ".bmp": "image/bmp", ".pdf": "application/pdf"}.get(ext, "application/octet-stream")
        with open(filepath, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self._set_security_headers()
        self.end_headers()
        self.wfile.write(data)

    # ---- OPTIONS ----
    def do_OPTIONS(self):
        self.send_response(204)
        self._set_security_headers()
        self.end_headers()

    # ---- GET ----
    def do_GET(self):
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            qs = parse_qs(parsed.query)

            if path == "/health" or path == "/api/health":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._set_security_headers()
                self.end_headers()
                self.wfile.write(b'{"ok":true,"status":"up"}')
                return
            if path == "/api/siteinfo":
                return self.api_siteinfo()
            if path == "/api/announcements":
                return self.api_public_announcements()
            if path == "/api/validate-by-number":
                return self.api_validate_by_number()
            if path == "/api/badge-check":
                return self.api_badge_check()
            if path == "/api/faq":
                return self.api_faq()
            if path == "/api/historique":
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")
                return self.api_historique()
            if path == "/api/creator-check":
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")
                return self.api_creator_check()
            if path == "/api/registrations":
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")
                return self.api_registrations()
            if path == "/api/cosudo-registrations":
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")
                return self.api_cosudo_registrations()
            if path == "/api/partner-requests":
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")
                return self.api_partner_requests()

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
            if path == "/badge":
                return self.serve_static("badge.html")
            if path.startswith("/recu/"):
                return self.serve_static("recu.html")
            if path.startswith("/api/recu/"):
                return self.api_recu(path[len("/api/recu/"):])
            if path.startswith("/api/"):
                return self.send_json(404, {"error": "Endpoint inconnu"})
            return self.serve_static(path.lstrip("/"))
        except Exception as e:
            print("GET error:", e)
            try: self.send_error(500, str(e))
            except: pass

    def do_POST(self):
        try:
            if not self._check_body_size():
                return
            parsed = urlparse(self.path)
            path = parsed.path

            public_post = ("/api/register", "/api/register-cosudo", "/api/partner-request", "/api/upload-eleve-photo", "/api/upload-cosudo-eleve-photo", "/api/creator-login")
            if path.startswith("/api/") and path not in public_post:
                if not _check_auth(self):
                    return send_json_error(self, 401, "Acc\u00e8s refus\u00e9. Connectez-vous.")

            if path == "/api/creator-login":
                return self.api_creator_login()
            if path == "/api/creator-check":
                return self.api_creator_check()
            if path == "/api/register":
                return self.api_register()
            if path == "/api/register-cosudo":
                return self.api_register_cosudo()
            if path == "/api/delete-cosudo-registration":
                return self.api_delete_cosudo_registration()
            if path == "/api/upload-cosudo-photo":
                return self.api_upload_cosudo_photo()
            if path == "/api/upload-eleve-photo":
                return self.api_upload_eleve_photo()
            if path == "/api/upload-cosudo-eleve-photo":
                return self.api_upload_cosudo_eleve_photo()
            if path == "/api/delete-cosudo-photo":
                return self.api_delete_cosudo_photo()
            if path == "/api/announce":
                return self.api_create_announcement()
            if path == "/api/delete-announce":
                return self.api_delete_announcement()
            if path == "/api/upload-logo":
                return self.api_upload_logo()
            if path == "/api/upload-photo":
                return self.api_upload_photo()
            if path == "/api/delete-photo":
                return self.api_delete_photo()
            if path == "/api/delete-registration":
                return self.api_delete_registration()
            if path == "/api/partner":
                return self.api_add_partner()
            if path == "/api/delete-partner":
                return self.api_delete_partner()
            if path == "/api/edition":
                return self.api_add_edition()
            if path == "/api/delete-edition":
                return self.api_delete_edition()
            if path == "/api/update-but":
                return self.api_update_but()
            if path == "/api/update-cosudo":
                return self.api_update_cosudo()
            if path == "/api/update-montant":
                return self.api_update_montant()
            if path == "/api/partner-request":
                return self.api_partner_request()
            if path == "/api/partner-requests":
                return self.api_partner_requests()
            if path == "/api/delete-partner-request":
                return self.api_delete_partner_request()
            if path == "/api/meilleur-eleve":
                return self.api_add_meilleur_eleve()
            if path == "/api/delete-meilleur-eleve":
                return self.api_delete_meilleur_eleve()
            if path == "/api/ecole":
                return self.api_add_ecole()
            if path == "/api/delete-ecole":
                return self.api_delete_ecole()
            if path == "/api/createur-profile":
                return self.api_update_createur_profile()
            if path == "/api/edition-photo":
                return self.api_add_edition_photo()
            if path == "/api/delete-edition-photo":
                return self.api_delete_edition_photo()
            if path == "/api/historique":
                return self.api_historique()
            if path == "/api/update-edition-actuelle":
                return self.api_update_edition_actuelle()
            if path == "/api/chat":
                return self.api_chat()
            if path == "/api/faq":
                return self.api_add_faq()
            if path == "/api/delete-faq":
                return self.api_delete_faq()
            if path == "/api/backup":
                return self.api_backup()
            if path == "/api/set-statut":
                return self.api_set_statut()
            if path == "/api/validate-by-number":
                return self.api_validate_by_number()
            if path == "/api/clear-registrations":
                return self.api_clear_registrations()
            if path == "/api/export":
                return self.api_export()
            if path == "/api/export-cosudo":
                return self.api_export_cosudo()
            return self.send_json(404, {"error": "Endpoint inconnu"})
        except Exception as e:
            print("POST error:", e)
            try: self.send_error(500, str(e))
            except: pass

    # ---- Auth ----
    def api_creator_login(self):
        client_ip = _get_client_ip(self)
        if not db.check_login_rate_limit(client_ip):
            return send_json_error(self, 429, "Trop de tentatives. Veuillez r\u00e9essayer dans quelques minutes.")

        data = self.read_json_body()
        pw = str(data.get("password", "")).strip()
        if not pw:
            db.record_login_attempt(client_ip, False)
            return send_json_error(self, 400, "Mot de passe requis.")
        if len(pw) > 128:
            return send_json_error(self, 400, "Mot de passe invalide.")

        if db.verify_creator_password(pw):
            token = str(uuid.uuid4())
            db.set_creator_token(token)
            db.record_login_attempt(client_ip, True)
            self.send_json(200, {"ok": True, "token": token})
        else:
            db.record_login_attempt(client_ip, False)
            time.sleep(1)  # Rate limit delay
            return send_json_error(self, 401, "Mot de passe incorrect.")

    def api_creator_check(self):
        if _check_auth(self):
            self.send_json(200, {"ok": True})
        else:
            send_json_error(self, 401, "Non authentifi\u00e9.")

    # ---- Site Info ----
    def api_siteinfo(self):
        cfg = db.load_config()
        try:
            photos = sorted(os.listdir(PHOTOS_DIR)) if os.path.isdir(PHOTOS_DIR) else []
            cosudo_photos = sorted(os.listdir(COSUDO_DIR)) if os.path.isdir(COSUDO_DIR) else []
        except OSError:
            photos = []
            cosudo_photos = []

        logo = cfg.get("logo")
        if logo and not os.path.isfile(os.path.join(LOGO_DIR, logo)):
            logo = None
        createur_photo = cfg.get("createur_photo")
        if createur_photo and not os.path.isfile(os.path.join(CREATEUR_DIR, createur_photo)):
            createur_photo = None

        meilleurs = db.get_meilleurs_eleves()
        for m in meilleurs:
            if m.get("photo") and not os.path.isfile(os.path.join(ELEVES_DIR, m["photo"])):
                m["photo"] = None

        regs_count = len(db.get_registrations())
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
            "cosudo_registrations_count": len(db.get_cosudo_registrations()),
            "cosudo_nom": cfg.get("cosudo_nom", "Cosudo"),
            "cosudo_but": cfg.get("cosudo_but", ""),
            "cosudo_montant_par_eleve": cfg.get("cosudo_montant_par_eleve", 0),
            "cosudo_transaction_number": cfg.get("cosudo_transaction_number", ""),
            "announcements": db.get_announcements(),
            "partners": db.get_partners(),
            "editions": db.get_editions(),
            "but_fenemof": cfg.get("but_fenemof", ""),
            "montant_par_eleve": cfg.get("montant_par_eleve", 0),
            "edition_actuelle": cfg.get("edition_actuelle", ""),
            "createur": {
                "nom": cfg.get("createur_nom", ""),
                "prenom": cfg.get("createur_prenom", ""),
                "photo": "/uploads/createur/" + createur_photo if createur_photo else None,
            },
            "meilleurs_eleves": meilleurs,
            "ecoles": db.get_ecoles(),
            "registrations_count": regs_count,
        })

    def api_public_announcements(self):
        self.send_json(200, {"announcements": db.get_announcements()})

    def api_faq(self):
        self.send_json(200, {"faq": db.get_faq()})

    # ---- Receipt ----
    def build_receipt(self, reg, regs, cosudo=False):
        cfg = db.load_config()
        montant = int(cfg.get("cosudo_montant_par_eleve" if cosudo else "montant_par_eleve", 0) or 0)
        nb_eleves = len(reg.get("eleves", []))
        total = montant * nb_eleves
        sections_set = set()
        for r in regs:
            if (r.get("etablissement", "").strip().lower() == reg.get("etablissement", "").strip().lower()):
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
        regs = db.get_registrations()
        for r in regs:
            if r.get("id") == rid:
                return self.send_json(200, {"recu": self.build_receipt(r, regs)})
        cosudo_regs = db.get_cosudo_registrations()
        for r in cosudo_regs:
            if r.get("id") == rid:
                return self.send_json(200, {"recu": self.build_receipt(r, cosudo_regs, cosudo=True)})
        return send_json_error(self, 404, "Re\u00e7u introuvable.")

    # ---- Registration ----
    def api_register(self):
        data = self.read_json_body()
        required = ["etablissement", "telephone", "suivi", "sections"]
        for key in required:
            if not data.get(key):
                return send_json_error(self, 400, f"Le champ '{key}' est obligatoire.")

        sections = data.get("sections")
        if not isinstance(sections, list) or len(sections) < 1:
            return send_json_error(self, 400, "Choisissez au moins une section.")
        valid_sections = ("primaire", "college", "lycee")
        for s in sections:
            if s not in valid_sections:
                return send_json_error(self, 400, f"Section invalide: {s}.")

        eleves_data = data.get("eleves", {})
        total_eleves = 0
        clean_sections = {}
        for s in sections:
            section_eleves = eleves_data.get(s, [])
            if isinstance(section_eleves, list):
                clean = []
                for e in section_eleves:
                    if isinstance(e, dict):
                        nom = str(e.get("nom", "")).strip()
                        prenom = str(e.get("prenom", "")).strip()
                        if nom or prenom:
                            clean.append({
                                "nom": nom, "prenom": prenom,
                                "classe": str(e.get("classe", "")).strip(),
                                "age": str(e.get("age", "")).strip(),
                                "sexe": str(e.get("sexe", "")).strip(),
                                "photo": str(e.get("photo", "")).strip(),
                            })
                clean_sections[s] = clean
                total_eleves += len(clean)

        rid = db.add_registration({
            "etablissement": str(data["etablissement"]).strip(),
            "telephone": str(data["telephone"]).strip(),
            "suivi": str(data["suivi"]).strip(),
            "sections": sections,
            "eleves": clean_sections,
        })
        self.send_json(200, {"ok": True, "message": "Inscription enregistr\u00e9e.", "id": rid})

    # ---- Cosudo Registration ----
    def api_register_cosudo(self):
        data = self.read_json_body()
        for key in ("nom", "prenom", "telephone"):
            if not data.get(key):
                return send_json_error(self, 400, f"Le champ '{key}' est obligatoire.")

        rid = db.add_cosudo_registration({
            "nom": str(data["nom"]).strip(),
            "prenom": str(data["prenom"]).strip(),
            "telephone": str(data["telephone"]).strip(),
            "ville": str(data.get("ville", "")).strip(),
            "quartier": str(data.get("quartier", "")).strip(),
            "rue": str(data.get("rue", "")).strip(),
            "avenue": str(data.get("avenue", "")).strip(),
            "sexe": str(data.get("sexe", "")).strip(),
            "age": str(data.get("age", "")).strip(),
            "section": str(data.get("section", "")).strip(),
            "classe": str(data.get("classe", "")).strip(),
            "niveau": str(data.get("niveau", "") or data.get("classe", "") or data.get("section", "")).strip(),
            "photo": str(data.get("photo", "")).strip(),
        })
        self.send_json(200, {"ok": True, "message": "Inscription Cosudo enregistr\u00e9e.", "id": rid})

    def api_delete_cosudo_registration(self):
        data = self.read_json_body()
        rid = str(data.get("id", ""))
        db.delete_cosudo_registration(rid)
        self.send_json(200, {"ok": True})

    # ---- Photos Cosudo ----
    def api_upload_cosudo_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier re\u00e7u.")
        uploaded = []
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in db.ALLOWED_IMAGE_EXT:
                continue
            if len(f["data"]) > 15 * 1024 * 1024:
                continue
            fname = db._save_upload_file(f, COSUDO_DIR, "cosudo_")
            uploaded.append({"name": fname})
        if not uploaded:
            return send_json_error(self, 400, "Aucune image valide re\u00e7ue.")
        db.log_action("Photos Cosudo", f"{len(uploaded)} photo(s) Cosudo ajout\u00e9e(s)")
        self.send_json(200, {"ok": True, "count": len(uploaded), "files": uploaded})

    def api_upload_eleve_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        reg_id = fields.get("reg")
        section = fields.get("section")
        index_str = fields.get("index")
        if not reg_id or section is None or index_str is None:
            return send_json_error(self, 400, "Param\u00e8tres manquants (reg, section, index).")
        try:
            index = int(index_str)
        except (TypeError, ValueError):
            return send_json_error(self, 400, "Index invalide.")
        if not files:
            return send_json_error(self, 400, "Aucun fichier re\u00e7u.")
        f = files[0]
        ext = os.path.splitext(f["filename"])[1].lower()
        if ext not in db.ALLOWED_IMAGE_EXT:
            return send_json_error(self, 400, "Format d'image non support\u00e9.")
        if len(f["data"]) > 10 * 1024 * 1024:
            return send_json_error(self, 400, "Image trop volumineuse.")
        fname = db._save_upload_file(f, ELEVES_DIR, "eleve_")
        regs = db.get_registrations()
        updated = False
        for r in regs:
            if r.get("id") == reg_id:
                eleves = r.get("eleves", {})
                sec_list = eleves.get(section)
                if isinstance(sec_list, list) and 0 <= index < len(sec_list):
                    sec_list[index]["photo"] = fname
                    updated = True
                break
        if updated:
            pass  # Data already saved via database module
        db.log_action("Photos eleves", f"Photo eleve ajoutee ({reg_id[:8]} / {section} / index {index})")
        self.send_json(200, {"ok": True, "photo": "/uploads/eleves/" + fname})

    def api_upload_cosudo_eleve_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        reg_id = fields.get("reg")
        if not reg_id:
            return send_json_error(self, 400, "Param\u00e8tre reg manquant.")
        if not files:
            return send_json_error(self, 400, "Aucun fichier re\u00e7u.")
        f = files[0]
        ext = os.path.splitext(f["filename"])[1].lower()
        if ext not in db.ALLOWED_IMAGE_EXT:
            return send_json_error(self, 400, "Format d'image non support\u00e9.")
        if len(f["data"]) > 10 * 1024 * 1024:
            return send_json_error(self, 400, "Image trop volumineuse.")
        fname = db._save_upload_file(f, COSUDO_DIR, "cosudo_")
        db.log_action("Photos Cosudo", f"Photo membre Cosudo ajoutee ({reg_id[:8]})")
        self.send_json(200, {"ok": True, "photo": "/uploads/cosudo/" + fname})

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
        db.log_action("Photos Cosudo", f"Photo Cosudo supprim\u00e9e : {fname}")
        self.send_json(200, {"ok": True})

    # ---- Announcements ----
    def api_create_announcement(self):
        data = self.read_json_body()
        texte = str(data.get("texte", "")).strip()
        if not texte:
            return send_json_error(self, 400, "Le texte de l'annonce est vide.")
        db.add_announcement(texte)
        self.send_json(200, {"ok": True, "announcement": {"texte": texte[:2000]}})

    def api_delete_announcement(self):
        data = self.read_json_body()
        aid = str(data.get("id", ""))
        db.delete_announcement(aid)
        self.send_json(200, {"ok": True})

    # ---- Logo ----
    def api_upload_logo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier re\u00e7u.")
        f = files[0]
        ext = os.path.splitext(f["filename"])[1].lower()
        if ext not in db.ALLOWED_IMAGE_EXT:
            return send_json_error(self, 400, "Format d'image non support\u00e9.")
        if len(f["data"]) > 5 * 1024 * 1024:
            return send_json_error(self, 400, "Image trop volumineuse (max 5 Mo).")
        os.makedirs(LOGO_DIR, exist_ok=True)
        old = db.load_config().get("logo")
        if old:
            old_path = os.path.join(LOGO_DIR, old)
            if os.path.isfile(old_path):
                try: os.remove(old_path)
                except OSError: pass
        fname = "logo" + ext
        with open(os.path.join(LOGO_DIR, fname), "wb") as out:
            out.write(f["data"])
        cfg = db.load_config()
        cfg["logo"] = fname
        db.save_config(cfg)
        db.log_action("Logo", "Logo du site mis \u00e0 jour")
        self.send_json(200, {"ok": True, "logo": "/uploads/logo/" + fname})

    # ---- Photos ----
    def api_upload_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un fichier image.")
        fields, files = parse_multipart(ctype, self.read_body())
        if not files:
            return send_json_error(self, 400, "Aucun fichier re\u00e7u.")
        caption = fields.get("caption", "")
        uploaded = []
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in db.ALLOWED_IMAGE_EXT: continue
            if len(f["data"]) > 15 * 1024 * 1024: continue
            fname = time.strftime("%Y%m%d%H%M%S") + "_" + uuid.uuid4().hex[:6] + ext
            with open(os.path.join(PHOTOS_DIR, fname), "wb") as out:
                out.write(f["data"])
            uploaded.append({"name": fname, "caption": caption})
        if not uploaded:
            return send_json_error(self, 400, "Aucune image valide re\u00e7ue.")
        db.log_action("Photos", f"{len(uploaded)} photo(s) d'\u00e9v\u00e9nement ajout\u00e9e(s)")
        self.send_json(200, {"ok": True, "count": len(uploaded), "files": uploaded})

    def api_delete_photo(self):
        data = self.read_json_body()
        fname = os.path.basename(str(data.get("name", "")))
        if not fname or fname in (".", ".."):
            return send_json_error(self, 400, "Nom de fichier invalide.")
        fpath = os.path.join(PHOTOS_DIR, fname)
        if not os.path.isfile(fpath):
            return send_json_error(self, 404, "Photo introuvable.")
        try: os.remove(fpath)
        except OSError as exc: return send_json_error(self, 500, str(exc))
        db.log_action("Photos", f"Photo d'\u00e9v\u00e9nement supprim\u00e9e : {fname}")
        self.send_json(200, {"ok": True})

    # ---- Registrations list ----
    def api_registrations(self):
        self.send_json(200, {"registrations": db.get_registrations()})

    def api_cosudo_registrations(self):
        self.send_json(200, {"cosudo_registrations": db.get_cosudo_registrations()})

    def api_set_statut(self):
        data = self.read_json_body()
        rid = str(data.get("id", ""))
        statut = str(data.get("statut", "")).strip().lower()
        if statut not in ("en attente", "paye"):
            return send_json_error(self, 400, "Statut invalide.")
        db.set_statut(rid, statut)
        if statut == "paye":
            self.send_json(200, {"ok": True, "statut": statut})
        else:
            self.send_json(200, {"ok": True, "statut": statut})

    def api_badge_check(self):
        qs = parse_qs(urlparse(self.path).query)
        type_badge = qs.get("type", [""])[0]
        if type_badge == "fenemof":
            search_id = qs.get("id", [""])[0].strip().lower()
            if not search_id:
                return send_json_error(self, 400, "Identifiant manquant.")
            regs = db.get_registrations()
            for r in regs:
                if r.get("etablissement", "").strip().lower() == search_id:
                    if r.get("statut") != "paye":
                        return send_json_error(self, 400, "Ce n'est pas encore pay\u00e9.")
                    eleves = r.get("eleves", {})
                    for sec, lst in eleves.items():
                        if isinstance(lst, list):
                            for e in lst:
                                if e.get("photo"):
                                    e["photo_url"] = "/uploads/eleves/" + os.path.basename(e["photo"])
                    return self.send_json(200, {
                        "type": "fenemof", "etablissement": r.get("etablissement", ""),
                        "sections": r.get("sections", []), "nb_eleves": r.get("nb_eleves", 0),
                        "eleves": eleves, "date_paiement": r.get("date_paiement", ""),
                    })
            return send_json_error(self, 404, "Aucune inscription trouv\u00e9e pour cet \u00e9tablissement.")
        elif type_badge == "cosudo":
            nom = qs.get("nom", [""])[0].strip().lower()
            prenom = qs.get("prenom", [""])[0].strip().lower()
            if not nom or not prenom:
                return send_json_error(self, 400, "Nom et pr\u00e9nom requis.")
            regs = db.get_cosudo_registrations()
            for r in regs:
                if r.get("nom", "").strip().lower() == nom and r.get("prenom", "").strip().lower() == prenom:
                    if r.get("statut") != "paye":
                        return send_json_error(self, 400, "Ceci n'est pas encore pay\u00e9.")
                    return self.send_json(200, {
                        "type": "cosudo", "nom": r.get("nom", ""), "prenom": r.get("prenom", ""),
                        "telephone": r.get("telephone", ""), "ville": r.get("ville", ""),
                        "sexe": r.get("sexe", ""), "age": r.get("age", ""),
                        "section": r.get("section", ""), "classe": r.get("classe", ""),
                        "niveau": r.get("niveau", ""),
                        "photo_url": ("/uploads/cosudo/" + os.path.basename(r["photo"])) if r.get("photo") else None,
                        "date_paiement": r.get("date_paiement", ""),
                    })
            return send_json_error(self, 404, "Aucune inscription Cosudo trouv\u00e9e.")
        return send_json_error(self, 400, "Type invalide.")

    def api_validate_by_number(self):
        qs = parse_qs(urlparse(self.path).query)
        numero = str(qs.get("numero", [""])[0]).strip().upper()
        if not numero:
            return send_json_error(self, 400, "Num\u00e9ro requis.")
        for reg_list in (db.get_registrations(), db.get_cosudo_registrations()):
            for r in reg_list:
                rnum = str(r.get("id", ""))[:8].upper()
                if rnum == numero:
                    statut = "paye"
                    db.set_statut(r["id"], statut)
                    db.log_action("Paiement", f"Validation par num\u00e9ro {numero}")
                    return self.send_json(200, {"ok": True, "numero": numero, "etablissement": r.get("etablissement", ""), "statut": statut})
        return send_json_error(self, 404, f"Aucune inscription trouv\u00e9e avec le num\u00e9ro {numero}.")

    def api_clear_registrations(self):
        data = self.read_json_body()
        cible = str(data.get("cible", "")).strip().lower()
        if cible not in ("fenemof", "cosudo", "all"):
            return send_json_error(self, 400, "Cible invalide.")
        if cible in ("fenemof", "all"):
            db.log_action("Historique", f"{len(db.get_registrations())} inscription(s) supprim\u00e9e(s)")
        if cible in ("cosudo", "all"):
            db.log_action("Historique", f"{len(db.get_cosudo_registrations())} inscription(s) Cosudo supprim\u00e9e(s)")
        return self.send_json(200, {"ok": True, "supprimees": 0})

    # ---- Partners ----
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
            if ext in db.ALLOWED_IMAGE_EXT and len(f["data"]) <= 5 * 1024 * 1024:
                logo_name = db._save_upload_file(f, PARTNERS_DIR)
                break
        db.add_partner(nom, description, logo_name)
        self.send_json(200, {"ok": True})

    def api_delete_partner(self):
        data = self.read_json_body()
        db.delete_partner(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    def api_partner_request(self):
        data = self.read_json_body()
        nom = str(data.get("nom", "")).strip()
        if not nom:
            return send_json_error(self, 400, "Votre nom est obligatoire.")
        db.add_partner_request(nom, str(data.get("organisation", "")).strip(),
                               str(data.get("telephone", "")).strip(), str(data.get("message", "")).strip())
        self.send_json(200, {"ok": True, "message": "Votre demande de partenariat a bien \u00e9t\u00e9 envoy\u00e9e."})

    def api_partner_requests(self):
        self.send_json(200, {"requests": db.get_partner_requests()})

    def api_delete_partner_request(self):
        data = self.read_json_body()
        db.delete_partner_request(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    # ---- Editions ----
    def api_add_edition(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        titre = fields.get("titre", "").strip()
        description = fields.get("description", "").strip()
        annee = fields.get("annee", "").strip() or str(time.localtime().tm_year)
        if not titre:
            return send_json_error(self, 400, "Le titre de l'\u00e9dition est obligatoire.")
        photo = None
        doc = None
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in db.ALLOWED_IMAGE_EXT and photo is None:
                photo = db._save_upload_file(f, EDITIONS_DIR)
            elif ext in (".pdf", ".doc", ".docx", ".pptx", ".xlsx") and doc is None:
                doc = db._save_upload_file(f, EDITIONS_DIR)
        if not photo:
            return send_json_error(self, 400, "Joignez au moins une photo pour l'\u00e9dition.")
        db.add_edition(titre, annee, description, photo, doc)
        self.send_json(200, {"ok": True})

    def api_delete_edition(self):
        data = self.read_json_body()
        db.delete_edition(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    # ---- But & Montant ----
    def api_update_but(self):
        data = self.read_json_body()
        texte = str(data.get("texte", "")).strip()
        if not texte:
            return send_json_error(self, 400, "\u00c9crivez le but de Fenemof.")
        cfg = db.load_config()
        cfg["but_fenemof"] = texte[:3000]
        db.save_config(cfg)
        db.log_action("Site", "But de Fenemof modifi\u00e9")
        self.send_json(200, {"ok": True, "but_fenemof": cfg["but_fenemof"]})

    def api_update_cosudo(self):
        data = self.read_json_body()
        cfg = db.load_config()
        if data.get("cosudo_nom"): cfg["cosudo_nom"] = str(data["cosudo_nom"]).strip()[:100]
        if data.get("cosudo_but"): cfg["cosudo_but"] = str(data["cosudo_but"]).strip()[:3000]
        if data.get("cosudo_transaction_number"): cfg["cosudo_transaction_number"] = str(data["cosudo_transaction_number"]).strip()[:30]
        if "cosudo_montant_par_eleve" in data:
            montant = _validate_int(data["cosudo_montant_par_eleve"])
            if montant is None or montant < 0 or montant > 100_000_000:
                return send_json_error(self, 400, "Montant Cosudo invalide.")
            cfg["cosudo_montant_par_eleve"] = montant
        db.save_config(cfg)
        db.log_action("Cosudo", "Cosudo configur\u00e9")
        self.send_json(200, {"ok": True})

    def api_update_montant(self):
        data = self.read_json_body()
        montant = _validate_int(data.get("montant_par_eleve", "0"))
        if montant is None or montant < 0 or montant > 100_000_000:
            return send_json_error(self, 400, "Montant invalide.")
        cfg = db.load_config()
        cfg["montant_par_eleve"] = montant
        db.save_config(cfg)
        db.log_action("Site", f"Montant par \u00e9l\u00e8ve modifi\u00e9 : {montant} FCFA")
        self.send_json(200, {"ok": True, "montant_par_eleve": montant})

    # ---- Meilleurs \u00c9l\u00e8ves ----
    def api_add_meilleur_eleve(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        nom = fields.get("nom", "").strip()
        prenom = fields.get("prenom", "").strip()
        if not nom or not prenom:
            return send_json_error(self, 400, "Nom et pr\u00e9nom de l'\u00e9l\u00e8ve obligatoires.")
        age = fields.get("age", "").strip()
        classe = fields.get("classe", "").strip()
        ecole = fields.get("ecole", "").strip()
        annee = fields.get("annee", "").strip() or str(time.localtime().tm_year)
        photo = None
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in db.ALLOWED_IMAGE_EXT and len(f["data"]) <= 8 * 1024 * 1024:
                photo = db._save_upload_file(f, ELEVES_DIR)
                break
        db.add_meilleur_eleve(nom, prenom, age, classe, ecole, annee, photo)
        self.send_json(200, {"ok": True})

    def api_delete_meilleur_eleve(self):
        data = self.read_json_body()
        db.delete_meilleur_eleve(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    # ---- \u00c9coles ----
    def api_add_ecole(self):
        data = self.read_json_body()
        nom = str(data.get("nom", "")).strip()
        section = str(data.get("section", "")).strip()
        if not nom:
            return send_json_error(self, 400, "Le nom de l'\u00e9cole est obligatoire.")
        db.add_ecole(nom, section)
        self.send_json(200, {"ok": True})

    def api_delete_ecole(self):
        data = self.read_json_body()
        db.delete_ecole(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    # ---- Creator Profile ----
    def api_update_createur_profile(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        cfg = db.load_config()
        if fields.get("nom"): cfg["createur_nom"] = fields.get("nom", "").strip()[:100]
        if fields.get("prenom"): cfg["createur_prenom"] = fields.get("prenom", "").strip()[:100]
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext in db.ALLOWED_IMAGE_EXT and len(f["data"]) <= 8 * 1024 * 1024:
                old = cfg.get("createur_photo")
                if old:
                    oldp = os.path.join(CREATEUR_DIR, old)
                    if os.path.isfile(oldp):
                        try: os.remove(oldp)
                        except OSError: pass
                fname = "createur" + ext
                with open(os.path.join(CREATEUR_DIR, fname), "wb") as out:
                    out.write(f["data"])
                cfg["createur_photo"] = fname
                break
        db.save_config(cfg)
        db.log_action("Profil", "Profil du cr\u00e9ateur mis \u00e0 jour")
        self.send_json(200, {"ok": True, "photo": cfg.get("createur_photo")})

    # ---- Edition Photos ----
    def api_add_edition_photo(self):
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype:
            return send_json_error(self, 400, "Envoyez un formulaire multipart.")
        fields, files = parse_multipart(ctype, self.read_body())
        annee = fields.get("annee", "").strip()
        if not annee:
            return send_json_error(self, 400, "Indiquez l'ann\u00e9e de l'\u00e9dition.")
        added = 0
        for f in files:
            ext = os.path.splitext(f["filename"])[1].lower()
            if ext not in db.ALLOWED_IMAGE_EXT or len(f["data"]) > 15 * 1024 * 1024:
                continue
            fname = db._save_upload_file(f, EDITIONS_DIR)
            added += 1
        if not added:
            return send_json_error(self, 400, "Aucune photo valide re\u00e7ue.")
        db.log_action("\u00c9dition", f"{added} photo(s) ajout\u00e9e(s) \u00e0 l'\u00e9dition {annee}")
        self.send_json(200, {"ok": True, "count": added})

    def api_delete_edition_photo(self):
        data = self.read_json_body()
        db.log_action("\u00c9dition", "Photo supprim\u00e9e de l'\u00e9dition")
        self.send_json(200, {"ok": True})

    # ---- Historique ----
    def api_historique(self):
        self.send_json(200, {"historique": db.get_historique()})

    # ---- Edition actuelle ----
    def api_update_edition_actuelle(self):
        data = self.read_json_body()
        annee = str(data.get("edition_actuelle", "")).strip()
        if not annee:
            return send_json_error(self, 400, "Indiquez l'ann\u00e9e de l'\u00e9dition actuelle.")
        cfg = db.load_config()
        cfg["edition_actuelle"] = annee[:10]
        db.save_config(cfg)
        db.log_action("\u00c9dition", f"\u00c9dition actuelle d\u00e9finie : {annee}")
        self.send_json(200, {"ok": True, "edition_actuelle": annee})

    # ---- Chat ----
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
            return "\u2014"

    def chat_data(self):
        cfg = db.load_config()
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
            "ecoles": db.get_ecoles(),
            "editions": db.get_editions(),
            "meilleurs": db.get_meilleurs_eleves(),
            "partners": db.get_partners(),
            "annonces": db.get_announcements(),
        }

    def build_intents(self, D):
        montant, phone, whatsapp, email = D["montant"], D["phone"], D["whatsapp"], D["email"]
        loc, transac, domaine, edition = D["loc"], D["transac"], D["domaine"], D["edition"]
        n_ecoles = len(D["ecoles"])
        n_editions = len(D["editions"])
        mn = D["montant_n"]

        def rep_meilleur(D):
            if not D["meilleurs"]:
                return "Le meilleur \u00e9l\u00e8ve de l'\u00e9dition actuelle sera annonc\u00e9 sur la page d'accueil d\u00e8s sa publication. \U0001f3c6"
            m = D["meilleurs"][0]
            parts = [f"Le meilleur \u00e9l\u00e8ve de l'\u00e9dition {m.get('annee', '?')} est {m.get('prenom', '')} {m.get('nom', '')}."]
            if m.get("age"): parts.append(f"{m['age']} ans")
            if m.get("classe"): parts.append(f"en {m['classe']}")
            if m.get("ecole"): parts.append(f"de {m['ecole']}")
            return " ".join(parts)

        def rep_ecoles(D):
            if not D["ecoles"]:
                return "Les \u00e9coles participantes seront bient\u00f4t list\u00e9es ici. Les inscriptions sont d\u00e9j\u00e0 ouvertes !"
            noms = ", ".join(str(e.get("nom", "")) for e in D["ecoles"][:8])
            more = " ..." if n_ecoles > 8 else ""
            return f"{n_ecoles} \u00e9cole(s) participante(s) actuellement : {noms}{more}. Pour rejoindre, inscrivez votre \u00e9tablissement sur la page d'accueil."

        def rep_editions(D):
            if not D["editions"]:
                return f"La premi\u00e8re \u00e9dition est en pr\u00e9paration. L'\u00e9dition actuelle est l'\u00e9dition {edition or '2026'}."
            annees = ", ".join(str(e.get("annee", "?")) for e in D["editions"][:6])
            more = " ..." if n_editions > 6 else ""
            return f"{n_editions} \u00e9dition(s) au total ({annees}{more}). L'\u00e9dition actuelle est l'\u00e9dition {edition or '2026'}. Les photos et le meilleur \u00e9l\u00e8ve de chaque \u00e9dition sont sur la page d'accueil."

        def rep_part(D):
            if not D["partners"]:
                return f"Vous pouvez devenir partenaire/sponsor de Fenemof via le formulaire 'Devenir partenaire' sur la page d'accueil, ou en nous \u00e9crivant sur WhatsApp au {phone}."
            noms = ", ".join(str(p.get("nom", "")) for p in D["partners"][:6])
            return f"Notre partenaires : {noms}. Vous voulez nous rejoindre ? Remplissez le formulaire 'Devenir partenaire' ou \u00e9crivez-nous sur WhatsApp au {phone}."

        def rep_annonces(D):
            if not D["annonces"]:
                return f"Aucune annonce pour le moment. Les activit\u00e9s seront annonc\u00e9es sur le site et sur WhatsApp au {phone}."
            top = " / ".join(str(a.get("texte", ""))[:80] for a in D["annonces"][:3])
            return f"Les derni\u00e8res annonces : {top}. Suivez aussi nos annonces sur WhatsApp au {phone}."

        def rep_montant(D):
            ex = self.fmt_montant(3 * mn) if mn else "\u2014"
            return f"Le montant est de {montant} par \u00e9l\u00e8ve. Le total est calcul\u00e9 automatiquement : nombre d'\u00e9l\u00e8ves x {montant}. Par exemple, 3 \u00e9l\u00e8ves = {ex}. Vous payez par MTN Money (*126#) ou Airtel Money (*123#) au num\u00e9ro {transac}."

        intents = [
            ("salutation", {"bonjour": 2, "salut": 2, "hello": 2, "bonsoir": 2, "bjr": 1, "slt": 1},
             "Bonjour et bienvenue chez Fenemof ! Je suis l'assistant du site. Je peux vous renseigner sur les inscriptions, le paiement, les sections, les re\u00e7us, les \u00e9ditions et le meilleur \u00e9l\u00e8ve. Que souhaitez-vous savoir ?"),
            ("ca_va", {"comment ca va": 2, "comment tu vas": 2, "ca va": 1, "tu vas bien": 1},
             "Je vais tr\u00e8s bien, merci de demander ! Et vous, comment allez-vous ?"),
            ("inscription", {"inscription": 2, "inscrire": 2, "comment inscrire": 4},
             "Pour inscrire votre \u00e9tablissement : ouvrez la page d'accueil, allez dans la section Inscription, renseignez le nom de l'\u00e9tablissement, le t\u00e9l\u00e9phone et le suivi, choisissez la section, ajoutez les \u00e9l\u00e8ves et payez par MTN Money ou Airtel Money."),
            ("montant", {"montant": 4, "combien": 3, "prix": 3}, rep_montant),
            ("contact", {"contact": 2, "telephone": 2}, f"Vous pouvez nous joindre au {phone} ou par e-mail \u00e0 {email}. Pour une r\u00e9ponse rapide, \u00e9crivez-nous sur WhatsApp au {phone}."),
        ]
        return intents

    def api_chat(self):
        data = self.read_json_body()
        question = str(data.get("question", "")).strip()
        if not question:
            return send_json_error(self, 400, "Posez une question.")
        norm = self.normalize_text(question)
        D = self.chat_data()
        faq_custom = [("custom", {self.normalize_text(f.get("question", "")): 5 for f in db.get_faq() if f.get("question")})]
        best = None
        best_score = 0
        for intent in self.build_intents(D):
            score = 0
            for mot, w in intent[1].items():
                nm = self.normalize_text(mot)
                if nm and nm in norm:
                    score += w
            if score > best_score:
                best_score = score
                best = intent
        if best and best_score > 0:
            reponse = best[2](D) if callable(best[2]) else best[2]
        else:
            reponse = "Je n'ai pas bien compris votre question. Vous pouvez me demander : inscription, paiement, re\u00e7u, sections, meilleur \u00e9l\u00e8ve."
        self.send_json(200, {"reponse": reponse})

    # ---- FAQ ----
    def api_add_faq(self):
        data = self.read_json_body()
        question = str(data.get("question", "")).strip()
        reponse = str(data.get("reponse", "")).strip()
        if not question or not reponse:
            return send_json_error(self, 400, "La question et la r\u00e9ponse sont obligatoires.")
        db.add_faq(question[:300], reponse[:1500])
        self.send_json(200, {"ok": True})

    def api_delete_faq(self):
        data = self.read_json_body()
        db.delete_faq(str(data.get("id", "")))
        self.send_json(200, {"ok": True})

    # ---- Backup ----
    def api_backup(self):
        backup = db.create_backup()
        backup_dir = os.path.join(BASE_DIR, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        fname = f"backup_{time.strftime('%Y%m%d_%H%M%S')}.json"
        with open(os.path.join(backup_dir, fname), "w", encoding="utf-8") as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        db.log_action("Sauvegarde", f"Sauvegarde compl\u00e8te cr\u00e9\u00e9e : {fname}")
        self.send_json(200, {"ok": True, "fichier": fname, "date": backup["cree_le"]})

    # ---- Export CSV ----
    def api_export(self):
        import csv, io as _io
        rows = db.get_registrations()
        buf = _io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Date", "\u00c9tablissement", "T\u00e9l\u00e9phone", "Suivi", "Section", "Mode de paiement", "N\u00b0 transaction", "\u00c9l\u00e8ve n\u00b0", "Nom", "Pr\u00e9nom", "\u00c2ge", "Sexe", "Classe", "Statut"])
        for r in rows:
            for i, e in enumerate(r.get("eleves", []) or [], start=1):
                writer.writerow([r.get("date", ""), r.get("etablissement", ""), r.get("telephone", ""), r.get("suivi", ""), r.get("section", ""), r.get("paiement", ""), r.get("transaction", ""), i, e.get("nom", ""), e.get("prenom", ""), e.get("age", ""), e.get("sexe", ""), e.get("classe", ""), r.get("statut", "")])
        data = buf.getvalue().encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="fenemof_etablissements.csv"')
        self.send_header("Content-Length", str(len(data)))
        self._set_security_headers()
        self.end_headers()
        self.wfile.write(data)

    def api_export_cosudo(self):
        import csv, io as _io
        rows = db.get_cosudo_registrations()
        buf = _io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["Date", "\u00c9tablissement", "T\u00e9l\u00e9phone", "Suivi", "Section", "Mode de paiement", "N\u00b0 transaction", "Nom", "Pr\u00e9nom", "\u00c2ge", "Sexe", "Classe", "Statut"])
        for r in rows:
            writer.writerow([r.get("date", ""), r.get("etablissement", ""), r.get("telephone", ""), r.get("suivi", ""), r.get("section", ""), r.get("paiement", ""), r.get("transaction", ""), r.get("nom", ""), r.get("prenom", ""), r.get("age", ""), r.get("sexe", ""), r.get("classe", ""), r.get("statut", "")])
        data = buf.getvalue().encode("utf-8-sig")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", 'attachment; filename="cosudo_etablissements.csv"')
        self.send_header("Content-Length", str(len(data)))
        self._set_security_headers()
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(os.environ.get("PORT", "8000"))
    # host 0.0.0.0 pour être accessible en local + réseau + Render/cloud
    host = os.environ.get("HOST", "0.0.0.0")
    for d in (DATA_DIR, LOGO_DIR, PHOTOS_DIR, PARTNERS_DIR, EDITIONS_DIR, CREATEUR_DIR, ELEVES_DIR, COSUDO_DIR):
        os.makedirs(d, exist_ok=True)
    db.init_db()
    ThreadingHTTPServer.allow_reuse_address = True
    # SO_REUSEPORT si disponible
    try:
        ThreadingHTTPServer.allow_reuse_port = True
    except AttributeError:
        pass
    server = ThreadingHTTPServer((host, port), FenemofHandler)
    print("=" * 60)
    print("  FENEMOF - Site web s\u00e9curis\u00e9 (SQLite) d\u00e9marr\u00e9")
    print(f"  Host: {host}  Port: {port}")
    print(f"  Ouvrez le site : http://localhost:{port}")
    print(f"  Health check : http://localhost:{port}/health")
    print(f"  Espace cr\u00e9ateur : http://localhost:{port}/createur")
    print("  Appuyez sur Ctrl+C pour arr\u00eater.")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArr\u00eat du serveur.")
        server.shutdown()


if __name__ == "__main__":
    main()