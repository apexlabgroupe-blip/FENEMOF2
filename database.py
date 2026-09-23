import sqlite3
import json
import os
import uuid
import time
import hashlib
import secrets
import threading
from contextlib import contextmanager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "data", "fenemof.db")
DATA_DIR = os.path.join(BASE_DIR, "data")

LOCK = threading.Lock()

ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"}
ALLOWED_DOC_EXT = ALLOWED_IMAGE_EXT | {".pdf", ".doc", ".docx", ".pptx", ".xlsx"}

PBKDF2_ITERATIONS = 200_000


def _hash_password(password: str, salt: bytes = None) -> tuple:
    if salt is None:
        salt = secrets.token_bytes(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return salt, key


def _verify_password(password: str, salt: bytes, key: bytes) -> bool:
    _, new_key = _hash_password(password, salt)
    return secrets.compare_digest(new_key, key)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


@contextmanager
def get_db():
    with LOCK:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS registrations (
                id TEXT PRIMARY KEY,
                date TEXT,
                etablissement TEXT,
                telephone TEXT,
                suivi TEXT,
                sections TEXT,
                eleves TEXT,
                nb_sections INTEGER,
                nb_eleves INTEGER,
                statut TEXT,
                paiement TEXT DEFAULT '',
                "transaction" TEXT DEFAULT '',
                date_paiement TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS cosudo_registrations (
                id TEXT PRIMARY KEY,
                date TEXT,
                nom TEXT,
                prenom TEXT,
                telephone TEXT,
                ville TEXT,
                quartier TEXT DEFAULT '',
                rue TEXT DEFAULT '',
                avenue TEXT DEFAULT '',
                sexe TEXT DEFAULT '',
                age TEXT DEFAULT '',
                section TEXT DEFAULT '',
                classe TEXT DEFAULT '',
                niveau TEXT DEFAULT '',
                photo TEXT DEFAULT '',
                statut TEXT DEFAULT 'en attente'
            );
            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                date TEXT,
                texte TEXT
            );
            CREATE TABLE IF NOT EXISTS partners (
                id TEXT PRIMARY KEY,
                nom TEXT,
                description TEXT DEFAULT '',
                logo TEXT DEFAULT '',
                date TEXT
            );
            CREATE TABLE IF NOT EXISTS editions (
                id TEXT PRIMARY KEY,
                annee TEXT,
                titre TEXT,
                description TEXT DEFAULT '',
                photo TEXT DEFAULT '',
                photos TEXT DEFAULT '[]',
                fichier TEXT DEFAULT '',
                date TEXT
            );
            CREATE TABLE IF NOT EXISTS historique (
                id TEXT PRIMARY KEY,
                date TEXT,
                type TEXT,
                detail TEXT
            );
            CREATE TABLE IF NOT EXISTS partner_requests (
                id TEXT PRIMARY KEY,
                date TEXT,
                nom TEXT,
                organisation TEXT DEFAULT '',
                telephone TEXT DEFAULT '',
                message TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS meilleurs_eleves (
                id TEXT PRIMARY KEY,
                annee TEXT,
                nom TEXT,
                prenom TEXT,
                age TEXT DEFAULT '',
                classe TEXT DEFAULT '',
                ecole TEXT DEFAULT '',
                photo TEXT DEFAULT '',
                date TEXT
            );
            CREATE TABLE IF NOT EXISTS ecoles (
                id TEXT PRIMARY KEY,
                nom TEXT,
                section TEXT DEFAULT '',
                date TEXT
            );
            CREATE TABLE IF NOT EXISTS faq (
                id TEXT PRIMARY KEY,
                question TEXT,
                reponse TEXT,
                date TEXT
            );
            CREATE TABLE IF NOT EXISTS config (
                "key" TEXT PRIMARY KEY,
                value TEXT
            );
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT DEFAULT '',
                timestamp REAL,
                success INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS uploads_logo (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_photos (
                filename TEXT PRIMARY KEY,
                data BLOB,
                caption TEXT DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS uploads_partners (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_editions (
                filename TEXT PRIMARY KEY,
                data BLOB,
                type TEXT DEFAULT 'photo'
            );
            CREATE TABLE IF NOT EXISTS uploads_createur (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_eleves (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_cosudo (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_logos_ecoles (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
            CREATE TABLE IF NOT EXISTS uploads_background (
                filename TEXT PRIMARY KEY,
                data BLOB
            );
        """)

        # Migrate config.json to database if it exists
        config_path = os.path.join(BASE_DIR, "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    old_config = json.load(f)
                for key, value in old_config.items():
                    if value is None:
                        value = ""
                    conn = sqlite3.connect(DB_PATH)
                    conn.execute('INSERT OR REPLACE INTO config ("key", value) VALUES (?, ?)', (key, json.dumps(value) if not isinstance(value, str) else value))
                    conn.commit()
                    conn.close()
            except (json.JSONDecodeError, OSError):
                pass


def _get_config_value(key: str, default=""):
    with get_db() as conn:
        row = conn.execute('SELECT value FROM config WHERE "key" = ?', (key,)).fetchone()
        if row:
            try:
                return json.loads(row["value"])
            except (json.JSONDecodeError, TypeError):
                return row["value"]
        return default


def _set_config_value(key: str, value):
    with get_db() as conn:
        conn.execute('INSERT OR REPLACE INTO config ("key", value) VALUES (?, ?)', (key, json.dumps(value)))


def _get_all_config() -> dict:
    with get_db() as conn:
        rows = conn.execute('SELECT "key", value FROM config').fetchall()
        result = {}
        for row in rows:
            try:
                result[row["key"]] = json.loads(row["value"])
            except (json.JSONDecodeError, TypeError):
                result[row["key"]] = row["value"]
        return result


def load_json(path, default):
    raise RuntimeError("Use database functions instead of load_json")


def save_json(path, data):
    raise RuntimeError("Use database functions instead of save_json")


# ---- Registration APIs ----
def get_registrations():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM registrations ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_registration(data: dict):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO registrations (id, date, etablissement, telephone, suivi, sections, eleves, nb_sections, nb_eleves, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, now, data["etablissement"], data["telephone"], data["suivi"],
              json.dumps(data["sections"]), json.dumps(data.get("eleves", {})),
              len(data["sections"]), sum(len(v) for v in data.get("eleves", {}).values()), "en attente"))
    log_action("Inscription", f"Etablissement '{data['etablissement']}' - sections {data['sections']}")
    return rid


def delete_registration(rid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM registrations WHERE id = ?", (rid,))
    log_action("Inscription", "Inscription supprimée")


def set_statut(rid: str, statut: str):
    with get_db() as conn:
        conn.execute("UPDATE registrations SET statut = ?, date_paiement = ? WHERE id = ?",
                     (statut, time.strftime("%d/%m/%Y à %Hh%M") if statut == "paye" else "", rid))
    if statut == "paye":
        log_action("Paiement", f"Inscription validée : {rid[:8]}")


# ---- Cosudo Registration APIs ----
def get_cosudo_registrations():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM cosudo_registrations ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_cosudo_registration(data: dict):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO cosudo_registrations (id, date, nom, prenom, telephone, ville, quartier, rue, avenue, sexe, age, section, classe, niveau, photo, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, now, data.get("nom",""), data.get("prenom",""), data.get("telephone",""),
              data.get("ville",""), data.get("quartier",""), data.get("rue",""), data.get("avenue",""),
              data.get("sexe",""), data.get("age",""), data.get("section",""), data.get("classe",""),
              data.get("niveau",""), data.get("photo",""), "en attente"))
    log_action("Inscription Cosudo", f"{data.get('prenom','')} {data.get('nom','')}")
    return rid


def delete_cosudo_registration(rid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM cosudo_registrations WHERE id = ?", (rid,))
    log_action("Inscription Cosudo", "Inscription Cosudo supprimée")


# ---- Announcements ----
def get_announcements():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM announcements ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_announcement(texte: str):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("INSERT INTO announcements (id, date, texte) VALUES (?, ?, ?)", (rid, now, texte[:2000]))
    log_action("Annonce", f"Annonce publiée : {texte[:60]}")
    return rid


def delete_announcement(aid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM announcements WHERE id = ?", (aid,))
    log_action("Annonce", "Annonce supprimée")


# ---- Partners ----
def get_partners():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM partners ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_partner(nom: str, description: str, logo: str = None):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("INSERT INTO partners (id, nom, description, logo, date) VALUES (?, ?, ?, ?, ?)",
                     (rid, nom, description, logo or "", now))
    log_action("Partenaire", f"Partenaire ajouté : {nom}")
    return rid


def delete_partner(pid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM partners WHERE id = ?", (pid,))
    log_action("Partenaire", "Partenaire supprimé")


# ---- Editions ----
def get_editions():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM editions ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_edition(titre: str, annee: str, description: str, photo: str, fichier: str = None):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO editions (id, annee, titre, description, photo, photos, fichier, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, annee, titre, description, photo, "[]", fichier or "", now))
    log_action("Édition", f"Édition ajoutée : {titre} ({annee})")
    return rid


def delete_edition(eid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM editions WHERE id = ?", (eid,))
    log_action("Édition", "Édition supprimée")


# ---- Historique ----
def get_historique():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM historique ORDER BY date DESC LIMIT 500").fetchall()
        return [dict(r) for r in rows]


def log_action(action_type: str, detail: str):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("INSERT INTO historique (id, date, type, detail) VALUES (?, ?, ?, ?)", (rid, now, action_type, detail))
        conn.execute("DELETE FROM historique WHERE id NOT IN (SELECT id FROM historique ORDER BY date DESC LIMIT 500)")


# ---- Partner Requests ----
def get_partner_requests():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM partner_requests ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_partner_request(nom: str, organisation: str, telephone: str, message: str):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("""
            INSERT INTO partner_requests (id, date, nom, organisation, telephone, message)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (rid, now, nom, organisation, telephone, message))
    log_action("Partenaire", f"Demande de partenariat reçue : {nom}")
    return rid


def delete_partner_request(rid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM partner_requests WHERE id = ?", (rid,))
    log_action("Partenaire", "Demande de partenariat supprimée")


# ---- Meilleurs Élèves ----
def get_meilleurs_eleves():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM meilleurs_eleves ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_meilleur_eleve(nom: str, prenom: str, age: str, classe: str, ecole: str, annee: str, photo: str = None):
    rid = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("""
            INSERT INTO meilleurs_eleves (id, annee, nom, prenom, age, classe, ecole, photo, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (rid, annee, nom, prenom, age, classe, ecole, photo or "", time.strftime("%Y-%m-%d %H:%M:%S")))
    log_action("Meilleur élève", f"Meilleur élève {prenom} {nom} ({annee}) ajouté")
    return rid


def delete_meilleur_eleve(eid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM meilleurs_eleves WHERE id = ?", (eid,))
    log_action("Meilleur élève", "Meilleur élève supprimé")


# ---- Écoles ----
def get_ecoles():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM ecoles ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_ecole(nom: str, section: str):
    rid = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute("INSERT INTO ecoles (id, nom, section, date) VALUES (?, ?, ?, ?)",
                     (rid, nom, section, time.strftime("%Y-%m-%d %H:%M:%S")))
    log_action("Écoles", f"École participante ajoutée : {nom}")
    return rid


def delete_ecole(eid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM ecoles WHERE id = ?", (eid,))
    log_action("Écoles", "École participante supprimée")


# ---- FAQ ----
def get_faq():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM faq ORDER BY date DESC").fetchall()
        return [dict(r) for r in rows]


def add_faq(question: str, reponse: str):
    rid = str(uuid.uuid4())
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        conn.execute("INSERT INTO faq (id, question, reponse, date) VALUES (?, ?, ?, ?)",
                     (rid, question[:300], reponse[:1500], now))
    log_action("Assistant IA", f"Nouvelle question ajoutée : {question[:50]}")
    return rid


def delete_faq(fid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM faq WHERE id = ?", (fid,))
    log_action("Assistant IA", "Question supprimée")


# ---- Config ----
def load_config() -> dict:
    DEFAULT_CONFIG = {
        "creator_password": "12345",
        "creator_token": "",
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
        "but_fenemof": "Fenemof est la Fédération Nationale de l'École Mère et de l'École Fille.",
        "cosudo_nom": "Cosudo",
        "cosudo_but": "",
        "cosudo_montant_par_eleve": 1350,
        "cosudo_transaction_number": "",
    }
    config = _get_all_config()
    merged = dict(DEFAULT_CONFIG)
    merged.update(config)
    return merged


def save_config(cfg: dict):
    for key, value in cfg.items():
        _set_config_value(key, value)


def get_creator_password_hash():
    return _get_config_value("creator_password_hash")


def set_creator_password_hash(password: str):
    salt, key = _hash_password(password)
    _set_config_value("creator_password_hash", salt.hex() + ":" + key.hex())


def verify_creator_password(password: str) -> bool:
    stored = _get_config_value("creator_password_hash")
    if not stored or ":" not in stored:
        stored_pw = _get_config_value("creator_password")
        if stored_pw and str(password) == str(stored_pw):
            set_creator_password_hash(password)
            return True
        return False
    salt = bytes.fromhex(stored.split(":")[0])
    key = bytes.fromhex(stored.split(":")[1])
    return _verify_password(password, salt, key)


def get_creator_token() -> str:
    return _get_config_value("creator_token")


def set_creator_token(token: str):
    _set_config_value("creator_token", token)


def check_login_rate_limit(ip: str = "") -> bool:
    with get_db() as conn:
        now = time.time()
        five_min_ago = now - 300
        conn.execute("DELETE FROM login_attempts WHERE timestamp < ?", (five_min_ago,))
        count = conn.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND timestamp > ? AND success = 0",
            (ip, five_min_ago)
        ).fetchone()[0]
        return count < 5


def record_login_attempt(ip: str = "", success: bool = False):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO login_attempts (ip, timestamp, success) VALUES (?, ?, ?)",
            (ip, time.time(), 1 if success else 0)
        )


# ---- Export ----
def export_registrations_csv():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM registrations ORDER BY date DESC").fetchall()
    return rows


def export_cosudo_csv():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM cosudo_registrations ORDER BY date DESC").fetchall()
    return rows


# ---- Backup ----
def create_backup() -> dict:
    with get_db() as conn:
        cfg = _get_all_config()
        regs = conn.execute("SELECT * FROM registrations").fetchall()
        cosudo_regs = conn.execute("SELECT * FROM cosudo_registrations").fetchall()
        anns = conn.execute("SELECT * FROM announcements").fetchall()
        parts = conn.execute("SELECT * FROM partners").fetchall()
        edts = conn.execute("SELECT * FROM editions").fetchall()
        hist = conn.execute("SELECT * FROM historique ORDER BY date DESC LIMIT 500").fetchall()
        reqs = conn.execute("SELECT * FROM partner_requests").fetchall()
        meil = conn.execute("SELECT * FROM meilleurs_eleves").fetchall()
        eco = conn.execute("SELECT * FROM ecoles").fetchall()
        faq = conn.execute("SELECT * FROM faq").fetchall()
        return {
            "outil": "Fenemof — sauvegarde complète (SQLite)",
            "cree_le": time.strftime("%Y-%m-%d %H:%M:%S"),
            "config": cfg,
            "registrations": [dict(r) for r in regs],
            "cosudo_registrations": [dict(r) for r in cosudo_regs],
            "announcements": [dict(r) for r in anns],
            "partners": [dict(r) for r in parts],
            "editions": [dict(r) for r in edts],
            "historique": [dict(r) for r in hist],
            "partner_requests": [dict(r) for r in reqs],
            "meilleurs_eleves": [dict(r) for r in meil],
            "ecoles": [dict(r) for r in eco],
            "faq": [dict(r) for r in faq],
        }


def save_backup(backup_data: dict):
    backup_dir = os.path.join(BASE_DIR, "backups")
    os.makedirs(backup_dir, exist_ok=True)
    fname = f"backup_{time.strftime('%Y%m%d_%H%M%S')}.json"
    with open(os.path.join(backup_dir, fname), "w", encoding="utf-8") as f:
        json.dump(backup_data, f, ensure_ascii=False, indent=2)
    return fname