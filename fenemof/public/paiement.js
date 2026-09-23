(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 4000);
  }
  function fcfa(n) { return Number(n || 0).toLocaleString("fr-FR") + " FCFA"; }

  var params = {};
  try {
    var qs = new URLSearchParams(window.location.search);
    ["type", "sections", "section", "tel", "recu"].forEach(function (k) {
      params[k] = qs.get(k) || "";
    });
  } catch (e) {
    params = {};
  }

  var PAY_LINKS = {
    1: "https://pay.yelen.co/pay/6DHD-XSCA",
    2: "https://pay.yelen.co/pay/92QT-KDWV",
    3: "https://pay.yelen.co/pay/2W29-S9KR",
  };
  var COSUDO_LINKS = {
    college: "https://pay.yelen.co/pay/PW86-VFZB",
    lycee: "https://pay.yelen.co/pay/PW86-VFZB",
    universite: "https://pay.yelen.co/pay/PW86-VFZB",
  };
  var siteMontant = 3300;
  var cosudoMontant = 2200;

  // Calcule (lien, montant, libellé, page espace) selon le type et la sélection.
  function computeChoice(type, sectionsStr, cosudoSection) {
    if (type === "cosudo") {
      var sec = ["college", "lycee", "universite"].indexOf(cosudoSection) >= 0 ? cosudoSection : "lycee";
      var secLabel = sec === "college" ? "Collège" : (sec === "lycee" ? "Lycée" : "Université");
      return {
        lien: COSUDO_LINKS[sec],
        montant: cosudoMontant,
        pour: "Inscription Cosudo — section " + secLabel,
        detail: "1 inscription personnelle (garçons & filles — Collège, Lycée, Université)",
        espaceUrl: "/cosudo?tel=" + encodeURIComponent(params.tel || "") + "#cosudo-espace",
      };
    }
    var n = parseInt(sectionsStr, 10);
    if (!(n >= 1 && n <= 3)) n = 0;
    if (!n) return null;
    return {
      lien: PAY_LINKS[n],
      montant: siteMontant * n,
      pour: "Inscription Fenemof",
      detail: n + " section" + (n > 1 ? "s" : "") + " choisie" + (n > 1 ? "s" : ""),
      espaceUrl: "/?tel=" + encodeURIComponent(params.tel || "") + "#espace-etablissement",
    };
  }

  function apply(choice) {
    $("pay-for").textContent = choice.pour;
    $("pay-amount").textContent = fcfa(choice.montant);
    $("pay-amount-label").textContent = choice.detail + " — paiement en ligne Yelen Money";
    $("pay-now-btn").href = choice.lien;
    // Bouton WhatsApp : le message d'inscription arrive chez le createur pour validation
    var wa = document.getElementById("warn-whatsapp");
    if (wa) {
      var msg = "Bonjour Fenemof ! Je viens de m'inscrire et de payer.\n"
        + "Type : " + choice.pour + "\n"
        + "Montant payé : " + fcfa(choice.montant) + "\n"
        + (params.recu ? "N° reçu : " + params.recu.toUpperCase().slice(0, 8) + "\n" : "")
        + "Téléphone utilisé : " + (params.tel || "(non précisé)") + "\n"
        + "Merci de valider mon badge.";
      wa.href = "https://wa.me/242064618646?text=" + encodeURIComponent(msg);
      wa.classList.remove("hidden");
    }
    var confirmBtn = $("confirm-paid-btn");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.onclick = function () {
        if (!params.recu) {
          window.location.href = choice.espaceUrl;
          return;
        }
        confirmPaid();
      };
    }
    var espaceBtn = $("open-espace-btn");
    if (espaceBtn) espaceBtn.onclick = function () { window.location.href = choice.espaceUrl; };
  }

  // ---- Vérification automatique : dès que le créateur confirme le paiement,
  // ---- l'utilisateur est redirigé tout seul vers son badge.
  var POLL_MS = 10000;

  function checkPaid() {
    var tel = (params.tel || "").replace(/\D/g, "");
    if (tel.length < 6) return;
    var url = params.type === "cosudo"
      ? "/api/cosudo-etablissement?telephone=" + encodeURIComponent(params.tel)
      : "/api/etablissement?telephone=" + encodeURIComponent(params.tel);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var res = (d && d.results) || [];
        var paid = res.some(function (r) {
          if (params.recu && r.id === params.recu) return r.statut === "paye";
          if (!params.recu) return r.statut === "paye";
          return false;
        });
        if (!paid) return;
        stopPolling();
        var box = document.getElementById("poll-status");
        if (box) {
          box.textContent = "Paiement confirmé ! On t'emmène voir ton badge...";
          box.classList.add("paid");
        }
        var target = params.type === "cosudo"
          ? "/cosudo?tel=" + encodeURIComponent(params.tel) + "#cosudo-espace"
          : "/?tel=" + encodeURIComponent(params.tel) + "#espace-etablissement";
        setTimeout(function () { window.location.href = target; }, 900);
      })
      .catch(function () { /* réseau instable : on retentera */ });
  }

  function startPolling() {
    var tel = (params.tel || "").replace(/\D/g, "");
    if (tel.length < 6) return;
    var box = document.getElementById("poll-status");
    if (box) box.classList.remove("hidden");
    checkPaid();
    setInterval(checkPaid, POLL_MS);
  }

  function stopPolling() { /* interval unique laissé au navigateur après redirection */ }

  // ---- Declaration client : il signale avoir paye. Le badge reste bloque
  // ---- jusqu'a ce que le createur valide dans son espace.
  function confirmPaid() {
    var box = document.getElementById("poll-status");
    var btn = document.getElementById("confirm-paid-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Envoi en cours..."; }
    fetch("/api/confirm-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: params.recu || "", telephone: params.tel || "" })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, body: d }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.body.ok) {
          if (btn) { btn.disabled = false; btn.textContent = "J'ai payé — signaler mon paiement"; }
          if (box && res.body && res.body.error) {
            box.textContent = res.body.error;
            box.classList.remove("hidden");
          }
          return;
        }
        if (btn) { btn.disabled = false; btn.textContent = "J'ai payé — signaler mon paiement"; }
        if (box) {
          box.textContent = "Paiement signalé ! Attends AU MOINS 1 HEURE que l'équipe vérifie et valide. Dès que le créateur valide, tu seras emmené automatiquement vers ton badge.";
          box.classList.remove("hidden");
        }
        // Pas de redirection : le sondage (checkPaid) redirigera seulement
        // quand le createur aura mis le statut "paye".
      })
      .catch(function () {
        if (btn) { btn.disabled = false; btn.textContent = "J'ai payé — signaler mon paiement"; }
        if (box) {
          box.textContent = "Réseau instable : réessaie dans un instant.";
          box.classList.remove("hidden");
        }
      });
  }

  function loadInfo() {
    fetch("/api/siteinfo")
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info.montant_par_section) siteMontant = Number(info.montant_par_section) || siteMontant;
        if (info.payment_link_1_section) PAY_LINKS[1] = info.payment_link_1_section;
        if (info.payment_link_2_sections) PAY_LINKS[2] = info.payment_link_2_sections;
        if (info.payment_link_3_sections) PAY_LINKS[3] = info.payment_link_3_sections;
        if (info.cosudo_payment_link_lycee) COSUDO_LINKS.lycee = info.cosudo_payment_link_lycee;
        if (info.cosudo_payment_link_universite) COSUDO_LINKS.universite = info.cosudo_payment_link_universite;
        // Etiquettes des montants mises a jour depuis la config (Cosudo = 2200 par defaut)
        var cMontant = Number(info.cosudo_montant_par_section || info.cosudo_montant_par_eleve || 0);
        if (cMontant > 0) {
          cosudoMontant = cMontant;
          var oL = document.querySelector('#fb-cosudo-section option[value="lycee"]');
          var oU = document.querySelector('#fb-cosudo-section option[value="universite"]');
          if (oL) oL.textContent = "Lycée — " + cMontant.toLocaleString("fr-FR") + " FCFA";
          if (oU) oU.textContent = "Université — " + cMontant.toLocaleString("fr-FR") + " FCFA";
        }
        var fMontant = Number(info.montant_par_section || info.montant_par_eleve || 0);
        if (fMontant > 0) {
          [["1", 1], ["2", 2], ["3", 3]].forEach(function (paire) {
            var o = document.querySelector('#fb-sections option[value="' + paire[0] + '"]');
            if (o) o.textContent = paire[1] + " section" + (paire[1] > 1 ? "s" : "") + " — " + (fMontant * paire[1]).toLocaleString("fr-FR") + " FCFA";
          });
        }
        if (info.logo && $("site-logo")) {
          $("site-logo").src = info.logo;
          $("site-logo").classList.remove("hidden");
        }
        var choice = computeChoice(params.type, params.sections, params.section);
        if (!choice) {
          // Pas de paramètres valides : proposer le sélecteur.
          $("fallback-box").classList.remove("hidden");
          $("pay-intro").textContent = "Choisis ton type d'inscription ci-dessous : le bon lien de paiement s'affiche automatiquement.";
          choice = computeChoice("fenemof", "1", "");
          apply(choice);
          return;
        }
        apply(choice);
        // Met à jour le détail si les liens config diffèrent des montants par défaut.
      })
      .catch(function () {
        var choice = computeChoice(params.type, params.sections, params.section) || computeChoice("fenemof", "1", "");
        apply(choice);
      });
  }

  function initFallback() {
    var typeSel = $("fb-type");
    typeSel.addEventListener("change", function () {
      var isCosudo = typeSel.value === "cosudo";
      $("fb-fenemof-box").classList.toggle("hidden", isCosudo);
      $("fb-cosudo-box").classList.toggle("hidden", !isCosudo);
    });
    $("fb-apply").addEventListener("click", function () {
      var choice = computeChoice(typeSel.value,
        $("fb-sections").value,
        $("fb-cosudo-section").value);
      if (!choice) {
        toast("Choisis un nombre de sections entre 1 et 3.");
        return;
      }
      apply(choice);
      toast("Lien de paiement mis à jour.");
      document.querySelector(".pay-card-main").scrollIntoView({ behavior: "smooth" });
    });
  }

  function init() {
    $("footer-year").textContent = new Date().getFullYear();
    if (params.recu) {
      var l = $("recu-link");
      l.href = "/recu/" + encodeURIComponent(params.recu);
      l.classList.remove("hidden");
    }
    initFallback();
    loadInfo();
    // Le sondage affiche le message d'attente et redirige UNIQUEMENT
    // quand le createur valide le paiement. Pas d'activation auto.
    startPolling();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
