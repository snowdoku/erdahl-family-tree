/* Erdahl Family Tree: small progressive enhancements. Every page works without this. */
(function () {
  "use strict";
  var root = document.documentElement;
  var css = document.querySelector('link[href*="assets/site.css"]');
  var base = css ? css.getAttribute("href").replace(/assets\/site\.css.*$/, "") : "";

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

  // Menu button (narrow screens).
  var menuBtn = document.querySelector(".menu-btn"), nav = document.getElementById("site-nav");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", function () {
      var on = nav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(on));
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !e.target.closest(".site-nav, .menu-btn")) {
        nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // One search index, loaded the first time it is needed.
  var idx = null;
  function loadIndex() {
    return idx || (idx = fetch(base + "search/index.json").then(function (r) { return r.json(); }));
  }
  function find(data, text, limit) {
    var q = fold(text).split(" ").filter(Boolean);
    if (!q.length) return [];
    var whole = q.join(" "), hits = [];
    for (var i = 0; i < data.length && hits.length < 400; i++) {
      var words = data[i][3].split(" ");
      if (q.every(function (t) { return words.some(function (w) { return w.indexOf(t) === 0; }); })) {
        hits.push([data[i][3].indexOf(whole) === 0 ? 0 : 1, hits.length, data[i]]);   // names that start with it first
      }
    }
    hits.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    return hits.slice(0, limit).map(function (h) { return h[2]; });
  }
  function hit(r) {
    var meta = [r[2], r[4] ? "child of " + r[4] : "", r[5]].filter(Boolean).join(" · ");
    return '<a href="' + base + "p/" + r[0] + '/"><span class="r-name">' + esc(r[1]) +
      '</span><span class="r-meta">' + esc(meta) + "</span></a>";
  }

  // Search page.
  var sq = document.getElementById("sq");
  if (sq) {
    var out = document.getElementById("results");
    sq.value = new URLSearchParams(location.search).get("q") || "";
    var run = function () {
      loadIndex().then(function (data) {
        if (!fold(sq.value)) { out.innerHTML = ""; return; }
        var hits = find(data, sq.value, 80);
        out.innerHTML = hits.length ? hits.map(function (r) { return "<li>" + hit(r) + "</li>"; }).join("")
          : '<li class="fine">Nobody matches. Try fewer letters, or only the first name.</li>';
      });
    };
    sq.addEventListener("input", run);
    run();
  }

  // Header search: results appear as you type; Enter opens the first, or the full list.
  var hq = document.getElementById("site-q"), list = document.getElementById("site-results");
  if (hq && list) {
    if (sq) hq.value = sq.value;
    var active = -1;
    var close = function () { list.hidden = true; hq.setAttribute("aria-expanded", "false"); active = -1; };
    var show = function () {
      var text = hq.value;
      if (!fold(text)) return close();
      loadIndex().then(function (data) {
        if (hq.value !== text) return;
        var hits = find(data, text, 8);
        list.innerHTML = hits.length
          ? hits.map(function (r) { return '<li role="option">' + hit(r) + "</li>"; }).join("") +
            '<li class="r-all"><a href="' + base + "search/?q=" + encodeURIComponent(text) + '">See every match</a></li>'
          : '<li class="r-none">Nobody matches. Try fewer letters, or only the first name.</li>';
        list.hidden = false; hq.setAttribute("aria-expanded", "true"); active = -1;
      });
    };
    hq.addEventListener("focus", function () { loadIndex(); if (hq.value) show(); });
    hq.addEventListener("input", show);
    hq.addEventListener("keydown", function (e) {
      var items = list.querySelectorAll("li a");
      if (e.key === "Escape") { close(); return; }
      if (list.hidden || !items.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        active = (active + (e.key === "ArrowDown" ? 1 : -1) + items.length + (active < 0 && e.key === "ArrowUp" ? 1 : 0)) % items.length;
        items.forEach(function (a, i) { a.parentNode.classList.toggle("on", i === active); });
        items[active].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        location.href = items[active < 0 ? 0 : active].href;
      }
    });
    document.addEventListener("click", function (e) { if (!e.target.closest(".site-search")) close(); });
  }

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
