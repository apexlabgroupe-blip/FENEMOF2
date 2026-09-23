(function () {
  "use strict";

  var API = {
    siteinfo: "/api/siteinfo",
    register: "/api/register",
    registerCosudo: "/api/register-cosudo",
  };

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---------- Toast ----------
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 4000);
  }

  // ---------- Chargement des infos du site ----------
  function loadSiteInfo() {
    fetch(API.siteinfo)
      .then(function (r) { return r.json(); })
      .then(function (info) {
        // Logo
        var logo = $("site-logo");
        if (info.logo) {
          logo.src = info.logo;
          logo.classList.remove("hidden");
        }
        // Infos de contact
        if (info.location) $("hero-location").textContent = info.location;
        if (info.email) {
          $("contact-email").textContent = info.email;
          $("pay-email").textContent = info.email;
        }
        if (info.phone) {
          $("contact-phone").textContent = info.phone;
          $("pay-phone").textContent = info.phone;
        }
        if (info.transaction_number) {
          $("pay-transaction").textContent = info.transaction_number;
          $("pay-mtn").textContent = info.transaction_number;
          $("pay-airtel").textContent = info.transaction_number;
        }
        if (info.cosudo_transaction_number) {
          var cosudoPay = $("cosudo-pay-transaction");
          if (cosudoPay) cosudoPay.textContent = info.cosudo_transaction_number;
        }
        // Statistiques
        $("stat-ecoles").textContent = info.registrations_count || 0;
        // Cosudo
        renderCosudoGallery(info.cosudo_photos || []);
        if (info.cosudo_registrations_count) $("cosudo-stat-ecoles").textContent = info.cosudo_registrations_count;
        if (info.cosudo_but) {
          var cosudoBut = $("cosudo-but-text");
          if (cosudoBut) cosudoBut.textContent = info.cosudo_but;
        }
        // Annonces
        renderAnnouncements(info.announcements || []);
        // Galerie
        renderGallery(info.photos || []);
        // But de Fenemof
        if (info.but_fenemof) $("but-text").textContent = info.but_fenemof;
        // Montant par élève
        if (info.montant_par_eleve) {
          $("pay-montant").textContent = info.montant_par_eleve.toLocaleString("fr-FR") + " FCFA";
        }
        // Partenaires
        renderPartners(info.partners || []);
        // Éditions
        renderEditions(info.editions || []);
        // Meilleur élève
        renderMeilleurs(info.meilleurs_eleves || []);
        // Écoles participantes
        renderEcoles(info.ecoles || []);
        // Le créateur
        renderCreateur(info.createur || {});
        // WhatsApp
        if (info.whatsapp) {
          var waNum = info.whatsapp.replace(/[^0-9]/g, "");
          $("whatsapp-float").href = "https://wa.me/242" + waNum;
          $("contact-whatsapp").textContent = info.whatsapp;
        }
      })
      .catch(function () {
        // le serveur n'a pas pu être contacté
      });
  }

  // ---------- Meilleur élève ----------
  function renderMeilleurs(list) {
    var grid = $("meilleurs-grid");
    grid.innerHTML = "";
    if (!list.length) {
      grid.appendChild(el("p", "", "Le meilleur élève sera annoncé prochainement."));
      return;
    }
    list.forEach(function (m) {
      var card = el("div", "meilleur-card");
      if (m.photo) {
        var img = el("img", "meilleur-photo");
        img.src = "/uploads/eleves/" + m.photo;
        img.alt = m.prenom + " " + m.nom;
        img.loading = "lazy";
        card.appendChild(img);
      }
      var body = el("div", "meilleur-body");
      body.appendChild(el("span", "meilleur-badge", "Meilleur élève " + m.annee));
      body.appendChild(el("h3", "", m.prenom + " " + m.nom));
      if (m.ecole) body.appendChild(el("p", "", m.ecole));
      var infos = [];
      if (m.age) infos.push(m.age + " ans");
      if (m.classe) infos.push(capSection(m.classe));
      if (infos.length) body.appendChild(el("p", "", infos.join(" • ")));
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  // ---------- Écoles participantes ----------
  function renderEcoles(list) {
    var grid = $("ecoles-grid");
    grid.innerHTML = "";
    if (!list.length) {
      grid.appendChild(el("p", "", "Aucune école participante pour le moment."));
      return;
    }
    list.forEach(function (e) {
      var chip = el("div", "ecole-chip");
      chip.appendChild(el("span", "ecole-icone", "🏫"));
      var box = el("div");
      box.appendChild(el("div", "ecole-nom", e.nom));
      if (e.section) box.appendChild(el("div", "ecole-section", e.section));
      chip.appendChild(box);
      grid.appendChild(chip);
    });
  }

  // ---------- Le créateur ----------
  function renderCreateur(c) {
    if (!c || (!c.nom && !c.prenom && !c.photo)) {
      $("createur-nom").textContent = "Créateur de Fenemof";
      return;
    }
    var nom = [c.prenom, c.nom].filter(Boolean).join(" ");
    if (nom) $("createur-nom").textContent = nom;
    if (c.photo) {
      var img = $("createur-photo");
      img.src = c.photo;
      img.classList.remove("hidden");
    }
  }

  // ---------- Partenaires ----------
  function renderPartners(list) {
    var grid = $("partners-grid");
    grid.innerHTML = "";
    if (!list.length) {
      grid.appendChild(el("p", "", "Aucun partenaire pour le moment."));
      return;
    }
    list.forEach(function (p) {
      var card = el("div", "partner-card");
      if (p.logo) {
        var img = el("img", "partner-logo");
        img.src = "/uploads/partners/" + p.logo;
        img.alt = p.nom;
        card.appendChild(img);
      }
      card.appendChild(el("h3", "", p.nom));
      if (p.description) card.appendChild(el("p", "", p.description));
      grid.appendChild(card);
    });
  }

  // ---------- Éditions ----------
  function renderEditions(list) {
    var grid = $("editions-grid");
    grid.innerHTML = "";
    if (!list.length) {
      grid.appendChild(el("p", "", "Aucune édition publiée pour le moment."));
      return;
    }
    list.forEach(function (ed) {
      var card = el("div", "edition-card");
      if (ed.photo) {
        var img = el("img", "edition-cover");
        img.src = "/uploads/editions/" + ed.photo;
        img.alt = ed.titre;
        img.loading = "lazy";
        img.style.cursor = "pointer";
        img.addEventListener("click", function () { openLightbox("/uploads/editions/" + ed.photo); });
        card.appendChild(img);
      }
      var body = el("div", "edition-body");
      body.appendChild(el("span", "edition-year", "Édition " + ed.annee));
      body.appendChild(el("h3", "", ed.titre));
      body.appendChild(el("div", "edition-date", "Publié le " + ed.date));
      if (ed.description) body.appendChild(el("p", "", ed.description));
      if (ed.photos && ed.photos.length) {
        var row = el("div", "edition-photos-row");
        ed.photos.forEach(function (ph) {
          var p = el("img");
          p.src = "/uploads/editions/" + ph;
          p.alt = ed.titre;
          p.loading = "lazy";
          p.addEventListener("click", function () { openLightbox("/uploads/editions/" + ph); });
          row.appendChild(p);
        });
        body.appendChild(row);
      }
      if (ed.fichier) {
        var link = el("a", "btn btn-primary btn-small");
        link.href = "/uploads/editions/" + ed.fichier;
        link.target = "_blank";
        link.textContent = "Télécharger l'édition";
        body.appendChild(link);
      }
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  // ---------- Visionneuse d'images (lightbox) ----------
  function openLightbox(src) {
    var overlay = document.getElementById("lightbox");
    if (!overlay) {
      overlay = el("div", "lightbox hidden");
      overlay.id = "lightbox";
      var img = el("img");
      img.id = "lightbox-img";
      overlay.appendChild(img);
      overlay.addEventListener("click", function () { overlay.classList.add("hidden"); });
      document.body.appendChild(overlay);
    }
    document.getElementById("lightbox-img").src = src;
    overlay.classList.remove("hidden");
  }

  // ---------- Annonces ----------
  function renderAnnouncements(list) {
    var bar = $("annonce-bar");
    if (!list.length) { bar.classList.add("hidden"); return; }
    bar.innerHTML = "";
    list.forEach(function (a) {
      bar.appendChild(el("span", "", a.texte));
    });
    bar.classList.remove("hidden");
  }

  // ---------- Galerie ----------
  function renderGallery(photos) {
    var grid = $("galerie-grid");
    grid.innerHTML = "";
    if (!photos.length) {
      grid.appendChild(el("p", "", "Aucune photo pour le moment. Revenez bientôt !"));
      return;
    }
    photos.forEach(function (name) {
      var item = el("div", "galerie-item");
      var img = el("img");
      img.src = "/uploads/photos/" + name;
      img.alt = "Photo Fenemof";
      img.loading = "lazy";
      item.appendChild(img);
      item.appendChild(el("div", "galerie-caption", "Événement Fenemof"));
      grid.appendChild(item);
    });
  }

  // ---------- Galerie Cosudo ----------
  function renderCosudoGallery(photos) {
    var grid = $("cosudo-galerie-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!photos.length) {
      grid.appendChild(el("p", "", "Aucune photo Cosudo pour le moment. Revenez bientôt !"));
      return;
    }
    photos.forEach(function (name) {
      var item = el("div", "galerie-item");
      var img = el("img");
      img.src = "/uploads/cosudo/" + name;
      img.alt = "Photo Cosudo";
      img.loading = "lazy";
      item.appendChild(img);
      item.appendChild(el("div", "galerie-caption", "Événement Cosudo"));
      grid.appendChild(item);
    });
  }

  // ---------- Élèves dynamiques ----------
  function eleveBox(index) {
    var box = el("div", "eleve-box");
    box.id = "eleve-" + index;
    var head = el("div", "eleve-head");
    head.appendChild(el("span", "eleve-title", "Élève n°" + index));
    var btnRemove = el("button", "eleve-remove", "✕ Retirer");
    btnRemove.type = "button";
    btnRemove.addEventListener("click", function () { removeEleve(box); });
    head.appendChild(btnRemove);
    box.appendChild(head);

    var g = el("div", "grid-2");
    var f1 = el("div", "field");
    f1.appendChild(el("label", "", "Nom de l'élève *"));
    var inpNom = el("input"); inpNom.type = "text"; inpNom.placeholder = "Nom"; inpNom.dataset.role = "nom";
    f1.appendChild(inpNom);
    var f2 = el("div", "field");
    f2.appendChild(el("label", "", "Prénom de l'élève *"));
    var inpPre = el("input"); inpPre.type = "text"; inpPre.placeholder = "Prénom"; inpPre.dataset.role = "prenom";
    f2.appendChild(inpPre);
    var f3 = el("div", "field");
    f3.appendChild(el("label", "", "Âge *"));
    var inpAge = el("input"); inpAge.type = "number"; inpAge.min = "3"; inpAge.max = "30"; inpAge.placeholder = "Âge"; inpAge.dataset.role = "age";
    f3.appendChild(inpAge);
    var f5 = el("div", "field");
    f5.appendChild(el("label", "", "Sexe *"));
    var selSexe = el("select"); selSexe.dataset.role = "sexe";
    var optV = el("option"); optV.value = ""; optV.textContent = "-- Choisir --";
    var optM = el("option"); optM.value = "masculin"; optM.textContent = "Masculin";
    var optF = el("option"); optF.value = "feminin"; optF.textContent = "Féminin";
    selSexe.appendChild(optV); selSexe.appendChild(optM); selSexe.appendChild(optF);
    f5.appendChild(selSexe);
    var f4 = el("div", "field");
    f4.appendChild(el("label", "", "Classe *"));
    var inpCls = el("input"); inpCls.type = "text"; inpCls.placeholder = "Ex : CE2, 5ème, Terminale"; inpCls.dataset.role = "classe";
    f4.appendChild(inpCls);
    g.appendChild(f1); g.appendChild(f2); g.appendChild(f3); g.appendChild(f5); g.appendChild(f4);
    box.appendChild(g);
    return box;
  }

  function addEleve(containerId, index) {
    var container = $(containerId);
    container.appendChild(eleveBox(index));
    updateEleveNumbers(containerId);
  }

  function removeEleve(box) {
    var containerId = box.parentElement ? box.parentElement.id : "";
    box.remove();
    updateEleveNumbers(containerId);
  }

  function updateEleveNumbers(containerId) {
    var selector = "#" + containerId + " .eleve-box";
    var boxes = document.querySelectorAll(selector);
    boxes.forEach(function (b, i) {
      b.querySelector(".eleve-title").textContent = "Élève n°" + (i + 1);
      b.id = "eleve-" + (i + 1);
    });
    var btnId = containerId === "cosudo-eleves-container" ? "btn-add-cosudo-eleve" : "btn-add-eleve";
    var btn = $(btnId);
    btn.style.visibility = boxes.length >= 6 ? "hidden" : "visible";
  }

  // ---------- Soumission ----------
  function collectEleves(containerId) {
    var boxes = document.querySelectorAll("#" + containerId + " .eleve-box");
    var list = [];
    boxes.forEach(function (b) {
      var e = {};
      b.querySelectorAll("input[data-role]").forEach(function (inp) {
        e[inp.dataset.role] = inp.value.trim();
      });
      list.push(e);
    });
    return list;
  }

  function submitForm(e) {
    e.preventDefault();
    var errorBox = $("form-error");
    errorBox.classList.add("hidden");

    var etablissement = $("etablissement").value.trim();
    var section = $("section").value;
    var telephone = $("telephone").value.trim();
    var suivi = $("suivi").value.trim();
    var transaction = $("transaction").value.trim();
    var paiement = document.querySelector('input[name="paiement"]:checked');

    if (!etablissement) { return fail("Entrez le nom de l'établissement."); }
    if (!section) { return fail("Choisissez la section."); }
    if (!telephone) { return fail("Entrez le numéro de l'établissement."); }
    if (!suivi) { return fail("Entrez le numéro du personnel de suivi."); }
    if (!paiement) { return fail("Choisissez un moyen de paiement (MTN ou Airtel Money)."); }
    if (!transaction) { return fail("Entrez votre numéro de transaction."); }

    var eleves = collectEleves("eleves-container");
    if (!eleves.length) { return fail("Ajoutez au moins un élève."); }
    for (var i = 0; i < eleves.length; i++) {
      if (!eleves[i].nom || !eleves[i].prenom) {
        return fail("Le nom et le prénom de l'élève n°" + (i + 1) + " sont obligatoires.");
      }
      if (!eleves[i].sexe) {
        return fail("Choisissez le sexe de l'élève n°" + (i + 1) + ".");
      }
    }

    var payload = {
      etablissement: etablissement,
      section: section,
      telephone: telephone,
      suivi: suivi,
      paiement: paiement.value,
      transaction: transaction,
      eleves: eleves,
    };

    var btn = document.querySelector('#register-form button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Envoi en cours...";

    fetch(API.register, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription";
        if (res.status !== 200) {
          return fail((res.body && res.body.error) || "Erreur lors de l'envoi.");
        }
        // Succès
        $("register-form").classList.add("hidden");
        $("register-success").classList.remove("hidden");
        $("register-success-msg").textContent =
          "Merci, " + etablissement + ". Votre inscription a bien été enregistrée. Le créateur de Fenemof vous contactera.";
        if (res.body.recu) {
          renderReceipt(res.body.recu, res.body.recu_url);
        } else {
          $("receipt-box").classList.add("hidden");
        }
        toast("Inscription enregistrée avec succès !");
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription";
        fail("Impossible de contacter le serveur. Vérifiez qu'il est bien lancé.");
      });
  }

  function submitCosudoForm(e) {
    e.preventDefault();
    var errorBox = $("cosudo-form-error");
    errorBox.classList.add("hidden");

    var etablissement = $("cosudo-etablissement").value.trim();
    var section = $("cosudo-section").value;
    var telephone = $("cosudo-telephone").value.trim();
    var suivi = $("cosudo-suivi").value.trim();
    var transaction = $("cosudo-transaction").value.trim();
    var paiement = document.querySelector('input[name="cosudo-paiement"]:checked');

    if (!etablissement) { return failCosudo("Entrez le nom de l'établissement."); }
    if (!section) { return failCosudo("Choisissez la section."); }
    if (!telephone) { return failCosudo("Entrez le numéro de l'établissement."); }
    if (!suivi) { return failCosudo("Entrez le numéro du personnel de suivi."); }
    if (!paiement) { return failCosudo("Choisissez un moyen de paiement (MTN ou Airtel Money)."); }
    if (!transaction) { return failCosudo("Entrez votre numéro de transaction."); }

    var eleves = collectEleves("cosudo-eleves-container");
    if (!eleves.length) { return failCosudo("Ajoutez au moins un élève."); }
    for (var i = 0; i < eleves.length; i++) {
      if (!eleves[i].nom || !eleves[i].prenom) {
        return failCosudo("Le nom et le prénom de l'élève n°" + (i + 1) + " sont obligatoires.");
      }
      if (!eleves[i].sexe) {
        return failCosudo("Choisissez le sexe de l'élève n°" + (i + 1) + ".");
      }
    }

    var payload = {
      etablissement: etablissement,
      section: section,
      telephone: telephone,
      suivi: suivi,
      paiement: paiement.value,
      transaction: transaction,
      eleves: eleves,
    };

    var btn = document.querySelector('#register-cosudo-form button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Envoi en cours...";

    fetch(API.registerCosudo, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription Cosudo";
        if (res.status !== 200) {
          return failCosudo((res.body && res.body.error) || "Erreur lors de l'envoi.");
        }
        $("register-cosudo-form").classList.add("hidden");
        $("cosudo-register-success").classList.remove("hidden");
        $("cosudo-register-success-msg").textContent =
          "Merci, " + etablissement + ". Votre inscription Cosudo a bien été enregistrée. Le créateur de Cosudo vous contactera.";
        if (res.body.recu) {
          renderReceipt(res.body.recu, res.body.recu_url, {
            box: "cosudo-receipt-box",
            table: "cosudo-receipt-table",
            print: "cosudo-receipt-print",
          });
        } else {
          $("cosudo-receipt-box").classList.add("hidden");
        }
        toast("Inscription Cosudo enregistrée avec succès !");
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = "Envoyer mon inscription Cosudo";
        failCosudo("Impossible de contacter le serveur. Vérifiez qu'il est bien lancé.");
      });
  }

  function failCosudo(msg) {
    var errorBox = $("cosudo-form-error");
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  function renderReceipt(recu, url, ids) {
    ids = ids || {};
    var box = $(ids.box || "receipt-box");
    var table = $(ids.table || "receipt-table");
    table.innerHTML = "";
    function row(label, value) {
      var tr = el("tr");
      tr.appendChild(el("td", "", label));
      tr.appendChild(el("td", "", value !== undefined && value !== null && value !== "" ? value : "—"));
      table.appendChild(tr);
    }
    row("N° de reçu", recu.numero);
    row("Établissement", recu.etablissement);
    row("Téléphone établissement", recu.telephone);
    row("Personnel de suivi", recu.suivi);
    row("Section", (recu.sections || []).map(capSection).join(", "));
    row("Nombre de sections", recu.nb_sections);
    row("Nombre d'élèves", recu.nb_eleves);
    row("Montant par élève", (recu.montant_par_eleve || 0).toLocaleString("fr-FR") + " FCFA");
    row("Total à payer", (recu.total || 0).toLocaleString("fr-FR") + " FCFA");
    row("Mode de paiement", recu.paiement);
    row("N° de transaction", recu.transaction);
    row("Date du paiement", recu.date);
    var print = $(ids.print || "receipt-print");
    print.href = url || "#";
    box.classList.remove("hidden");
  }

  function capSection(s) {
    return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
  }

  function fail(msg) {
    var errorBox = $("form-error");
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  }

  // ---------- Devenir partenaire ----------
  function submitPartnerRequest(e) {
    e.preventDefault();
    var err = $("pr-error");
    err.classList.add("hidden");
    var nom = $("pr-nom").value.trim();
    if (!nom) {
      err.textContent = "Entrez votre nom.";
      err.classList.remove("hidden");
      return;
    }
    var payload = {
      nom: nom,
      organisation: $("pr-org").value.trim(),
      telephone: $("pr-tel").value.trim(),
      message: $("pr-msg").value.trim(),
    };
    fetch("/api/partner-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) {
          err.textContent = res.error;
          err.classList.remove("hidden");
          return;
        }
        $("partner-request-form").classList.add("hidden");
        $("pr-success").classList.remove("hidden");
        toast("Demande de partenariat envoyée !");
      })
      .catch(function () {
        err.textContent = "Impossible de contacter le serveur.";
        err.classList.remove("hidden");
      });
  }

  // ---------- Animations au défilement ----------
  function initReveal() {
    var targets = document.querySelectorAll(".section, .hero-card, .form");
    targets.forEach(function (t) { t.classList.add("reveal"); });
    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (t) { t.classList.add("visible"); });
      return;
    }
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    targets.forEach(function (t) { obs.observe(t); });
  }

  // ---------- Navigation mobile ----------
  function initNav() {
    $("nav-toggle").addEventListener("click", function () {
      document.querySelector(".main-nav").classList.toggle("open");
    });
  }

  // ---------- Init ----------
  function init() {
    var n = 3;
    for (var i = 1; i <= n; i++) { addEleve("eleves-container", i); }
    for (var j = 1; j <= n; j++) { addEleve("cosudo-eleves-container", j); }
    $("btn-add-eleve").addEventListener("click", function () {
      var count = document.querySelectorAll("#eleves-container .eleve-box").length;
      if (count < 6) addEleve("eleves-container", count + 1);
    });
    $("btn-add-cosudo-eleve").addEventListener("click", function () {
      var count = document.querySelectorAll("#cosudo-eleves-container .eleve-box").length;
      if (count < 6) addEleve("cosudo-eleves-container", count + 1);
    });
    $("register-form").addEventListener("submit", submitForm);
    $("register-cosudo-form").addEventListener("submit", submitCosudoForm);
    $("partner-request-form").addEventListener("submit", submitPartnerRequest);
    $("footer-year").textContent = new Date().getFullYear();
    initNav();
    initReveal();
    loadSiteInfo();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
