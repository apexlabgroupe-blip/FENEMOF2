(function () {
  "use strict";

  // ========== PARAMETRES DU SITE (modifie-les ici) ==========
  var SITE = {
    email: "fenemof@gmail.com",
    phone: "064618646",
    whatsapp: "064618646",
    wa: "242064618646" // numéro WhatsApp avec indicatif (+242), sans le +
  };
  var WA_URL = "https://wa.me/" + SITE.wa + "?text=";

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

  function openWhatsApp(message) {
    window.open(WA_URL + encodeURIComponent(message), "_blank");
  }

  // ========== MENU ==========
  function hideGuide() {
    var g = $("start-guide");
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

  // Numéro WhatsApp flottant + contact
  function initContacts() {
    var wf = $("whatsapp-float");
    if (wf) wf.href = WA_URL;
    var cw = $("contact-whatsapp");
    if (cw) cw.textContent = SITE.whatsapp;
    var cp = $("contact-phone");
    if (cp) cp.textContent = SITE.phone;
    var ce = $("contact-email");
    if (ce) ce.textContent = SITE.email;
  }

  // ========== FORMULAIRE FENEMOF ==========
  function buildEleveCard(sec, index) {
    var classes = CLASSES[sec];
    var card = el("div", "eleve-card");
    card.appendChild(el("h4", "", "Elève " + index));

    var grid = el("div", "eleve-grid");

    var fNom = el("div");
    fNom.appendChild(el("label", "", "Nom *"));
    var inpNom = el("input"); inpNom.type = "text"; inpNom.placeholder = "Nom"; inpNom.dataset.field = "nom";
    fNom.appendChild(inpNom);
    grid.appendChild(fNom);

    var fPrenom = el("div");
    fPrenom.appendChild(el("label", "", "Prénom *"));
    var inpPrenom = el("input"); inpPrenom.type = "text"; inpPrenom.placeholder = "Prénom"; inpPrenom.dataset.field = "prenom";
    fPrenom.appendChild(inpPrenom);
    grid.appendChild(fPrenom);

    var fAge = el("div");
    fAge.appendChild(el("label", "", "Âge"));
    var inpAge = el("input"); inpAge.type = "number"; inpAge.placeholder = "Âge"; inpAge.min = "3"; inpAge.max = "25"; inpAge.dataset.field = "age";
    fAge.appendChild(inpAge);
    grid.appendChild(fAge);

    var fSexe = el("div");
    fSexe.appendChild(el("label", "", "Sexe"));
    var selSexe = el("select"); selSexe.dataset.field = "sexe";
    var optM = el("option", "", "Masculin"); optM.value = "masculin";
    var optF = el("option", "", "Féminin"); optF.value = "feminin";
    selSexe.appendChild(optM);
    selSexe.appendChild(optF);
    fSexe.appendChild(selSexe);
    grid.appendChild(fSexe);

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

  function montantParSection() { return 3300; }

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
    var montant = nb * montantParSection();
    var html = "<strong>" + nb + " section" + (nb > 1 ? "s" : "") + " :</strong> " + sections.join(", ").toUpperCase() + "<br>";
    html += "<strong>Montant total :</strong> " + montant.toLocaleString("fr-FR") + " FCFA<br>";
    html += "<em>Envoyez votre inscription sur WhatsApp pour confirmation.</em>";
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
        if (field !== "photo") data[field] = inp.value.trim();
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
    if (!etablissement) return fail("Entrez le nom de l'établissement.");
    if (!telephone) return fail("Entrez le numéro.");
    if (!suivi) return fail("Entrez le personnel de suivi.");
    if (!sections.length) return fail("Cochez au moins une section.");

    var messages = [];
    messages.push("INSCRIPTION FENEMOF - " + etablissement.toUpperCase());
    messages.push("Téléphone : " + telephone);
    messages.push("Personnel de suivi : " + suivi);

    sections.forEach(function (s) {
      var eleves = collectElevesSection(s);
      var label = { primaire: "Primaire (CM1, CM2)", college: "Collège (6e-3e)", lycee: "Lycée (2nde-Tle)" }[s] || s;
      messages.push("");
      messages.push("Section : " + label + " (" + eleves.length + " élève(s))");
      eleves.forEach(function (ev, i) {
        var infos = [ev.nom, ev.prenom].filter(Boolean).join(" ");
        var det = [];
        if (ev.sexe) det.push(ev.sexe);
        if (ev.classe) det.push(ev.classe);
        if (ev.age) det.push(ev.age + " ans");
        messages.push("• " + (i + 1) + ") " + infos + (det.length ? " — " + det.join(", ") : ""));
      });
    });

    messages.push("");
    messages.push("Montant à payer : " + (sections.length * montantParSection()).toLocaleString("fr-FR") + " FCFA");
    messages.push("Je souhaite confirmer cette inscription. Merci !");

    openWhatsApp(messages.join("\n") + "\n");
    $("register-form").classList.add("hidden");
    $("register-success").classList.remove("hidden");
    $("register-success-msg").textContent = "Merci, " + etablissement + " ! Votre dossier est prêt : WhatsApp s'ouvre avec votre inscription. Envoyez le message pour finaliser.";
    var payBtn = $("register-pay-btn");
    if (payBtn) payBtn.classList.add("hidden");
    toast("Envoyez le message sur WhatsApp !");
  }

  function fail(msg) { var e = $("form-error"); e.textContent = msg; e.classList.remove("hidden"); }

  // ========== FORMULAIRE COSUDO ==========
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
    if (!prenom) return failCosudo("Entrez votre prénom.");
    if (!telephone) return failCosudo("Entrez votre numéro de téléphone.");
    if (!ville) return failCosudo("Entrez votre ville.");
    if (!niveau) return failCosudo("Choisissez votre niveau scolaire.");

    var lignes = [];
    lignes.push("INSCRIPTION COSUDO");
    lignes.push("Nom complet : " + prenom + " " + nom);
    lignes.push("Téléphone : " + telephone);
    lignes.push("Ville : " + ville);
    if (quartier) lignes.push("Quartier : " + quartier);
    if (rue) lignes.push("Rue : " + rue);
    if (avenue) lignes.push("Avenue : " + avenue);
    lignes.push("Niveau : " + niveau);
    lignes.push("");
    lignes.push("Je souhaite confirmer mon inscription Cosudo. Merci !");

    openWhatsApp(lignes.join("\n") + "\n");
    $(cosudoFormId()).classList.add("hidden");
    $("cosudo-register-success").classList.remove("hidden");
    $("cosudo-register-success-msg").textContent = "Merci, " + prenom + " ! Votre dossier est prêt : WhatsApp s'ouvre avec votre inscription. Envoyez le message pour finaliser.";
    var payBtn = $("cosudo-pay-btn");
    if (payBtn) payBtn.classList.add("hidden");
    toast("Envoyez le message sur WhatsApp !");
  }

  function cosudoFormId() { return ($("register-cosudo-form") ? "register-cosudo-form" : "cosudo-form"); }

  function failCosudo(msg) { var e = $("cosudo-form-error") || $("cosudo-error"); if (e) { e.textContent = msg; e.classList.remove("hidden"); } }

  // ========== FORMULAIRE PARTENAIRE ==========
  function submitPartnerRequest(e) {
    e.preventDefault();
    var err = $("pr-error"); err.classList.add("hidden");
    var nom = $("pr-nom").value.trim();
    if (!nom) { err.textContent = "Entrez votre nom."; err.classList.remove("hidden"); return; }
    var lignes = [];
    lignes.push("DEMANDE DE PARTENARIAT FENEMOF");
    lignes.push("Nom : " + nom);
    var org = $("pr-org").value.trim();
    var tel = $("pr-tel").value.trim();
    var msg = $("pr-msg").value.trim();
    if (org) lignes.push("Organisation : " + org);
    if (tel) lignes.push("Téléphone : " + tel);
    if (msg) lignes.push("Message : " + msg);
    lignes.push("");
    lignes.push("Je souhaite devenir partenaire. Merci !");
    openWhatsApp(lignes.join("\n") + "\n");
    $("partner-request-form").classList.add("hidden");
    $("pr-success").classList.remove("hidden");
    toast("Demande envoyée sur WhatsApp !");
  }

  // ========== INIT ==========
  function init() {
    initMenu();
    initContacts();
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();