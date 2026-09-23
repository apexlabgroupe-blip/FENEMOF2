(function () {
  "use strict";

  var API = { siteinfo: "/api/siteinfo", register: "/api/register", registerCosudo: "/api/register-cosudo" };

  var CLASSES = {
    primaire: ["CM1", "CM2"],
    college: ["6eme", "5eme", "4eme", "3eme"],
    lycee: ["Seconde", "Premiere", "Terminale"],
  };

  var NB_ELEVES = 3;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function toast(msg) {
    var t = $("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 4000);
  }

  // ========== MENU ==========
  function startGuide() {
    var g = $("start-guide");
    if (!g) return false;
    return g;
  }
  function hideGuide() {
    var g = startGuide();
    if (g) g.classList.add("hidden-guide");
    sessionStorage.setItem("fenemof_menu_opened", "1");
  }
  function showGuide() {
    var g = $("start-guide");
    if (!g) return;
    if (sessionStorage.getItem("fenemof_menu_opened")) {
      g.classList.add("hidden-guide");
      return;
    }
    g.classList.remove("hidden-guide");
  }

  function showSection(id) {
    $("home-page").classList.add("hidden");
    $("menu-overlay").classList.add("hidden");
    document.querySelectorAll(".page-section").forEach(function (s) { s.classList.remove("active"); });
    var sec = $(id);
    if (sec) sec.classList.add("active");
    window.scrollTo(0, 0);
  }

  function goHome() {
    $("home-page").classList.remove("hidden");
    document.querySelectorAll(".page-section").forEach(function (s) { s.classList.remove("active"); });
    window.scrollTo(0, 0);
    showGuide();
  }

  function initMenu() {
    $("menu-open").addEventListener("click", function () {
      $("menu-overlay").classList.remove("hidden");
      hideGuide();
    });
    $("menu-close").addEventListener("click", function () {
      $("menu-overlay").classList.add("hidden");
    });
    document.querySelectorAll(".menu-item[href^='#sec-']").forEach(function (item) {
      item.addEventListener("click", function (e) {
        e.preventDefault();
        showSection(item.getAttribute("href").slice(1));
      });
    });
    document.querySelectorAll(".back-link").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        goHome();
      });
    });
  }

  // ========== SITE INFO ==========
   function loadSiteInfo() {
     fetch(API.siteinfo)
       .then(function (r) { return r.json(); })
       .then(function (info) {
         if (info.email) { var ce = $("contact-email"); if (ce) ce.textContent = info.email; }
         if (info.phone) { var cp = $("contact-phone"); if (cp) cp.textContent = info.phone; }
         if (info.location) { var cl = $("contact-location"); if (cl) cl.textContent = info.location; }
         if (info.but_fenemof) { var bt = $("but-text"); if (bt) bt.textContent = info.but_fenemof; }
         if (info.cosudo_but) { var cbt = $("cosudo-but-text"); if (cbt) cbt.textContent = info.cosudo_but; }
         if (info.whatsapp) {
           var waNum = info.whatsapp.replace(/[^0-9]/g, "");
           var wf = $("whatsapp-float"); if (wf) wf.href = "https://wa.me/242" + waNum;
           var cw = $("contact-whatsapp"); if (cw) cw.textContent = info.whatsapp;
         }
         try { renderGallery(info.photos || []); } catch(e) { console.error("Gallery:", e); }
         try { renderCosudoGallery(info.cosudo_photos || []); } catch(e) { console.error("CosudoGallery:", e); }
         try { renderPartners(info.partners || []); } catch(e) { console.error("Partners:", e); }
         try { renderEditions(info.editions || []); } catch(e) { console.error("Editions:", e); }
         try { renderMeilleurs(info.meilleurs_eleves || []); } catch(e) { console.error("Meilleurs:", e); }
         try { renderEcoles(info.ecoles || []); } catch(e) { console.error("Ecoles:", e); }
       })
       .catch(function (e) { console.error("loadSiteInfo:", e); });
   }

  function renderMeilleurs(list) {
    var grid = $("meilleurs-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!list.length) { grid.appendChild(el("p", "", "Le meilleur eleve sera annonce prochainement.")); return; }
    list.forEach(function (m) {
      var card = el("div", "meilleur-card");
      if (m.photo) { var img = el("img"); img.src = "/uploads/eleves/" + m.photo; img.alt = m.prenom + " " + m.nom; img.style.cssText = "width:100%;height:180px;object-fit:cover;border-radius:10px 10px 0 0;"; card.appendChild(img); }
      var body = el("div"); body.style.padding = "14px";
      body.appendChild(el("h3", "", m.prenom + " " + m.nom));
      if (m.ecole) body.appendChild(el("p", "", m.ecole));
      body.appendChild(el("p", "", "Edition " + m.annee));
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function renderEcoles(list) {
    var grid = $("ecoles-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!list.length) { grid.appendChild(el("p", "", "Aucune ecole pour le moment.")); return; }
    list.forEach(function (e) {
      var chip = el("div", "ecole-chip");
      var box = el("div");
      box.appendChild(el("div", "", e.nom));
      if (e.section) box.appendChild(el("p", "", e.section));
      chip.appendChild(box);
      grid.appendChild(chip);
    });
  }

  function renderPartners(list) {
    var grid = $("partners-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!list.length) { grid.appendChild(el("p", "", "Aucun partenaire pour le moment.")); return; }
    list.forEach(function (p) {
      var card = el("div", "partner-card");
      if (p.logo) { var img = el("img", "partner-logo"); img.src = "/uploads/partners/" + p.logo; img.alt = p.nom; card.appendChild(img); }
      card.appendChild(el("h3", "", p.nom));
      if (p.description) card.appendChild(el("p", "", p.description));
      grid.appendChild(card);
    });
  }

  function renderEditions(list) {
    var grid = $("editions-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!list.length) { grid.appendChild(el("p", "", "Aucune edition pour le moment.")); return; }
    list.forEach(function (ed) {
      var card = el("div", "edition-card");
      if (ed.photo) { var img = el("img"); img.src = "/uploads/editions/" + ed.photo; img.alt = ed.titre; img.style.cssText = "width:100%;height:180px;object-fit:cover;"; card.appendChild(img); }
      var body = el("div"); body.style.padding = "14px";
      body.appendChild(el("h3", "", ed.titre));
      if (ed.description) body.appendChild(el("p", "", ed.description));
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  function renderGallery(photos) {
    var grid = $("galerie-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!photos.length) { grid.appendChild(el("p", "", "Aucune photo pour le moment.")); return; }
    photos.forEach(function (name) {
      var item = el("div", "galerie-item");
      var img = el("img"); img.src = "/uploads/photos/" + name; img.alt = "Photo"; img.loading = "lazy";
      item.appendChild(img);
      grid.appendChild(item);
    });
  }

  function renderCosudoGallery(photos) {
    var grid = $("cosudo-galerie-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (!photos.length) { grid.appendChild(el("p", "", "Aucune photo Cosudo.")); return; }
    photos.forEach(function (name) {
      var item = el("div", "galerie-item");
      var img = el("img"); img.src = "/uploads/cosudo/" + name; img.alt = "Photo Cosudo"; img.loading = "lazy";
      item.appendChild(img);
      grid.appendChild(item);
    });
  }

  // ========== FENEMOF : SECTIONS & ELEVES ==========
  function buildEleveCard(sec, index) {
    var classes = CLASSES[sec];
    var card = el("div", "eleve-card");
    card.appendChild(el("h4", "", "Eleve " + index));

    var grid = el("div", "eleve-grid");

    // Nom
    var fNom = el("div");
    fNom.appendChild(el("label", "", "Nom *"));
    var inpNom = el("input"); inpNom.type = "text"; inpNom.placeholder = "Nom"; inpNom.dataset.field = "nom";
    fNom.appendChild(inpNom);
    grid.appendChild(fNom);

    // Prenom
    var fPrenom = el("div");
    fPrenom.appendChild(el("label", "", "Prenom *"));
    var inpPrenom = el("input"); inpPrenom.type = "text"; inpPrenom.placeholder = "Prenom"; inpPrenom.dataset.field = "prenom";
    fPrenom.appendChild(inpPrenom);
    grid.appendChild(fPrenom);

    // Age
    var fAge = el("div");
    fAge.appendChild(el("label", "", "Age"));
    var inpAge = el("input"); inpAge.type = "number"; inpAge.placeholder = "Age"; inpAge.min = "3"; inpAge.max = "25"; inpAge.dataset.field = "age";
    fAge.appendChild(inpAge);
    grid.appendChild(fAge);

    // Sexe
    var fSexe = el("div");
    fSexe.appendChild(el("label", "", "Sexe"));
    var selSexe = el("select"); selSexe.dataset.field = "sexe";
    var optM = el("option", "", "Masculin"); optM.value = "masculin";
    var optF = el("option", "", "Feminin"); optF.value = "feminin";
    selSexe.appendChild(optM);
    selSexe.appendChild(optF);
    fSexe.appendChild(selSexe);
    grid.appendChild(fSexe);

    // Classe
    var fClasse = el("div");
    fClasse.appendChild(el("label", "", "Classe"));
    var selClasse = el("select"); selClasse.dataset.field = "classe";
    var defOpt = el("option", "", "-- Choisir --"); defOpt.value = "";
    selClasse.appendChild(defOpt);
    classes.forEach(function (c) {
      var opt = el("option", "", c); opt.value = c;
      selClasse.appendChild(opt);
    });
    fClasse.appendChild(selClasse);
    grid.appendChild(fClasse);

    // Photo (facultatif)
    var fPhoto = el("div", "field-full");
    fPhoto.appendChild(el("label", "", "Photo (facultatif)"));
    var photoWrap = el("div", "photo-upload");
    var inpPhoto = el("input"); inpPhoto.type = "file"; inpPhoto.accept = "image/*"; inpPhoto.dataset.field = "photo";
    photoWrap.appendChild(inpPhoto);
    photoWrap.appendChild(el("span", "photo-label", "Optionnel"));
    fPhoto.appendChild(photoWrap);
    grid.appendChild(fPhoto);

    card.appendChild(grid);
    return card;
  }

  function toggleSectionZone(sec) {
    var zone = $("zone-" + sec);
    var check = $("sec-" + sec);
    if (!zone || !check) return;
    if (check.checked) {
      zone.classList.remove("hidden");
      if (!zone.dataset.built) {
        var container = $("eleves-" + sec);
        for (var i = 1; i <= NB_ELEVES; i++) {
          container.appendChild(buildEleveCard(sec, i));
        }
        zone.dataset.built = "1";
      }
    } else {
      zone.classList.add("hidden");
    }
    updateRecap();
  }

  function getSelectedSections() {
    var sections = [];
    ["primaire", "college", "lycee"].forEach(function (s) {
      var cb = $("sec-" + s);
      if (cb && cb.checked) sections.push(s);
    });
    return sections;
  }

  function updateRecap() {
    var sections = getSelectedSections();
    var recap = $("recap-text");
    var recapBox = $("recap-sections");
    if (!sections.length) {
      recapBox.classList.add("hidden");
      return;
    }
    recapBox.classList.remove("hidden");
    var nb = sections.length;
    var montant = nb * 3300;
    var html = "<strong>" + nb + " section" + (nb > 1 ? "s" : "") + " :</strong> " + sections.join(", ").toUpperCase() + "<br>";
    html += "<strong>Montant total :</strong> " + montant.toLocaleString("fr-FR") + " FCFA";
    recap.innerHTML = html;
  }

  function collectElevesSection(sec) {
    var zone = $("zone-" + sec);
    if (!zone || zone.classList.contains("hidden")) return [];
    var cards = zone.querySelectorAll(".eleve-card");
    var eleves = [];
    cards.forEach(function (card) {
      var data = {};
      card.querySelectorAll("[data-field]").forEach(function (inp) {
        var field = inp.dataset.field;
        if (field === "photo") {
          data[field] = inp.files && inp.files[0] ? inp.files[0].name : "";
        } else {
          data[field] = inp.value.trim();
        }
      });
      if (data.nom || data.prenom) eleves.push(data);
    });
    return eleves;
  }

  function submitForm(e) {
    e.preventDefault();
    var errBox = $("form-error"); errBox.classList.add("hidden");
    var etablissement = $("etablissement").value.trim();
    var telephone = $("telephone").value.trim();
    var suivi = $("suivi").value.trim();
    var sections = getSelectedSections();
    if (!etablissement) return fail("Entrez le nom de l'etablissement.");
    if (!telephone) return fail("Entrez le numero.");
    if (!suivi) return fail("Entrez le personnel de suivi.");
    if (!sections.length) return fail("Cochez au moins une section.");

    var allEleves = {};
    var hasAny = false;
    sections.forEach(function (s) {
      var eleves = collectElevesSection(s);
      allEleves[s] = eleves;
      if (eleves.length) hasAny = true;
    });
    if (!hasAny) return fail("Remplissez les informations d'au moins un eleve.");

    var photoJobs = [];
    sections.forEach(function (s) {
      var zone = $("zone-" + s);
      if (!zone || zone.classList.contains("hidden")) return;
      zone.querySelectorAll(".eleve-card").forEach(function (card, idx) {
        var fileInput = card.querySelector('[data-field="photo"]');
        if (fileInput && fileInput.files && fileInput.files[0]) {
          photoJobs.push({ section: s, index: idx, file: fileInput.files[0] });
        }
      });
    });

    var btn = document.querySelector('#register-form button[type="submit"]');
    btn.disabled = true; btn.textContent = "Envoi...";

    var payload = {
      etablissement: etablissement,
      telephone: telephone,
      suivi: suivi,
      sections: sections,
      eleves: allEleves,
    };

    fetch(API.register, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = "Envoyer mon inscription";
        if (res.status !== 200) return fail((res.body && res.body.error) || "Erreur.");
        var regId = res.body && res.body.id;
        if (regId && photoJobs.length) {
          photoJobs.forEach(function (job) {
            var fd = new FormData();
            fd.append("reg", regId);
            fd.append("section", job.section);
            fd.append("index", job.index);
            fd.append("photo", job.file, job.file.name);
            fetch("/api/upload-eleve-photo", { method: "POST", body: fd }).catch(function () {});
          });
        }
        $("register-form").classList.add("hidden");
        $("register-success").classList.remove("hidden");
        $("register-success-msg").textContent = "Merci, " + etablissement + ". Inscription enregistree.";
        toast("Inscription enregistree !");
        var sectionParam = sections.length > 1 ? "multi" : sections[0];
        var montant = sections.length * 3300;
        var payUrl = "paiement.html?section=" + encodeURIComponent(sectionParam) + "&montant=" + montant +
          "&etab=" + encodeURIComponent(etablissement) + "&num=" + encodeURIComponent((regId || "").slice(0, 8).toUpperCase()) +
          "&tel=" + encodeURIComponent(telephone);
        var payBtn = $("register-pay-btn");
        if (payBtn) payBtn.href = payUrl;
        setTimeout(function () { window.location.href = payUrl; }, 2500);
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Envoyer mon inscription"; fail("Serveur indisponible."); });
  }

  function fail(msg) { var e = $("form-error"); e.textContent = msg; e.classList.remove("hidden"); }

  // ========== COSUDO ==========
  function submitCosudoForm(e) {
    e.preventDefault();
    var errBox = $("cosudo-form-error"); if (errBox) errBox.classList.add("hidden");
    var nom = ($("cosudo-nom") || $("c-nom")).value.trim();
    var prenom = ($("cosudo-prenom") || $("c-prenom")).value.trim();
    var telephone = ($("cosudo-telephone") || $("c-tel")).value.trim();
    var ville = ($("cosudo-ville") || $("c-ville")).value.trim();
    var quartier = ($("cosudo-quartier") || $("c-quartier") || {}).value || "";
    var rue = ($("cosudo-rue") || $("c-rue") || {}).value || "";
    var avenue = ($("cosudo-avenue") || $("c-avenue") || {}).value || "";
    var niveau = ($("cosudo-niveau") || $("c-niveau")).value;
    if (!nom) return failCosudo("Entrez votre nom.");
    if (!prenom) return failCosudo("Entrez votre prenom.");
    if (!telephone) return failCosudo("Entrez votre numero de telephone.");
    if (!ville) return failCosudo("Entrez votre ville.");
    if (!niveau) return failCosudo("Choisissez votre niveau scolaire.");

    var btn = document.querySelector('#register-cosudo-form button[type="submit"]');
    btn.disabled = true; btn.textContent = "Envoi...";

    var payload = { nom: nom, prenom: prenom, telephone: telephone, ville: ville, quartier: quartier, rue: rue, avenue: avenue, niveau: niveau };
    fetch(API.registerCosudo, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        btn.disabled = false; btn.textContent = "Envoyer mon inscription";
        if (res.status !== 200) return failCosudo((res.body && res.body.error) || "Erreur.");
        $("register-cosudo-form").classList.add("hidden");
        $("cosudo-register-success").classList.remove("hidden");
        $("cosudo-register-success-msg").textContent = "Merci, " + prenom + ". Inscription Cosudo enregistree.";
        toast("Inscription Cosudo enregistree !");
        var payBtn = $("cosudo-pay-btn");
        var cdUrl = "paiement.html?section=cosudo&num=" + encodeURIComponent((res.body && res.body.id || "").slice(0, 8).toUpperCase()) + "&etab=" + encodeURIComponent(prenom + " " + nom);
        if (payBtn) payBtn.href = cdUrl;
        setTimeout(function () { window.location.href = cdUrl; }, 2000);
      })
      .catch(function () { btn.disabled = false; btn.textContent = "Envoyer mon inscription"; failCosudo("Serveur indisponible."); });
  }

  function failCosudo(msg) { var e = $("cosudo-form-error") || $("cosudo-error"); if (e) { e.textContent = msg; e.classList.remove("hidden"); } }

  function submitPartnerRequest(e) {
    e.preventDefault();
    var err = $("pr-error"); err.classList.add("hidden");
    var nom = $("pr-nom").value.trim();
    if (!nom) { err.textContent = "Entrez votre nom."; err.classList.remove("hidden"); return; }
    fetch("/api/partner-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: nom, organisation: $("pr-org").value.trim(), telephone: $("pr-tel").value.trim(), message: $("pr-msg").value.trim() }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.error) { err.textContent = res.error; err.classList.remove("hidden"); return; }
        $("partner-request-form").classList.add("hidden"); $("pr-success").classList.remove("hidden");
        toast("Demande envoyee !");
      })
      .catch(function () { err.textContent = "Serveur indisponible."; err.classList.remove("hidden"); });
  }

  // ========== INIT ==========
  function init() {
    initMenu();
    showGuide();
    ["primaire", "college", "lycee"].forEach(function (s) {
      var cb = $("sec-" + s);
      if (cb) cb.addEventListener("change", function () { toggleSectionZone(s); });
    });
    $("register-form").addEventListener("submit", submitForm);
    var cosudoForm = $("register-cosudo-form") || $("cosudo-form");
    if (cosudoForm) cosudoForm.addEventListener("submit", submitCosudoForm);
    var partnerForm = $("partner-request-form");
    if (partnerForm) partnerForm.addEventListener("submit", submitPartnerRequest);
    loadSiteInfo();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
