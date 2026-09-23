(function () {
  "use strict";

  // ---------- Helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 4000);
  }
  function fcfa(n) { return Number(n || 0).toLocaleString("fr-FR") + " FCFA"; }
  function capSection(s) {
    var labels = { primaire: "Primaire", college: "Collège", lycee: "Lycée", universite: "Université" };
    return labels[s] || s;
  }

  // ---------- Données ----------
  var CLASSES = {
    college: ["4ème", "3ème"],
    lycee: ["2nde", "1ère", "Tle"],
    universite: ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2"]
  };
  var AGE_MAX = { college: 17, lycee: 22, universite: 35 };

  var payLinks = {
    college: "https://pay.yelen.co/pay/PW86-VFZB",
    lycee: "https://pay.yelen.co/pay/PW86-VFZB",
    universite: "https://pay.yelen.co/pay/PW86-VFZB"
  };
  var siteMontant = 2200; // par eleve
  var lastTel = "";

  // ---------- Infos du site ----------
  function loadSiteInfo() {
    fetch("/api/siteinfo")
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info.cosudo_payment_link_lycee) payLinks.lycee = info.cosudo_payment_link_lycee;
        if (info.cosudo_payment_link_universite) payLinks.universite = info.cosudo_payment_link_universite;
        if (info.cosudo_montant_par_eleve) siteMontant = Number(info.cosudo_montant_par_eleve) || siteMontant;
        else if (info.cosudo_montant_par_section) siteMontant = Number(info.cosudo_montant_par_section) || siteMontant;
        if (info.email) $("cosudo-contact-email").textContent = info.email;
        if (info.whatsapp || info.phone) {
          var tel = info.whatsapp || info.phone;
          $("cosudo-contact-phone").textContent = tel;
          var wa = document.querySelector(".whatsapp-float");
          if (wa && info.whatsapp) wa.href = "https://wa.me/242" + String(info.whatsapp).replace(/\D/g, "");
        }
        if (info.cosudo_logo) $("cosudo-logo").src = info.cosudo_logo;
      })
      .catch(function () { /* valeurs par défaut conservées */ });
  }

  // ---------- Classes selon la section ----------
  function fillClasses() {
    var sec = $("cosudo-section").value;
    var sel = $("cosudo-classe");
    sel.innerHTML = "";
    sel.disabled = !sec;
    var placeholder = el("option", "", sec ? "-- Choisir ta classe --" : "-- Choisir d'abord la section --");
    placeholder.value = "";
    sel.appendChild(placeholder);
    (CLASSES[sec] || []).forEach(function (c) {
      var o = el("option", "", c);
      o.value = c;
      sel.appendChild(o);
    });
  }

  // ---------- Inscription ----------
  function showError(msg) {
    var e = $("cosudo-error");
    e.textContent = msg;
    e.classList.remove("hidden");
    e.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function submitCosudoForm(ev) {
    ev.preventDefault();
    var err = $("cosudo-error");
    err.classList.add("hidden");

    var nom = $("c-nom").value.trim();
    var prenom = $("c-prenom").value.trim();
    var ageVal = $("c-age").value.trim();
    var tel = $("c-tel").value.trim();
    var section = $("cosudo-section").value;
    var classe = $("cosudo-classe").value;
    var sexe = $("c-sexe").value || "feminin";

    if (!nom) return showError("Indique ton nom.");
    if (!prenom) return showError("Indique ton prénom.");
    var age = parseInt(ageVal, 10);
    if (!ageVal || isNaN(age)) return showError("Indique ton âge.");
    if (age < 5 || age > 60) return showError("Indique un âge valide.");
    if (section && age > (AGE_MAX[section] || 35)) {
      return showError("Pour la section " + capSection(section) + ", l'âge maximum est " + AGE_MAX[section] + " ans.");
    }
    if (tel.replace(/\D/g, "").length < 6) return showError("Entre un numéro de téléphone valide.");
    if (!section) return showError("Choisis ta section : Collège, Lycée ou Université.");
    if (!classe) return showError("Choisis ta classe.");

    var btn = $("cosudo-form").querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Envoi en cours...";

    fetch("/api/register-cosudo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nom: nom,
        prenom: prenom,
        age: age,
        sexe: sexe,
        section: section,
        classe: classe,
        telephone: tel,
        captcha_id: (document.getElementById('captcha-cos').dataset ? document.getElementById('captcha-cos').dataset.captchaId || '' : ''),
        captcha_code: (document.getElementById('captcha-cos-code') || {}).value || ''
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription";
        if (res.status !== 200) {
          showError((res.body && res.body.error) || "Une erreur est survenue. Réessaie.");
          return;
        }
        // Inscription enregistrée -> page de paiement dédiée avec le lien de TA section.
        var url = "/paiement?type=cosudo&section=" + encodeURIComponent(section) +
          "&tel=" + encodeURIComponent(tel);
        if (res.body.id) url += "&recu=" + encodeURIComponent(res.body.id);
        window.location.href = url;
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription";
        showError("Impossible de contacter le serveur. Vérifie ta connexion.");
      });
  }

  // ---------- Espace personnel ----------
  function slugNom(s) {
    return String(s || "badge").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "badge";
  }

  function roundRectPath(x, px, py, pw, ph, pr) {
    x.beginPath();
    x.moveTo(px + pr, py);
    x.arcTo(px + pw, py, px + pw, py + ph, pr);
    x.arcTo(px + pw, py + ph, px, py + ph, pr);
    x.arcTo(px, py + ph, px, py, pr);
    x.arcTo(px, py, px + pw, py, pr);
    x.closePath();
  }

  function wrapCanvas(x, texte, maxW) {
    var mots = String(texte).split(" ");
    var lignes = [];
    var ligne = "";
    mots.forEach(function (m) {
      var essai = ligne ? ligne + " " + m : m;
      if (x.measureText(essai).width > maxW && ligne) {
        lignes.push(ligne);
        ligne = m;
      } else {
        ligne = essai;
      }
    });
    if (ligne) lignes.push(ligne);
    return lignes;
  }

  function telechargerBadgeCosudo(b, logoUrl, sectionTexte) {
    var W = 1200;
    var H = 800;
    var c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    var x = c.getContext("2d");
    var NAVY = "#0f172a";
    var VIOLET1 = "#4a044e";
    var VIOLET2 = "#a21caf";
    var ROSE = "#db2777";
    var ROSE_SOMBRE = "#9d174d";

    function diamant(cx, cy, r) {
      x.save();
      x.translate(cx, cy);
      x.rotate(Math.PI / 4);
      x.fillRect(-r, -r, r * 2, r * 2);
      x.restore();
    }

    function dessiner(logoImg) {
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, W, H);

      x.fillStyle = NAVY;
      x.fillRect(16, 16, W - 32, H - 32);
      x.fillStyle = "#ffffff";
      x.fillRect(30, 30, W - 60, H - 60);
      x.strokeStyle = ROSE;
      x.lineWidth = 4;
      x.strokeRect(44, 44, W - 88, H - 88);
      x.strokeStyle = "rgba(219,39,119,0.45)";
      x.lineWidth = 1.5;
      x.strokeRect(54, 54, W - 108, H - 108);
      x.fillStyle = ROSE;
      [ [44, 44], [W - 44, 44], [44, H - 44], [W - 44, H - 44] ].forEach(function (p) {
        diamant(p[0], p[1], 9);
      });

      var g = x.createLinearGradient(70, 0, W - 70, 0);
      g.addColorStop(0, VIOLET1);
      g.addColorStop(1, VIOLET2);
      x.fillStyle = g;
      x.fillRect(70, 70, W - 140, 130);
      x.fillStyle = ROSE;
      x.fillRect(70, 200, W - 140, 8);

      x.textAlign = "left";
      x.fillStyle = "#ffffff";
      x.font = "800 46px Poppins, Arial, sans-serif";
      x.fillText("COSUDO", 100, 138);
      x.font = "400 17px Poppins, Arial, sans-serif";
      x.globalAlpha = 0.92;
      x.fillText("Programme des lycéennes et étudiantes du Congo", 101, 170);
      x.globalAlpha = 1;

      if (logoImg) {
        var bx = W - 268;
        x.fillStyle = "#ffffff";
        roundRectPath(x, bx, 92, 150, 92, 12);
        x.fill();
        var ratio = Math.min(126 / logoImg.width, 68 / logoImg.height);
        var dw = Math.max(1, logoImg.width * ratio);
        var dh = Math.max(1, logoImg.height * ratio);
        x.drawImage(logoImg, bx + (150 - dw) / 2, 92 + (92 - dh) / 2, dw, dh);
      }

      var ribTxt = "BADGE OFFICIEL" + (b.edition ? " — ÉDITION " + b.edition : "");
      x.font = "700 25px Poppins, Arial, sans-serif";
      var rw = Math.max(340, x.measureText(ribTxt).width + 90);
      var rx = (W - rw) / 2;
      var ry = 250;
      x.fillStyle = "rgba(15,23,42,0.18)";
      roundRectPath(x, rx + 5, ry + 7, rw, 56, 28);
      x.fill();
      var gr = x.createLinearGradient(rx, ry, rx + rw, ry);
      gr.addColorStop(0, ROSE_SOMBRE);
      gr.addColorStop(0.5, ROSE);
      gr.addColorStop(1, ROSE_SOMBRE);
      x.fillStyle = gr;
      roundRectPath(x, rx, ry, rw, 56, 28);
      x.fill();
      x.fillStyle = "#ffffff";
      x.textAlign = "center";
      x.fillText(ribTxt, W / 2, ry + 37);

      var nom = b.ecole || "";
      var taille = nom.length > 38 ? 38 : nom.length > 24 ? 48 : 58;
      x.font = "800 " + taille + "px Poppins, Arial, sans-serif";
      x.fillStyle = NAVY;
      x.fillText(nom, W / 2, 392);

      var fy = 420;
      x.strokeStyle = ROSE;
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(W / 2 - 150, fy);
      x.lineTo(W / 2 - 22, fy);
      x.moveTo(W / 2 + 22, fy);
      x.lineTo(W / 2 + 150, fy);
      x.stroke();
      x.fillStyle = ROSE;
      diamant(W / 2 - 162, fy, 6);
      diamant(W / 2 + 162, fy, 6);
      diamant(W / 2, fy, 8);

      var yCur = 468;
      if (sectionTexte) {
        x.font = "700 24px Poppins, Arial, sans-serif";
        x.fillStyle = VIOLET2;
        x.fillText(sectionTexte.toUpperCase(), W / 2, yCur);
        yCur += 44;
      }

      if (b.message) {
        x.font = "italic 400 26px Georgia, serif";
        x.fillStyle = "#334155";
        var lignes = wrapCanvas(x, "\u00AB " + b.message + " \u00BB", 880).slice(0, 3);
        lignes.forEach(function (l) {
          x.fillText(l, W / 2, yCur);
          yCur += 38;
        });
      }

      if (b.date_paiement) {
        x.font = "400 17px Poppins, Arial, sans-serif";
        x.fillStyle = "#94a3b8";
        x.fillText("Paiement vérifié le " + b.date_paiement, W / 2, Math.max(yCur + 10, H - 118));
      }

      x.fillStyle = g;
      x.fillRect(70, H - 106, W - 140, 50);
      x.fillStyle = "#ffffff";
      x.font = "500 17px Poppins, Arial, sans-serif";
      x.fillText("Cosudo — Brazzaville, Massengo · WhatsApp 06 461 86 46", W / 2, H - 74);
    }

    function finir(logoImg) {
      dessiner(logoImg);
      c.toBlob(function (blob) {
        if (!blob) return;
        var u = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = u;
        a.download = "badge-cosudo-" + slugNom(b.ecole) + ".png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 3000);
      }, "image/png");
    }

    if (logoUrl) {
      var img = new Image();
      img.onload = function () { finir(img); };
      img.onerror = function () { finir(null); };
      img.src = logoUrl;
    } else {
      finir(null);
    }
  }

  function buildBadge(b, logoUrl) {
    var card = el("div", "badge-card");
    card.appendChild(el("div", "badge-ribbon", "Badge officiel - Édition " + (b.edition || "")));
    card.appendChild(el("h3", "badge-ecole", b.ecole));
    if (b.section) card.appendChild(el("div", "badge-section", capSection(b.section)));
    if (b.date_paiement) {
      card.appendChild(el("div", "badge-date", "Paiement vérifié le " + b.date_paiement));
    }
    card.appendChild(el("p", "badge-message", "\u00AB " + (b.message || "") + " \u00BB"));
    var dl = el("button", "btn btn-primary btn-small badge-dl");
    dl.type = "button";
    dl.textContent = "Télécharger mon badge (PNG)";
    dl.addEventListener("click", function () {
      telechargerBadgeCosudo(b, logoUrl, b.section ? capSection(b.section) : "");
    });
    card.appendChild(dl);
    return card;
  }

  function renderEspace(results) {
    var box = $("cosudo-espace-resultat");
    box.innerHTML = "";
    if (!results.length) {
      box.appendChild(el("p", "espace-vide",
        "Aucune inscription trouvée avec ce numéro. Vérifie que c'est bien le numéro utilisé lors de ton inscription."));
      return;
    }
    results.forEach(function (r) {
      var card = el("div", "espace-card");
      var head = el("div", "espace-head");
      if (r.logo) {
        var logo = el("img", "espace-logo");
        logo.src = r.logo;
        logo.alt = "Logo de " + r.etablissement;
        head.appendChild(logo);
      }
      var titleWrap = el("div");
      titleWrap.appendChild(el("h3", "", r.etablissement));
      head.appendChild(titleWrap);
      head.appendChild(el("span", "espace-type", "Cosudo"));
      card.appendChild(head);

      var infos = [];
      var secs = r.sections && r.sections.length ? r.sections : (r.section ? [r.section] : []);
      if (secs.length) infos.push(secs.map(capSection).join(", "));
      infos.push(fcfa(r.total));
      card.appendChild(el("p", "espace-info", infos.join("   ")));

      if (r.statut === "paye" && r.badge) {
        var msg = el("div", "espace-message");
        msg.textContent = "Félicitations ! Ton paiement est vérifié : ton badge officiel a été activé automatiquement.";
        card.appendChild(msg);
        card.appendChild(buildBadge(r.badge, r.logo));
      } else {
        var attente = el("div", "espace-attente");
      attente.textContent = "Paiement pas encore valid\u00e9 : pas d'acc\u00e8s au badge pour le moment. Apr\u00e8s ton paiement, attends AU MOINS 1 HEURE le temps que l'\u00e9quipe Cosudo v\u00e9rifie et valide. D\u00e8s que l'\u00e9quipe valide, ton badge officiel s'affiche automatiquement ici. Reviens apr\u00e8s 1 heure, merci de ta patience !";
        card.appendChild(attente);
      }
      box.appendChild(card);
    });
  }

  function runEspaceSearch(tel) {
    fetch("/api/cosudo-etablissement?telephone=" + encodeURIComponent(tel))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        if (res.status !== 200) {
          toast((res.body && res.body.error) || "Entrez un numéro valide.");
          return;
        }
        renderEspace(res.body.results || []);
      })
      .catch(function () { toast("Impossible de contacter le serveur."); });
  }

  // ---------- Init ----------
  function initRevealCosudo() {
    var targets = document.querySelectorAll(".section");
    targets.forEach(function (sec) { sec.classList.add("reveal"); });
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (t2) { t2.classList.add("visible"); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e2) {
        if (e2.isIntersecting) { e2.target.classList.add("visible"); obs.unobserve(e2.target); }
      });
    }, { threshold: 0.08 });
    targets.forEach(function (t3) { obs.observe(t3); });
  }

  // ---- CAPTCHA ----
  function loadCaptcha(boxId) {
    var box = document.getElementById(boxId);
    if (!box) return;
    fetch("/api/captcha")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        box.innerHTML = "";
        box.dataset.captchaId = d.id;
        var wrap = document.createElement("div");
        wrap.className = "captcha-wrap";
        var img = document.createElement("div");
        img.className = "captcha-img";
        img.innerHTML = d.svg;
        wrap.appendChild(img);
        var inp = document.createElement("input");
        inp.className = "captcha-input"; inp.type = "text";
        inp.id = boxId + "-code"; inp.maxLength = 5;
        inp.placeholder = "Recopie le code"; inp.autocomplete = "off"; inp.required = true;
        wrap.appendChild(inp);
        var rf = document.createElement("button");
        rf.className = "btn btn-small btn-outline captcha-refresh"; rf.type = "button";
        rf.textContent = "\u21bb";
        rf.addEventListener("click", function () { loadCaptcha(boxId); });
        wrap.appendChild(rf);
        box.appendChild(wrap);
      });
  }

  function init() {
    initRevealCosudo();
    loadSiteInfo();
    // Lycée présélectionné par défaut (toutes ses classes prêtes) ;
    // l'université reste à choisir par la personne concernée.
    $("cosudo-section").value = "lycee";
    fillClasses();

    $("cosudo-section").addEventListener("change", fillClasses);
    loadCaptcha("captcha-cos");
    $("cosudo-form").addEventListener("submit", submitCosudoForm);

    $("cosudo-espace-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var tel = $("cosudo-espace-tel").value.trim();
      if (tel.replace(/\D/g, "").length < 6) {
        toast("Entrez un numéro de téléphone valide.");
        return;
      }
      runEspaceSearch(tel);
    });

    $("cosudo-year").textContent = new Date().getFullYear();

    // Retour depuis la page paiement : ouvrir l'espace avec le numéro de l'URL.
    try {
      var telUrl = new URLSearchParams(window.location.search).get("tel");
      if (telUrl && telUrl.replace(/\D/g, "").length >= 6) {
        lastTel = telUrl;
        $("cosudo-espace-tel").value = telUrl;
        document.getElementById("cosudo-espace").scrollIntoView({ behavior: "smooth" });
        setTimeout(function () { runEspaceSearch(telUrl); }, 700);
      }
    } catch (e) { /* navigateur ancien : saisie manuelle */ }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
