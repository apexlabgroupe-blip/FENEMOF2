(function () {
  "use strict";

  var id = window.location.pathname.split("/recu/")[1];

  function $ (x) { return document.getElementById(x); }
  function el (tag, text) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function cap (s) {
    return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
  }
  function fmt (n) {
    return (Number(n) || 0).toLocaleString("fr-FR");
  }

  if (!id) { showError("Reçu introuvable."); return; }

  Promise.all([
    fetch("/api/siteinfo").then(function (r) { return r.json(); }),
    fetch("/api/recu/" + id).then(function (r) { return r.json(); }),
  ]).then(function (results) {
    var info = results[0];
    var recu = (results[1].recu) || null;
    if (!recu) { showError("Reçu introuvable."); return; }

    if (info.logo) {
      var logo = $("recu-logo");
      logo.src = info.logo;
      logo.style.display = "inline-block";
    }
    $("recu-coord").textContent = info.location || "";
    var contact = info.phone ? "Tél : " + info.phone : "";
    if (info.email) contact += (contact ? "  •  " : "") + info.email;
    $("recu-contact").textContent = contact;
    $("recu-contact2").textContent = contact;
    $("recu-numero").textContent = recu.numero;

    var table = $("recu-table");
    function row(label, value, isTotal) {
      var tr = el("tr");
      if (isTotal) tr.className = "total-row";
      tr.appendChild(el("td", label));
      tr.appendChild(el("td", (value === undefined || value === null || value === "") ? "—" : value));
      table.appendChild(tr);
    }
    row("Établissement", recu.etablissement);
    row("Téléphone de l'établissement", recu.telephone);
    row("Personnel de suivi", recu.suivi);
    row("Section(s) inscrite(s)", (recu.sections || []).map(cap).join(", "));
    row("Nombre de sections", recu.nb_sections);
    row("Nombre d'élèves", recu.nb_eleves);
    row("Montant par élève", fmt(recu.montant_par_eleve) + " FCFA");
    row("Total à payer", fmt(recu.total) + " FCFA", true);
    row("Mode de paiement", recu.paiement);
    row("N° de transaction", recu.transaction);
    row("Date du paiement", recu.date);

    if (info.whatsapp) {
      var wa = $("recu-whatsapp");
      var num = String(info.whatsapp).replace(/\D/g, "");
      var texte = "Bonjour Fenemof !\n\nVoici mon reçu d'inscription :\n"
        + "N° " + recu.numero + "\n"
        + "Établissement : " + recu.etablissement + "\n"
        + "Section(s) : " + (recu.sections || []).map(cap).join(", ") + "\n"
        + "Élèves : " + recu.nb_eleves + "\n"
        + "Montant par élève : " + fmt(recu.montant_par_eleve) + " FCFA\n"
        + "Total : " + fmt(recu.total) + " FCFA\n"
        + "Transaction : " + recu.transaction;
      wa.href = "https://wa.me/" + num + "?text=" + encodeURIComponent(texte);
      wa.style.display = "inline-block";
    }
  }).catch(function () {
    showError("Impossible de charger le reçu. Vérifiez que le serveur est lancé.");
  });

  function showError (msg) {
    var page = $("recu-page");
    page.innerHTML = "<h2 class='recu-title'>" + msg + "</h2>";
  }
})();
