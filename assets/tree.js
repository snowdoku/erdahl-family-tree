/* Pedigree and fan views. A window of generations around one person: tap someone to move
   the window to them; tap the person at the start to open their page. No pan or zoom. */
(function () {
  "use strict";
  var base = "../";
  var el = document.getElementById("tree");
  var kidsEl = document.getElementById("tree-kids");
  var D, P, view = "pedigree";
  try { view = localStorage.getItem("treeView") || "pedigree"; } catch (e) {}

  fetch(base + "data/graph.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; P = d.people;
    window.addEventListener("hashchange", draw);
    window.addEventListener("resize", debounce(draw, 150));
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        view = b.dataset.view;
        try { localStorage.setItem("treeView", view); } catch (e) {}
        draw();
      });
    });
    draw();
  });

  function focus() {
    var h = decodeURIComponent(location.hash.slice(1));
    return P[h] ? h : D.root;
  }
  function gensFor(v) {
    var w = el.clientWidth || window.innerWidth;
    if (v === "fan") return w < 600 ? 4 : w < 900 ? 5 : 6;
    return w < 600 ? 3 : w < 900 ? 4 : 5;
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cls(g) {
    return { "Confirmed": "conf-confirmed", "Probable": "conf-probable", "Speculative": "conf-speculative",
      "From family": "conf-user", "Living": "conf-living" }[g] || "conf-none";
  }
  // Ahnentafel within the window: 1 = focus, 2n father, 2n+1 mother.
  function slots(f, n) {
    var s = { 1: f };
    for (var k = 1; k < Math.pow(2, n); k++) {
      var p = s[k] && P[s[k]];
      s[2 * k] = p ? p[4] : ""; s[2 * k + 1] = p ? p[5] : "";
    }
    return s;
  }

  function draw() {
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
    });
    var f = focus();
    document.title = P[f][0] + " in the tree · Erdahl Family Tree";
    if (view === "fan") fan(f); else pedigree(f);
    children(f);
  }

  function card(sl, k, isFocus) {
    if (!sl) return '<div class="tcard empty" style="' + pos(k) + '"><span>Not identified</span></div>';
    var p = P[sl];
    var inner = '<span class="t-name">' + esc(p[0]) + '</span><span class="t-life">' + esc(p[1]) +
      '</span><span class="t-meta"><i class="dot ' + cls(p[2]) + '"></i>' + esc(p[2]) + "</span>";
    if (isFocus) {
      return '<div class="tcard focus" style="' + pos(k) + '">' + inner +
        '<a class="btn t-open" href="' + base + "p/" + sl + '/">Open ' + esc(p[0].split(" ")[0]) + "’s page</a></div>";
    }
    return '<a class="tcard" style="' + pos(k) + '" href="#' + sl + '">' + inner + "</a>";
  }
  var curN = 3;
  function pos(k) {
    var g = Math.floor(Math.log2(k)), i = k - Math.pow(2, g), span = Math.pow(2, curN - 1 - g);
    return "grid-column:" + (g + 1) + ";grid-row:" + (i * span + 1) + " / span " + span;
  }
  function pedigree(f) {
    var n = curN = gensFor("pedigree");
    var s = slots(f, n), html = "";
    for (var k = 1; k < Math.pow(2, n); k++) {
      var g = Math.floor(Math.log2(k));
      if (g > 0 && !s[k] && !s[k >> 1]) continue;  // nobody to show behind an unknown
      html += card(s[k], k, k === 1);
    }
    el.className = "tree pedigree";
    el.style.setProperty("--cols", n);
    el.style.setProperty("--rows", Math.pow(2, n - 1));
    el.innerHTML = html;
  }

  function fan(f) {
    var n = gensFor("fan"), s = slots(f, n + 1);
    var W = 1000, cx = 500, cy = 520, r0 = 120, w = (480 - r0) / n, out = [];
    for (var g = 1; g <= n; g++) {
      var cnt = Math.pow(2, g);
      for (var i = 0; i < cnt; i++) {
        var k = cnt + i, sl = s[k];
        var a0 = Math.PI + Math.PI * i / cnt, a1 = Math.PI + Math.PI * (i + 1) / cnt;
        var ri = r0 + (g - 1) * w, ro = ri + w;
        var d = arc(cx, cy, ri, ro, a0, a1);
        var p = sl && P[sl];
        var fill = p ? "var(--c)" : "transparent";
        var txt = "";
        if (p) {
          var mid = (a0 + a1) / 2, rm = (ri + ro) / 2;
          var tx = cx + rm * Math.cos(mid), ty = cy + rm * Math.sin(mid);
          var deg = mid * 180 / Math.PI;
          var radial = g >= 3;
          var rot = radial ? (deg > 270 ? deg - 360 : deg) : deg + 90;
          if (radial && deg < 270) rot = deg + 180;
          var fs = g <= 2 ? 22 : g <= 4 ? 17 : 14;
          var maxc = radial ? Math.floor(w / (fs * .52)) : Math.floor((rm * (a1 - a0)) / (fs * .52));
          var nm = shorten(p[0], maxc);
          txt = '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="' + fs +
            '" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + rot.toFixed(1) + " " +
            tx.toFixed(1) + " " + ty.toFixed(1) + ')">' + esc(nm) + "</text>";
        }
        out.push('<a ' + (p ? 'href="#' + sl + '" aria-label="' + esc(p[0] + ", " + p[1] + ", " + p[2]) + '"' : 'aria-hidden="true"') + ' class="seg ' + (p ? cls(p[2]) : "none") + '">' +
          "<title>" + esc(p ? p[0] + ", " + p[1] + " (" + p[2] + ")" : "Not identified") + "</title>" +
          '<path d="' + d + '" style="fill:' + fill + '"></path>' + txt + "</a>");
      }
    }
    var fp = P[f];
    var center = '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 6) + '" class="fan-center"></circle>' +
      '<text x="' + cx + '" y="' + (cy - 62) + '" text-anchor="middle" font-size="22" class="fan-name">' +
      esc(shorten(fp[0], 20)) + "</text>" +
      '<text x="' + cx + '" y="' + (cy - 36) + '" text-anchor="middle" font-size="17" class="fan-life">' + esc(fp[1]) + "</text>";
    el.className = "tree fan";
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' 540" role="group" aria-label="Fan chart of ' + esc(fp[0]) +
      '\'s ancestors">' + out.join("") + center + "</svg>" +
      '<p class="fan-open"><a class="btn" href="' + base + "p/" + f + '/">Open ' + esc(fp[0]) + "’s page</a></p>";
  }
  function arc(cx, cy, ri, ro, a0, a1) {
    function pt(r, a) { return (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1); }
    var lg = a1 - a0 > Math.PI ? 1 : 0;
    return "M" + pt(ri, a0) + " L" + pt(ro, a0) + " A" + ro + " " + ro + " 0 " + lg + " 1 " + pt(ro, a1) +
      " L" + pt(ri, a1) + " A" + ri + " " + ri + " 0 " + lg + " 0 " + pt(ri, a0) + "Z";
  }
  function shorten(name, n) {
    if (name.length <= n) return name;
    var w = name.split(" ");
    var s = w[0] + (w.length > 1 ? " " + w[w.length - 1] : "");
    if (s.length <= n) return s;
    return n > 3 ? w[0].slice(0, Math.max(n - 1, 2)) + (w[0].length > n - 1 ? "…" : "") : w[0].slice(0, 2);
  }

  function children(f) {
    var kids = [], sp = P[f][6] || [];
    for (var k in P) if (P[k][4] === f || P[k][5] === f) kids.push(k);
    var chip = function (sl) { return '<a class="chip" href="#' + sl + '">' + esc(P[sl][0]) + "</a>"; };
    kidsEl.innerHTML = (sp.length ? '<p><span class="fine">Married to</span> ' + sp.map(chip).join(" ") + "</p>" : "") +
      (kids.length ? '<p><span class="fine">Children (go down a generation)</span> ' + kids.map(chip).join(" ") + "</p>" : "");
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
})();
