(function () {
  "use strict";

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

  function api(url, opts) {
    opts = opts || {};
    var headers = opts.headers || {};
    var token = sessionStorage.getItem("fenemof_creator_token");
    if (token) headers["X-Creator-Token"] = token;
    if (opts.body instanceof FormData) {
      delete headers["Content-Type"];
    }
    opts.headers = headers;
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (d) {
        return { status: r.status, body: d };
      }).catch(function () {
        return { status: r.status, body: {} };
      });
    });
  }

  function handleError(res, fallback) {
    if (res.status !== 200) {
      toast((res.body && res.body.error) || fallback);
      return true;
    }
    return false;
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
        list.appendChild(el("p", "announce-empty", "Aucun etablissement inscrit pour le moment."));
        return;
      }
      regs.forEach(function (r) {
        var card = el("div", "reg-card");
        var head = el("div", "reg-head");
        var left = el("div");
        left.appendChild(el("div", "reg-title", r.etablissement));
        var meta = el("div", "reg-meta");
        var sections = r.sections || (r.section ? [r.section] : []);
        meta.appendChild(el("span", "section-tag", sections.join(", ")));
        var statutText = r.statut === "paye" ? "PAYE" : "En attente";
        var statutClass = r.statut === "paye" ? "pay-tag" : "pending-tag";
        meta.appendChild(el("span", statutClass, statutText));
        meta.appendChild(el("span", "", "  — " + (r.nb_eleves || 0) + " eleve(s) — " + r.date));
        left.appendChild(meta);
        head.appendChild(left);
        head.appendChild(el("span", "reg-meta", "▼"));
        card.appendChild(head);

        var body = el("div", "reg-body");
        body.classList.add("hidden");
        var info = el("div", "reg-info");
        info.textContent = "Telephone : " + r.telephone + "  •  Suivi : " + r.suivi;
        body.appendChild(info);

        var eleves = r.eleves || {};
        var secKeys = Object.keys(eleves);
        if (secKeys.length) {
          secKeys.forEach(function (sec) {
            var list = eleves[sec];
            if (list && list.length) {
              body.appendChild(el("h4", "", sec.toUpperCase()));
              var table = el("table");
              var thead = el("tr");
              ["Nom", "Prenom", "Classe", "Age", "Sexe"].forEach(function (h) {
                thead.appendChild(el("th", "", h));
              });
              table.appendChild(thead);
              list.forEach(function (e) {
                var tr = el("tr");
                [e.nom, e.prenom, e.classe, e.age, e.sexe].forEach(function (c) {
                  tr.appendChild(el("td", "", c));
                });
                table.appendChild(tr);
              });
              body.appendChild(table);
            }
          });
        }

        var actions = el("div", "reg-actions");
        if (r.statut !== "paye") {
          var badgeBtn = el("button", "btn btn-small btn-primary", "Ouvrir le badge");
          badgeBtn.addEventListener("click", function () {
            api("/api/set-statut", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: r.id, statut: "paye" }),
            }).then(function (rr) {
              if (handleError(rr, "Impossible d'ouvrir le badge.")) return;
              toast("Badge ouvert pour " + r.etablissement + " !");
              loadRegistrations();
            });
          });
          actions.appendChild(badgeBtn);
        } else {
          actions.appendChild(el("span", "badge-opened", "Badge ouvert"));
        }
        var del = el("button", "btn btn-small btn-danger", "Supprimer");
        del.addEventListener("click", function () {
          if (!confirm("Supprimer l'inscription de « " + r.etablissement + " » ?")) return;
          api("/api/delete-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          }).then(function (rr) {
            if (handleError(rr, "Impossible de supprimer.")) return;
            toast("Inscription supprimee.");
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
        left.appendChild(el("div", "reg-title", r.prenom + " " + r.nom));
        var meta = el("div", "reg-meta");
        meta.appendChild(el("span", "section-tag", r.niveau || ""));
        var statutText = r.statut === "paye" ? "PAYE" : "En attente";
        var statutClass = r.statut === "paye" ? "pay-tag" : "pending-tag";
        meta.appendChild(el("span", statutClass, statutText));
        meta.appendChild(el("span", "", "  — " + r.ville + " — " + r.date));
        left.appendChild(meta);
        head.appendChild(left);
        head.appendChild(el("span", "reg-meta", "▼"));
        card.appendChild(head);

        var body = el("div", "reg-body");
        body.classList.add("hidden");
        var info = el("div", "reg-info");
        info.textContent = "Telephone : " + r.telephone + "  •  Ville : " + r.ville + "  •  Niveau : " + r.niveau;
        body.appendChild(info);
        if (r.quartier || r.rue || r.avenue) {
          var addr = el("div", "reg-info");
          addr.textContent = "Adresse : " + [r.quartier, r.rue, r.avenue].filter(Boolean).join(", ");
          body.appendChild(addr);
        }

        var actions = el("div", "reg-actions");
        if (r.statut !== "paye") {
          var badgeBtn = el("button", "btn btn-small btn-primary", "Ouvrir le badge");
          badgeBtn.addEventListener("click", function () {
            api("/api/set-statut", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: r.id, statut: "paye" }),
            }).then(function (rr) {
              if (handleError(rr, "Impossible d'ouvrir le badge.")) return;
              toast("Badge ouvert pour " + r.prenom + " " + r.nom + " !");
              loadCosudoRegistrations();
            });
          });
          actions.appendChild(badgeBtn);
        } else {
          actions.appendChild(el("span", "badge-opened", "Badge ouvert"));
        }
        var del = el("button", "btn btn-small btn-danger", "Supprimer");
        del.addEventListener("click", function () {
          if (!confirm("Supprimer l'inscription Cosudo de « " + r.prenom + " " + r.nom + " » ?")) return;
          api("/api/delete-cosudo-registration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: r.id }),
          }).then(function (rr) {
            if (handleError(rr, "Impossible de supprimer.")) return;
            toast("Inscription Cosudo supprimee.");
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
      var cm = $("cosudo-config-montant"); if (cm) cm.value = b.cosudo_montant_par_eleve || 0;
      var ct = $("cosudo-config-transaction"); if (ct) ct.value = b.cosudo_transaction_number || "";
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

  // ---------- Init ----------
  function init() {
    // Login
    var loginOverlay = $("login-overlay");
    var dashboard = $("dashboard");
    var loginForm = $("login-form");
    var loginErr = $("login-error");

    function showDashboard() {
      loginOverlay.classList.add("hidden");
      dashboard.classList.remove("hidden");
      loadEverything();
      initTabs();
    }

    var token = sessionStorage.getItem("fenemof_creator_token");
    if (token) {
      api("/api/creator-check").then(function (res) {
        if (res.status === 200 && res.body.ok) showDashboard();
        else { sessionStorage.removeItem("fenemof_creator_token"); }
      });
    }

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = $("login-password").value.trim();
      if (!pw) { loginErr.textContent = "Entrez le mot de passe."; loginErr.classList.remove("hidden"); return; }
      fetch("/api/creator-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
        .then(function (res) {
          if (res.status !== 200 || !res.body.ok) {
            loginErr.textContent = (res.body && res.body.error) || "Mot de passe incorrect.";
            loginErr.classList.remove("hidden");
            return;
          }
          sessionStorage.setItem("fenemof_creator_token", res.body.token);
          showDashboard();
        })
        .catch(function () {
          loginErr.textContent = "Serveur indisponible.";
          loginErr.classList.remove("hidden");
        });
    });
    var vform = $("validate-by-num-form");
    if (vform) {
      vform.addEventListener("submit", function (e) {
        e.preventDefault();
        var num = $("validate-num-input").value.trim().toUpperCase();
        var out = $("validate-num-result");
        if (!num) { out.textContent = "Entrez un numero d'inscription."; out.className = "validate-result err"; return; }
        api("/api/validate-by-number?numero=" + encodeURIComponent(num)).then(function (res) {
          if (res.status !== 200 || !res.body.ok) {
            out.textContent = (res.body && res.body.error) || "Aucune inscription trouvee avec ce numero.";
            out.className = "validate-result err";
            return;
          }
          var d = res.body;
          var nom = d.nom || d.etablissement || "";
          out.textContent = nom + " — numero " + d.numero + " — statut : " + (d.statut === "paye" ? "PAYE" : "en attente");
          out.className = "validate-result " + (d.statut === "paye" ? "ok" : "warn");
          if (d.statut !== "paye") loadRegistrations();
          toast("Badge valide pour " + nom + " !");
        });
      });
    }

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
      var cm = $("cosudo-config-montant");
      var montant = cm ? Number(cm.value) : 0;
      var payload = {
        cosudo_nom: $("cosudo-config-nom").value.trim() || "Cosudo",
        cosudo_but: $("cosudo-config-but").value.trim(),
        cosudo_montant_par_eleve: montant,
        cosudo_transaction_number: ($("cosudo-config-transaction") || {}).value || "",
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
        btn.textContent = "\uD83D\uDCBE Sauvegarder toutes les données";
        if (handleError(res, "Impossible de créer la sauvegarde.")) return;
        $("backup-status").textContent = "Sauvegarde créée : " + res.body.fichier + " le " + res.body.date;
        toast("Sauvegarde complète créée !");
        loadHistorique();
      });
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
      var token = sessionStorage.getItem("fenemof_creator_token");
      fetch("/api/export", { headers: { "X-Creator-Token": token } })
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
          var a = el("a"); a.href = URL.createObjectURL(blob);
          a.download = "fenemof_etablissements.csv";
          document.body.appendChild(a); a.click(); a.remove();
        });
    });

    $("download-cosudo-csv").addEventListener("click", function () {
      var token = sessionStorage.getItem("fenemof_creator_token");
      fetch("/api/export-cosudo", { headers: { "X-Creator-Token": token } })
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
          var a = el("a"); a.href = URL.createObjectURL(blob);
          a.download = "cosudo_etablissements.csv";
          document.body.appendChild(a); a.click(); a.remove();
        });
    });

    initTabs();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
