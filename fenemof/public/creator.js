(function () {
  "use strict";

  var TOKEN_KEY = "fenemof_token";
  var token = localStorage.getItem(TOKEN_KEY) || "";

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

  // ---------- Appel API avec token ----------
  function api(url, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (d) {
        return { status: r.status, body: d };
      }).catch(function () {
        return { status: r.status, body: {} };
      });
    });
  }

  function handleError(res, fallback) {
    if (res.status === 401) {
      toast("Session expirée. Reconnectez-vous.");
      logout();
      return true;
    }
    if (res.status !== 200) {
      toast((res.body && res.body.error) || fallback);
      return true;
    }
    return false;
  }

  // ---------- Connexion ----------
  function login() {
    var password = $("login-password").value;
    api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password }),
    }).then(function (res) {
      if (res.status === 200) {
        token = res.body.token;
        localStorage.setItem(TOKEN_KEY, token);
        showDashboard();
        toast("Bienvenue dans l'espace créateur !");
      } else {
        var err = $("login-error");
        err.textContent = (res.body && res.body.error) || "Erreur de connexion.";
        err.classList.remove("hidden");
      }
    });
  }

  function logout() {
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    $("dashboard").classList.add("hidden");
    $("login-screen").classList.remove("hidden");
  }

  function showDashboard() {
    $("login-screen").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
    loadEverything();
  }

  function loadEverything() {
    loadAnnouncements();
    loadRegistrations();
    loadCosudoRegistrations();
    loadCosudoConfig();
    loadCosudoPhotos();
    loadLogo();
    loadPhotos();
    loadPartners();
    loadEditions();
    loadConfigInfo();
    loadButMontant();
    loadDemandes();
    loadMeilleurs();
    loadEcoles();
    loadProfil();
    loadFAQ();
    loadEditionPhotos();
    loadHistorique();
  }

  // ---------- Onglets ----------
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        $("tab-" + btn.dataset.tab).classList.add("active");
      });
    });
  }

  // ---------- Annonces ----------
  function loadAnnouncements() {
    api("/api/announcements").then(function (res) {
      if (handleError(res, "Impossible de charger les annonces.")) return;
      var list = $("announce-list");
      list.innerHTML = "";
      var anns = res.body.announcements || [];
      if (!anns.length) {
        list.appendChild(el("p", "announce-empty", "Aucune annonce publiée pour le moment."));
        return;
      }
      anns.forEach(function (a) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", a.texte));
        left.appendChild(el("div", "a-date", "Publié le " + a.date));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          api("/api/delete-announce", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: a.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer l'annonce.")) return;
            toast("Annonce supprimée.");
            loadAnnouncements();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Établissements ----------
  var SECTION_LABEL = { primaire: "Primaire", college: "Collège", lycee: "Lycée" };

  function loadRegistrations() {
    api("/api/registrations").then(function (res) {
      if (handleError(res, "Impossible de charger la liste.")) return;
      var regs = res.body.registrations || [];
      $("reg-count").textContent = regs.length + " inscription(s) au total";
      var list = $("reg-list");
      list.innerHTML = "";
      if (!regs.length) {
        list.appendChild(el("p", "announce-empty", "Aucun établissement inscrit pour le moment."));
        return;
      }
      regs.forEach(function (r) {
        var card = el("div", "reg-card");
        var head = el("div", "reg-head");
        var left = el("div");
        left.appendChild(el("div", "reg-title", r.etablissement));
        var meta = el("div", "reg-meta");
        meta.appendChild(el("span", "section-tag", SECTION_LABEL[r.section] || r.section));
        meta.appendChild(el("span", "pay-tag", r.paiement));
        meta.appendChild(el("span", "", "  — " + (r.eleves || []).length + " élève(s) — " + r.date));
        left.appendChild(meta);
        head.appendChild(left);
        head.appendChild(el("span", "reg-meta", "▼"));
        card.appendChild(head);

        var body = el("div", "reg-body");
        body.classList.add("hidden");
        var info = el("div", "reg-info");
        info.textContent = "Téléphone établissement : " + r.telephone + "  •  Personnel de suivi : " + r.suivi + "  •  N° transaction : " + r.transaction;
        body.appendChild(info);
        var table = el("table");
        var thead = el("tr");
        ["N°", "Nom", "Prénom", "Âge", "Sexe", "Classe"].forEach(function (h) {
          var th = el("th", "", h);
          thead.appendChild(th);
        });
        table.appendChild(thead);
        (r.eleves || []).forEach(function (e, i) {
          var tr = el("tr");
          [String(i + 1), e.nom, e.prenom, e.age, e.sexe, e.classe].forEach(function (c) {
            var td = el("td", "", c);
            tr.appendChild(td);
          });
          table.appendChild(tr);
        });
        body.appendChild(table);
        var actions = el("div", "reg-actions");
        var del = el("button", "btn btn-small btn-danger", "Supprimer l'inscription");
        del.addEventListener("click", function () {
          if (!confirm("Supprimer l'inscription de « " + r.etablissement + " » ?")) return;
          api("/api/delete-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          }).then(function (rr) {
            if (handleError(rr, "Impossible de supprimer.")) return;
            toast("Inscription supprimée.");
            loadRegistrations();
          });
        });
        actions.appendChild(del);
        body.appendChild(actions);
        card.appendChild(body);

        head.addEventListener("click", function () { body.classList.toggle("hidden"); });
        list.appendChild(card);
      });
    });
  }

  // ---------- Inscriptions Cosudo ----------
  var COSUDO_SECTION_LABEL = { college: "Collège", lycee: "Lycée", universite: "Université" };

  function loadCosudoRegistrations() {
    api("/api/cosudo-registrations").then(function (res) {
      if (handleError(res, "Impossible de charger les inscriptions Cosudo.")) return;
      var regs = res.body.registrations || [];
      $("cosudo-reg-count").textContent = regs.length + " inscription(s) Cosudo au total";
      var list = $("cosudo-reg-list");
      list.innerHTML = "";
      if (!regs.length) {
        list.appendChild(el("p", "announce-empty", "Aucune inscription Cosudo pour le moment."));
        return;
      }
      regs.forEach(function (r) {
        var card = el("div", "reg-card");
        var head = el("div", "reg-head");
        var left = el("div");
        left.appendChild(el("div", "reg-title", r.etablissement));
        var meta = el("div", "reg-meta");
        meta.appendChild(el("span", "section-tag", COSUDO_SECTION_LABEL[r.section] || r.section));
        meta.appendChild(el("span", "pay-tag", r.paiement));
        meta.appendChild(el("span", "", "  — " + (r.eleves || []).length + " élève(s) — " + r.date));
        left.appendChild(meta);
        head.appendChild(left);
        head.appendChild(el("span", "reg-meta", "▼"));
        card.appendChild(head);

        var body = el("div", "reg-body");
        body.classList.add("hidden");
        var info = el("div", "reg-info");
        info.textContent = "Téléphone établissement : " + r.telephone + "  •  Personnel de suivi : " + r.suivi + "  •  N° transaction : " + r.transaction;
        body.appendChild(info);
        var table = el("table");
        var thead = el("tr");
        ["N°", "Nom", "Prénom", "Âge", "Sexe", "Classe"].forEach(function (h) {
          var th = el("th", "", h);
          thead.appendChild(th);
        });
        table.appendChild(thead);
        (r.eleves || []).forEach(function (e, i) {
          var tr = el("tr");
          [String(i + 1), e.nom, e.prenom, e.age, e.sexe, e.classe].forEach(function (c) {
            var td = el("td", "", c);
            tr.appendChild(td);
          });
          table.appendChild(tr);
        });
        body.appendChild(table);
        var actions = el("div", "reg-actions");
        var del = el("button", "btn btn-small btn-danger", "Supprimer l'inscription");
        del.addEventListener("click", function () {
          if (!confirm("Supprimer l'inscription Cosudo de « " + r.etablissement + " » ?")) return;
          api("/api/delete-cosudo-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          }).then(function (rr) {
            if (handleError(rr, "Impossible de supprimer.")) return;
            toast("Inscription Cosudo supprimée.");
            loadCosudoRegistrations();
          });
        });
        actions.appendChild(del);
        body.appendChild(actions);
        card.appendChild(body);

        head.addEventListener("click", function () { body.classList.toggle("hidden"); });
        list.appendChild(card);
      });
    });
  }

  // ---------- Configuration Cosudo ----------
  function loadCosudoConfig() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger la configuration Cosudo.")) return;
      var b = res.body;
      $("cosudo-config-nom").value = b.cosudo_nom || "";
      $("cosudo-config-montant").value = b.cosudo_montant_par_eleve || 0;
      $("cosudo-config-transaction").value = b.cosudo_transaction_number || "";
      $("cosudo-config-but").value = b.cosudo_but || "";
    });
  }

  // ---------- Photos Cosudo ----------
  function loadCosudoPhotos() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les photos Cosudo.")) return;
      renderCosudoPhotoList(res.body.cosudo_photos || []);
    });
  }

  function renderCosudoPhotoList(photos) {
    var grid = $("cosudo-photo-list");
    grid.innerHTML = "";
    if (!photos.length) {
      grid.appendChild(el("p", "photo-empty", "Aucune photo Cosudo publiée."));
      return;
    }
    photos.forEach(function (name) {
      var item = el("div", "creator-photo");
      var img = el("img");
      img.src = "/uploads/cosudo/" + name;
      img.alt = name;
      var actions = el("div", "photo-actions");
      var del = el("button", "", "Supprimer");
      del.addEventListener("click", function () {
        if (!confirm("Supprimer cette photo Cosudo ?")) return;
        api("/api/delete-cosudo-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        }).then(function (r) {
          if (handleError(r, "Impossible de supprimer la photo Cosudo.")) return;
          toast("Photo Cosudo supprimée.");
          loadCosudoPhotos();
        });
      });
      actions.appendChild(del);
      item.appendChild(img);
      item.appendChild(actions);
      grid.appendChild(item);
    });
  }

  // ---------- Logo ----------
  function loadLogo() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger le logo.")) return;
      var img = $("current-logo");
      var info = res.body;
      if (info.logo) {
        img.src = info.logo;
        img.style.display = "inline-block";
        document.querySelector(".logo-preview .muted").style.display = "none";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
        document.querySelector(".logo-preview .muted").style.display = "block";
      }
    });
  }

  // ---------- Photos ----------
  function loadPhotos() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les photos.")) return;
      renderPhotoList(res.body.photos || []);
    });
  }

  function renderPhotoList(photos) {
    var grid = $("photo-list");
    grid.innerHTML = "";
    if (!photos.length) {
      grid.appendChild(el("p", "photo-empty", "Aucune photo publiée."));
      return;
    }
    photos.forEach(function (name) {
      var item = el("div", "creator-photo");
      var img = el("img");
      img.src = "/uploads/photos/" + name;
      img.alt = name;
      var actions = el("div", "photo-actions");
      var del = el("button", "", "Supprimer");
      del.addEventListener("click", function () {
        if (!confirm("Supprimer cette photo ?")) return;
        api("/api/delete-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        }).then(function (r) {
          if (handleError(r, "Impossible de supprimer la photo.")) return;
          toast("Photo supprimée.");
          loadPhotos();
        });
      });
      actions.appendChild(del);
      item.appendChild(img);
      item.appendChild(actions);
      grid.appendChild(item);
    });
  }

  // ---------- Partenaires ----------
  function loadPartners() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les partenaires.")) return;
      var list = $("partner-list");
      list.innerHTML = "";
      var partners = res.body.partners || [];
      if (!partners.length) {
        list.appendChild(el("p", "announce-empty", "Aucun partenaire publié."));
        return;
      }
      partners.forEach(function (p) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", p.nom + (p.description ? " — " + p.description : "")));
        left.appendChild(el("div", "a-date", "Ajouté le " + p.date));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          if (!confirm("Supprimer le partenaire « " + p.nom + " » ?")) return;
          api("/api/delete-partner", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: p.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer le partenaire.")) return;
            toast("Partenaire supprimé.");
            loadPartners();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Éditions ----------
  function loadEditions() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les éditions.")) return;
      var list = $("edition-list");
      list.innerHTML = "";
      var editions = res.body.editions || [];
      if (!editions.length) {
        list.appendChild(el("p", "announce-empty", "Aucune édition publiée."));
        return;
      }
      editions.forEach(function (e) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", e.titre));
        left.appendChild(el("div", "a-date", "Publié le " + e.date + (e.fichier ? " — avec document" : "")));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          if (!confirm("Supprimer l'édition « " + e.titre + " » ?")) return;
          api("/api/delete-edition", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: e.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer l'édition.")) return;
            toast("Édition supprimée.");
            loadEditions();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- But & Montant ----------
  function loadButMontant() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les réglages.")) return;
      $("but-text").value = res.body.but_fenemof || "";
      $("montant-input").value = res.body.montant_par_eleve || 0;
      $("edition-actuelle-input").value = res.body.edition_actuelle || "";
    });
  }

  // ---------- Demandes de partenariat ----------
  function loadDemandes() {
    api("/api/partner-requests").then(function (res) {
      if (handleError(res, "Impossible de charger les demandes.")) return;
      var list = $("request-list");
      list.innerHTML = "";
      var reqs = res.body.requests || [];
      if (!reqs.length) {
        list.appendChild(el("p", "announce-empty", "Aucune demande de partenariat pour le moment."));
        return;
      }
      reqs.forEach(function (r) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", r.nom + (r.organisation ? " — " + r.organisation : "")));
        var meta = [];
        if (r.telephone) meta.push("Tél : " + r.telephone);
        meta.push(r.date);
        left.appendChild(el("div", "a-date", meta.join(" • ")));
        if (r.message) left.appendChild(el("p", "", "Message : " + r.message));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          api("/api/delete-partner-request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          }).then(function (rr) {
            if (handleError(rr, "Impossible de supprimer la demande.")) return;
            toast("Demande supprimée.");
            loadDemandes();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Meilleurs élèves ----------
  function loadMeilleurs() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les meilleurs élèves.")) return;
      var list = $("meilleur-list");
      list.innerHTML = "";
      var eleves = res.body.meilleurs_eleves || [];
      if (!eleves.length) {
        list.appendChild(el("p", "announce-empty", "Aucun meilleur élève publié."));
        return;
      }
      eleves.forEach(function (m) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", m.prenom + " " + m.nom + (m.ecole ? " — " + m.ecole : "")));
        var infos = [];
        if (m.age) infos.push(m.age + " ans");
        if (m.classe) infos.push(m.classe);
        infos.push("Édition " + m.annee);
        left.appendChild(el("div", "a-date", infos.join(" • ")));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          api("/api/delete-meilleur-eleve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: m.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer.")) return;
            toast("Meilleur élève supprimé.");
            loadMeilleurs();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Écoles participantes ----------
  function loadEcoles() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les écoles.")) return;
      var list = $("ecole-list");
      list.innerHTML = "";
      var ecoles = res.body.ecoles || [];
      if (!ecoles.length) {
        list.appendChild(el("p", "announce-empty", "Aucune école enregistrée."));
        return;
      }
      ecoles.forEach(function (e) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", e.nom + (e.section ? " (" + e.section + ")" : "")));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          api("/api/delete-ecole", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: e.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer.")) return;
            toast("École supprimée.");
            loadEcoles();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Profil créateur ----------
  function loadProfil() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger le profil.")) return;
      var c = res.body.createur || {};
      $("profil-nom").value = c.nom || "";
      $("profil-prenom").value = c.prenom || "";
      var img = $("profil-photo-preview");
      var empty = $("profil-photo-empty");
      if (c.photo) {
        img.src = c.photo;
        img.style.display = "inline-block";
        empty.style.display = "none";
      } else {
        img.removeAttribute("src");
        img.style.display = "none";
        empty.style.display = "block";
      }
    });
  }

  // ---------- Assistant IA ----------
  function loadFAQ() {
    api("/api/faq").then(function (res) {
      if (handleError(res, "Impossible de charger l'assistant.")) return;
      var list = $("faq-list");
      list.innerHTML = "";
      var faq = res.body.faq || [];
      if (!faq.length) {
        list.appendChild(el("p", "announce-empty", "Aucune question personnalisée."));
        return;
      }
      faq.forEach(function (f) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("p", "", f.question));
        left.appendChild(el("div", "a-date", f.reponse.slice(0, 80)));
        var btn = el("button", "btn btn-small btn-danger", "Supprimer");
        btn.addEventListener("click", function () {
          api("/api/delete-faq", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: f.id }),
          }).then(function (r) {
            if (handleError(r, "Impossible de supprimer.")) return;
            toast("Question supprimée.");
            loadFAQ();
          });
        });
        item.appendChild(left);
        item.appendChild(btn);
        list.appendChild(item);
      });
    });
  }

  // ---------- Photos par édition ----------
  function loadEditionPhotos() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les photos.")) return;
      var grid = $("edition-photo-list");
      grid.innerHTML = "";
      var editions = res.body.editions || [];
      var count = 0;
      editions.forEach(function (e) {
        (e.photos || []).forEach(function (ph) {
          count++;
          var item = el("div", "creator-photo");
          var img = el("img");
          img.src = "/uploads/editions/" + ph;
          img.alt = "Édition " + e.annee;
          var actions = el("div", "photo-actions");
          actions.appendChild(el("div", "a-date", "Édition " + e.annee));
          var del = el("button", "", "Supprimer");
          del.addEventListener("click", function () {
            api("/api/delete-edition-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ annee: e.annee, photo: ph }),
            }).then(function (r) {
              if (handleError(r, "Impossible de supprimer.")) return;
              toast("Photo supprimée.");
              loadEditionPhotos();
            });
          });
          actions.appendChild(del);
          item.appendChild(img);
          item.appendChild(actions);
          grid.appendChild(item);
        });
      });
      if (!count) {
        grid.appendChild(el("p", "photo-empty", "Aucune photo par édition pour le moment."));
      }
    });
  }

  // ---------- Historique ----------
  function loadHistorique() {
    api("/api/historique").then(function (res) {
      if (handleError(res, "Impossible de charger l'historique.")) return;
      var list = $("historique-list");
      list.innerHTML = "";
      var hist = res.body.historique || [];
      if (!hist.length) {
        list.appendChild(el("p", "announce-empty", "Aucun événement enregistré."));
        return;
      }
      hist.forEach(function (h) {
        var item = el("div", "announce-item");
        var left = el("div");
        left.appendChild(el("span", "historique-badge", h.type));
        left.appendChild(el("p", "", h.detail));
        left.appendChild(el("div", "a-date", h.date));
        item.appendChild(left);
        list.appendChild(item);
      });
    });
  }

  // ---------- Config (paramètres) ----------
  function loadConfigInfo() {
    api("/api/siteinfo").then(function (res) {
      if (handleError(res, "Impossible de charger les informations.")) return;
      var b = res.body;
      $("info-config").textContent = JSON.stringify({
        nom_du_site: b.site_name,
        numero_transaction: b.transaction_number,
        telephone: b.phone,
        email: b.email,
        localisation: b.location,
        montant_par_eleve: b.montant_par_eleve + " FCFA",
      }, null, 2);
    });
  }

  // ---------- Init événements ----------
  function init() {
    $("login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      login();
    });
    $("logout-btn").addEventListener("click", logout);

    $("announce-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var text = $("announce-text").value.trim();
      if (!text) { toast("Écrivez le texte de l'annonce."); return; }
      api("/api/announce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: text }),
      }).then(function (res) {
        if (handleError(res, "Impossible d'envoyer l'annonce.")) return;
        $("announce-text").value = "";
        toast("Annonce publiée !");
        loadAnnouncements();
      });
    });

    $("logo-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var file = $("logo-file").files[0];
      if (!file) { toast("Choisissez d'abord une image."); return; }
      var fd = new FormData();
      fd.append("fichier", file);
      api("/api/upload-logo", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible de mettre à jour le logo.")) return;
        toast("Logo mis à jour !");
        loadLogo();
      });
    });

    $("photo-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var files = $("photo-files").files;
      if (!files.length) { toast("Choisissez d'abord des images."); return; }
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) { fd.append("fichier", files[i]); }
      api("/api/upload-photo", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible de publier les photos.")) return;
        $("photo-files").value = "";
        toast(files.length + " photo(s) publiée(s) !");
        loadPhotos();
      });
    });

    $("cosudo-photo-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var files = $("cosudo-photo-files").files;
      if (!files.length) { toast("Choisissez d'abord des images Cosudo."); return; }
      var fd = new FormData();
      for (var i = 0; i < files.length; i++) { fd.append("fichier", files[i]); }
      api("/api/upload-cosudo-photo", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible de publier les photos Cosudo.")) return;
        $("cosudo-photo-files").value = "";
        toast(files.length + " photo(s) Cosudo publiée(s) !");
        loadCosudoPhotos();
      });
    });

    $("cosudo-config-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var montant = Number($("cosudo-config-montant").value);
      if (!(montant >= 0)) { toast("Le montant doit être valide."); return; }
      var payload = {
        cosudo_nom: $("cosudo-config-nom").value.trim() || "Cosudo",
        cosudo_but: $("cosudo-config-but").value.trim(),
        cosudo_montant_par_eleve: montant,
        cosudo_transaction_number: $("cosudo-config-transaction").value.trim(),
      };
      api("/api/update-cosudo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (res) {
        if (handleError(res, "Impossible d'enregistrer Cosudo.")) return;
        toast("Cosudo enregistré !");
        loadCosudoConfig();
      });
    });

    $("password-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pwd = $("new-password").value;
      if (pwd.length < 4) { toast("Le mot de passe doit avoir au moins 4 caractères."); return; }
      api("/api/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: pwd }),
      }).then(function (res) {
        if (handleError(res, "Impossible de changer le mot de passe.")) return;
        $("new-password").value = "";
        toast("Mot de passe changé !");
      });
    });

    $("partner-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nom = $("partner-nom").value.trim();
      if (!nom) { toast("Entrez le nom du partenaire."); return; }
      var fd = new FormData();
      fd.append("nom", nom);
      fd.append("description", $("partner-desc").value.trim());
      var logoFile = $("partner-logo").files[0];
      if (logoFile) fd.append("fichier", logoFile);
      api("/api/partner", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible d'ajouter le partenaire.")) return;
        $("partner-nom").value = "";
        $("partner-desc").value = "";
        $("partner-logo").value = "";
        toast("Partenaire ajouté !");
        loadPartners();
      });
    });

    $("edition-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var titre = $("edition-titre").value.trim();
      if (!titre) { toast("Entrez le titre de l'édition."); return; }
      var fd = new FormData();
      fd.append("titre", titre);
      fd.append("annee", $("edition-annee").value.trim());
      fd.append("description", $("edition-desc").value.trim());
      var photo = $("edition-photo").files[0];
      var doc = $("edition-fichier").files[0];
      if (photo) fd.append("fichier", photo);
      if (doc) fd.append("fichier", doc);
      api("/api/edition", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible de publier l'édition.")) return;
        $("edition-titre").value = "";
        $("edition-annee").value = "";
        $("edition-desc").value = "";
        $("edition-photo").value = "";
        $("edition-fichier").value = "";
        toast("Édition publiée !");
        loadEditions();
      });
    });

    $("edition-actuelle-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var annee = $("edition-actuelle-input").value.trim();
      if (!annee) { toast("Indiquez l'année de l'édition actuelle."); return; }
      api("/api/update-edition-actuelle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edition_actuelle: annee }),
      }).then(function (res) {
        if (handleError(res, "Impossible de définir l'édition actuelle.")) return;
        toast("Édition actuelle définie : " + res.body.edition_actuelle);
      });
    });

    $("edition-photo-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var annee = $("ed-photo-annee").value.trim();
      var files = $("ed-photo-files").files;
      if (!annee) { toast("Indiquez l'année de l'édition."); return; }
      if (!files.length) { toast("Choisissez d'abord des photos."); return; }
      var fd = new FormData();
      fd.append("annee", annee);
      for (var i = 0; i < files.length; i++) { fd.append("fichier", files[i]); }
      api("/api/edition-photo", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible d'ajouter les photos.")) return;
        $("ed-photo-annee").value = "";
        $("ed-photo-files").value = "";
        toast(res.body.count + " photo(s) ajoutée(s) à l'édition " + annee + " !");
        loadEditionPhotos();
      });
    });

    $("meilleur-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nom = $("m-nom").value.trim();
      var prenom = $("m-prenom").value.trim();
      if (!nom || !prenom) { toast("Nom et prénom de l'élève obligatoires."); return; }
      var fd = new FormData();
      fd.append("nom", nom);
      fd.append("prenom", prenom);
      fd.append("age", $("m-age").value);
      fd.append("classe", $("m-classe").value.trim());
      fd.append("ecole", $("m-ecole").value.trim());
      fd.append("annee", $("m-annee").value.trim());
      var photo = $("m-photo").files[0];
      if (photo) fd.append("fichier", photo);
      api("/api/meilleur-eleve", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible de publier le meilleur élève.")) return;
        ["m-nom", "m-prenom", "m-age", "m-classe", "m-ecole", "m-annee", "m-photo"].forEach(function (id) { $(id).value = ""; });
        toast("Meilleur élève publié !");
        loadMeilleurs();
      });
    });

    $("ecole-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nom = $("ecole-nom").value.trim();
      if (!nom) { toast("Entrez le nom de l'école."); return; }
      api("/api/ecole", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: nom, section: $("ecole-section").value }),
      }).then(function (res) {
        if (handleError(res, "Impossible d'ajouter l'école.")) return;
        $("ecole-nom").value = "";
        $("ecole-section").value = "";
        toast("École ajoutée !");
        loadEcoles();
      });
    });

    $("profil-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData();
      fd.append("nom", $("profil-nom").value.trim());
      fd.append("prenom", $("profil-prenom").value.trim());
      var photo = $("profil-photo").files[0];
      if (photo) fd.append("fichier", photo);
      api("/api/createur-profile", { method: "POST", body: fd }).then(function (res) {
        if (handleError(res, "Impossible d'enregistrer le profil.")) return;
        $("profil-photo").value = "";
        toast("Profil enregistré !");
        loadProfil();
      });
    });

    $("faq-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var question = $("faq-question").value.trim();
      var reponse = $("faq-reponse").value.trim();
      if (!question || !reponse) { toast("La question et la réponse sont obligatoires."); return; }
      api("/api/faq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question, reponse: reponse }),
      }).then(function (res) {
        if (handleError(res, "Impossible d'ajouter à l'assistant.")) return;
        $("faq-question").value = "";
        $("faq-reponse").value = "";
        toast("Question ajoutée à l'assistant !");
        loadFAQ();
      });
    });

    $("historique-refresh").addEventListener("click", function () {
      loadHistorique();
      toast("Historique actualisé.");
    });

    $("backup-btn").addEventListener("click", function () {
      var btn = $("backup-btn");
      btn.disabled = true;
      btn.textContent = "Sauvegarde en cours...";
      api("/api/backup", { method: "POST" }).then(function (res) {
        btn.disabled = false;
        btn.textContent = "&#128190; Sauvegarder toutes les données";
        if (handleError(res, "Impossible de créer la sauvegarde.")) return;
        $("backup-status").textContent = "Sauvegarde créée : " + res.body.fichier + " le " + res.body.date;
        toast("Sauvegarde complète créée !");
        loadHistorique();
      });
    });

    $("toggle-password").addEventListener("click", function () {
      var input = $("login-password");
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      this.innerHTML = show ? "&#128064;" : "&#128065;";
    });

    $("but-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var texte = $("but-text").value.trim();
      if (!texte) { toast("Écrivez le but de Fenemof."); return; }
      api("/api/update-but", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte: texte }),
      }).then(function (res) {
        if (handleError(res, "Impossible d'enregistrer le but.")) return;
        toast("But de Fenemof enregistré !");
      });
    });

    $("montant-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var montant = $("montant-input").value;
      api("/api/update-montant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montant_par_eleve: montant }),
      }).then(function (res) {
        if (handleError(res, "Impossible d'enregistrer le montant.")) return;
        toast("Montant enregistré : " + res.body.montant_par_eleve + " FCFA / élève.");
      });
    });

    $("download-csv").addEventListener("click", function () {
      var a = el("a");
      a.href = "/api/export";
      a.download = "fenemof_etablissements.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    $("download-cosudo-csv").addEventListener("click", function () {
      var a = el("a");
      a.href = "/api/export-cosudo";
      a.download = "cosudo_etablissements.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    initTabs();

    if (token) {
      // vérifier que le token est valide
      api("/api/registrations").then(function (res) {
        if (res.status === 200) {
          showDashboard();
        } else {
          logout();
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
