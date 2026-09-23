(function () {
  "use strict";

  var OPEN_KEY = "fenemof_chat_open";
  var SESSION_KEY = "fenemof_chat_session";
  var panel, body, input, form;
  var sessionId = "";
  var history = [];

  function sid () {
    var s = localStorage.getItem(SESSION_KEY);
    if (!s) {
      s = "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_KEY, s);
    }
    return s;
  }

  function el (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function ready () {
    sessionId = sid();
    panel = document.getElementById("chat-panel");
    body = document.getElementById("chat-body");
    input = document.getElementById("chat-input");
    form = document.getElementById("chat-form");

    document.getElementById("chat-toggle").addEventListener("click", toggle);
    document.getElementById("chat-close").addEventListener("click", close);
    form.addEventListener("submit", onSend);

    // rouvrir si l'utilisateur l'avait laissé ouvert
    if (localStorage.getItem(OPEN_KEY) === "1") {
      open();
    }
  }

  function toggle () {
    if (panel.classList.contains("hidden")) { open(); } else { close(); }
  }

  function open () {
    panel.classList.remove("hidden");
    localStorage.setItem(OPEN_KEY, "1");
    if (!body.childElementCount) {
      addMsg("bot", "Bonjour ! 👋 Je suis l'assistant de Fenemof. Posez-moi une question sur l'inscription, le paiement MTN/Airtel, les sections, les reçus, les partenaires ou les éditions. Je me souviens de notre conversation.");
    }
    input.focus();
  }

  function close () {
    panel.classList.add("hidden");
    localStorage.setItem(OPEN_KEY, "0");
  }

  function addMsg (who, text) {
    var m = el("div", "msg " + who, text);
    m.style.whiteSpace = "pre-line";
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }

  function onSend (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    addMsg("user", q);
    history.push({ role: "user", content: q });
    input.value = "";
    var typing = addMsg("bot", "");
    typing.classList.add("typing-dots");

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q, session: sessionId, historique: history.slice(-10) }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        typing.classList.remove("typing-dots");
        var reponse = res.reponse || "Je n'ai pas compris. Réessayez.";
        typing.textContent = reponse;
        history.push({ role: "assistant", content: reponse });
      })
      .catch(function () {
        typing.classList.remove("typing-dots");
        typing.textContent = "Impossible de contacter le serveur pour le moment.";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }
})();
