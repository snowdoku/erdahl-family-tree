/* Erdahl Family Tree: small progressive enhancements. Every page works without this. */
(function () {
  "use strict";
  var root = document.documentElement;
  var base = (document.querySelector('link[href$="assets/site.css"]') || {}).getAttribute
    ? document.querySelector('link[href$="assets/site.css"]').getAttribute("href").replace("assets/site.css", "")
    : "";

  // Light / dark toggle, remembered on this device only.
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var dark = root.dataset.theme ? root.dataset.theme === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.dataset.theme = dark ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
    });
  });

  // Old links were "…/#<person id>". Send them to the person's page.
  if (location.hash.length > 1 && document.querySelector(".home")) {
    var id = decodeURIComponent(location.hash.slice(1));
    if (/^[a-z][a-z0-9_]*$/.test(id)) {
      slugFor(id).then(function (slug) { location.replace(base + "p/" + slug + "/"); });
    }
  }

  function slugFor(id) {
    // Living people's pages are named by a hash of the id; try the plain id first.
    return fetch(base + "p/" + id + "/", { method: "HEAD" }).then(function (r) {
      if (r.ok) return id;
      return sha1(id).then(function (h) { return "l-" + h.slice(0, 10); });
    }).catch(function () { return id; });
  }
  function sha1(s) {
    return crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ("0" + b.toString(16)).slice(-2);
      }).join("");
    });
  }

  // Search page.
  var sq = document.getElementById("sq");
  if (sq) {
    var out = document.getElementById("results");
    var data = null;
    var q0 = new URLSearchParams(location.search).get("q") || "";
    sq.value = q0;
    fetch(base + "search/index.json").then(function (r) { return r.json(); }).then(function (d) {
      data = d; run();
    });
    sq.addEventListener("input", run);
    function run() {
      if (!data) return;
      var q = fold(sq.value).split(" ").filter(Boolean);
      if (!q.length) { out.innerHTML = ""; return; }
      var hits = [];
      for (var i = 0; i < data.length && hits.length < 80; i++) {
        var words = data[i][3].split(" ");
        var ok = q.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); });
        if (ok) hits.push(data[i]);
      }
      out.innerHTML = hits.length ? hits.map(function (r) {
        var meta = [r[2], r[4] ? "child of " + r[4] : "", r[5]].filter(Boolean).join(" · ");
        return '<li><a href="' + base + "p/" + r[0] + '/"><span class="r-name">' + esc(r[1]) +
          '</span><span class="r-meta">' + esc(meta) + "</span></a></li>";
      }).join("") : '<li class="fine">Nobody matches. Try fewer letters, or only the first name.</li>';
    }
  }
  var hq = document.getElementById("site-q");
  if (hq && sq) hq.value = sq.value;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  window.FT = { fold: function (s) { return fold(s); }, esc: esc, base: base };

  // Must match sitegen/fmt.py fold().
  function fold(s) {
    s = (s || "").toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a").replace(/ö/g, "o")
      .replace(/ä/g, "ae").replace(/ü/g, "u").replace(/ß/g, "ss");
    s = s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ");
    return s.split(/\s+/).filter(Boolean).map(function (w) {
      if (w.length > 4) w = w.replace(/(?:dotter|datter|dattr|dtr|dr)$/, "DATTER");
      if (w.length > 4) w = w.replace(/(?:ssen|sen|son|sson)$/, "SEN");
      w = w.replace(/aa/g, "a").replace(/th/g, "t").replace(/ch/g, "k").replace(/ph/g, "f")
        .replace(/c/g, "k").replace(/w/g, "v").replace(/y/g, "i").replace(/ie/g, "i")
        .replace(/oe/g, "o").replace(/ae/g, "e").replace(/ue/g, "u").replace(/(.)\1+/g, "$1");
      return w.toLowerCase();
    }).join(" ");
  }
})();
