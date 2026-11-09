/* Pedigree and fan views. The pedigree opens on the home page and on tree/.
   - Tap a person to move the tree to them; the person at the start has a button to open
     their page. The URL (#/<slug>) follows, so Back works and any view can be shared.
   - "More generations" / "Fewer" / "All" zoom out and in. Branches with nobody known are
     left out, so even all 20 generations stay readable; the tree scrolls sideways. */
(function () {
  "use strict";
  var el = document.getElementById("tree");
  if (!el) return;
  var base = el.dataset.base || "";
  var kidsEl = document.getElementById("tree-kids");
  var depthEl = document.getElementById("tree-depth");
  var D, P, view = "pedigree", depth = null, MAX = 20, zoom = 1, fitNext = false;

  fetch(base + "data/graph.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; P = d.people;
    window.addEventListener("hashchange", draw);
    window.addEventListener("resize", debounce(function () { if (view !== "pedigree") draw(); }, 150));
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () { view = b.dataset.view; depth = null; draw(); });
    });
    document.querySelectorAll("[data-depth]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = curDepth(), a = b.dataset.depth, max = maxDepth(focus());
        depth = a === "all" ? max : a === "+" ? Math.min(n + 1, max, view === "fan" ? 8 : MAX) : Math.max(n - 1, 2);
        zoom = 1; fitNext = depth >= 7;
        draw();
      });
    });
    document.querySelectorAll("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.zoom;
        if (a === "fit") fit(); else setZoom(zoom * (a === "in" ? 1.25 : 0.8));
      });
    });
    draw();
  });

  // ------------------------------------------------------------------ zoom and pan
  function sizes() {
    var g = el.querySelector(".ped-grid");
    return g ? { w: g.offsetWidth, h: g.offsetHeight } : null;
  }
  function setZoom(z, cx, cy) {
    var wrap = el.querySelector(".ped-scroll"), zb = el.querySelector(".ped-zoom"), sz = el.querySelector(".ped-sizer"), d = sizes();
    if (!wrap || !zb || !d) return;
    z = Math.max(0.08, Math.min(2, z));
    // keep the point under the fingers / cursor (or the centre) still
    cx = cx == null ? wrap.clientWidth / 2 : cx; cy = cy == null ? wrap.clientHeight / 2 : cy;
    var px = (wrap.scrollLeft + cx) / zoom, py = (wrap.scrollTop + cy) / zoom;
    zoom = z;
    zb.style.transform = "scale(" + z + ")";
    sz.style.width = d.w * z + "px"; sz.style.height = d.h * z + "px";
    wrap.scrollLeft = px * z - cx; wrap.scrollTop = py * z - cy;
    var zl = document.getElementById("tree-zoom");
    if (zl) zl.textContent = Math.round(z * 100) + "%";
  }
  function fit() {
    var wrap = el.querySelector(".ped-scroll"), d = sizes();
    if (!wrap || !d) return;
    var z = Math.min((wrap.clientWidth - 20) / d.w, 1);
    setZoom(z, 0, 0);
    var fc = el.querySelector(".tcard.focus");
    if (fc) wrap.scrollTop = Math.max(0, fc.offsetTop * z - wrap.clientHeight / 2);
    wrap.scrollLeft = 0;
  }
  function wirePanZoom(wrap) {
    // Mouse: drag to pan; ctrl/cmd + wheel (and trackpad pinch) to zoom.
    var drag = null, moved = false;
    wrap.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, l: wrap.scrollLeft, t: wrap.scrollTop }; moved = false;
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; wrap.classList.add("panning"); }
      if (moved) { wrap.scrollLeft = drag.l - dx; wrap.scrollTop = drag.t - dy; }
    });
    window.addEventListener("pointerup", function () { drag = null; wrap.classList.remove("panning"); });
    wrap.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    wrap.addEventListener("wheel", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var r = wrap.getBoundingClientRect();
      setZoom(zoom * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    // Touch: two-finger pinch zooms the tree; one finger scrolls as usual.
    var pinch = null;
    wrap.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) {
        var r = wrap.getBoundingClientRect();
        pinch = { d: dist(e.touches), z: zoom, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left,
          cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top };
      }
    }, { passive: true });
    wrap.addEventListener("touchmove", function (e) {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      setZoom(pinch.z * dist(e.touches) / pinch.d, pinch.cx, pinch.cy);
    }, { passive: false });
    wrap.addEventListener("touchend", function () { pinch = null; });
  }
  function dist(t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); }

  function focus() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, "").split("/")[0]);
    return P[h] ? h : D.root;
  }
  function defaultDepth(v) {
    var w = window.innerWidth;
    if (v === "fan") return w < 600 ? 4 : w < 900 ? 5 : 6;
    return 4;
  }
  function curDepth() { return depth || defaultDepth(view); }
  function maxDepth(f) {
    var best = 1;
    (function walk(x, g) {
      if (!x || !P[x] || g > MAX) return;
      if (g > best) best = g;
      walk(P[x][4], g + 1); walk(P[x][5], g + 1);
    })(f, 1);
    return best;
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cls(g) {
    return { "Confirmed": "conf-confirmed", "Probable": "conf-probable", "Speculative": "conf-speculative",
      "From family": "conf-user", "Living": "conf-living" }[g] || "conf-none";
  }
  function href(sl) { return "#/" + sl; }

  function draw() {
    var f = focus();
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.view === view));
    });
    var max = maxDepth(f);
    if (depthEl) {
      depthEl.textContent = "Showing " + Math.min(curDepth(), max) + " of " + max + " generation" + (max === 1 ? "" : "s");
    }
    document.querySelectorAll("[data-depth]").forEach(function (b) {
      var a = b.dataset.depth, c = Math.min(curDepth(), max);
      b.disabled = (a === "+" || a === "all") ? c >= (view === "fan" ? Math.min(8, max) : max) : c <= 2;
    });
    document.querySelectorAll("[data-zoom]").forEach(function (b) { b.hidden = view === "fan"; });
    var zl = document.getElementById("tree-zoom"); if (zl) zl.hidden = view === "fan";
    if (view === "fan") fan(f, Math.min(curDepth(), 8)); else pedigree(f, Math.min(curDepth(), max));
    children(f);
  }

  // ------------------------------------------------------------------ pedigree
  function pedigree(f, n) {
    var compact = n >= 7;
    var showGaps = n <= 5;
    var cells = [];
    // Each person takes as many rows as the known ancestors behind them, so empty
    // branches cost nothing.
    function place(sl, g, row, kind) {
      var p = sl && P[sl];
      var kids = [];
      if (p && g < n) {
        if (p[4] || showGaps) kids.push([p[4], "father"]);
        if (p[5] || showGaps) kids.push([p[5], "mother"]);
      }
      var span = 0, childCells = [];
      kids.forEach(function (k) {
        var r = place(k[0], g + 1, row + span, k[1]);
        span += r.span; childCells.push(r.id);
      });
      span = Math.max(span, 1);
      var id = cells.length;
      cells.push({ sl: sl, g: g, row: row, span: span, parents: childCells, kind: kind });
      return { span: span, id: id };
    }
    var rootRes = place(f, 1, 1, "");
    cells.forEach(function (c, i) { c.i = i; });
    var html = cells.map(function (c) {
      var style = "grid-column:" + c.g + ";grid-row:" + c.row + " / span " + c.span;
      if (!c.sl) return '<div class="tcard empty" data-i="' + c.i + '" style="' + style + '"><span>' +
        (c.kind === "father" ? "Father" : "Mother") + " not identified</span></div>";
      var p = P[c.sl];
      var inner = '<span class="t-name">' + esc(p[0]) + '</span><span class="t-life">' + esc(p[1]) + "</span>" +
        (compact ? "" : '<span class="t-meta"><i class="dot ' + cls(p[2]) + '"></i>' + esc(p[2]) + "</span>");
      if (c.g === 1) {
        return '<div class="tcard focus ' + cls(p[2]) + '" data-i="' + c.i + '" style="' + style + '">' + inner +
          '<a class="btn t-open" href="' + base + "p/" + c.sl + '/">Open ' + esc(p[0].split(" ")[0]) + "’s page</a></div>";
      }
      return '<a class="tcard ' + cls(p[2]) + '" data-i="' + c.i + '" style="' + style + '" href="' + href(c.sl) +
        '" title="' + esc(p[0] + ", " + p[1] + " (" + p[2] + "). Tap to move the tree here.") + '">' + inner + "</a>";
    }).join("");
    el.className = "tree pedigree" + (compact ? " compact" : "");
    el.innerHTML = '<div class="ped-scroll"><div class="ped-sizer"><div class="ped-zoom">' +
      '<svg class="ped-lines" aria-hidden="true"></svg><div class="ped-grid" style="--cols:' + n + '">' + html +
      "</div></div></div></div>";
    el._cells = cells;
    var wrap = el.querySelector(".ped-scroll");
    wirePanZoom(wrap);
    lines();
    var z = zoom; zoom = 1; setZoom(1, 0, 0);
    if (fitNext) { fitNext = false; fit(); return; }
    if (z !== 1) setZoom(z, 0, 0);
    // Keep the person the tree starts from in view.
    var fc = el.querySelector(".tcard.focus");
    if (fc) {
      wrap.scrollTop = Math.max(0, fc.offsetTop * zoom - wrap.clientHeight / 2 + fc.offsetHeight * zoom / 2);
      wrap.scrollLeft = 0;
    }
  }
  function lines() {
    // Positions from layout (offsets), which the zoom transform does not change.
    var grid = el.querySelector(".ped-grid"), svg = el.querySelector(".ped-lines");
    if (!grid || !svg || !el._cells) return;
    svg.setAttribute("width", grid.offsetWidth); svg.setAttribute("height", grid.offsetHeight);
    var nodes = {}, d = [];
    grid.querySelectorAll("[data-i]").forEach(function (n) {
      nodes[n.dataset.i] = { l: n.offsetLeft, r: n.offsetLeft + n.offsetWidth, m: n.offsetTop + n.offsetHeight / 2 };
    });
    el._cells.forEach(function (c) {
      var a = nodes[c.i];
      if (!a) return;
      c.parents.forEach(function (pi) {
        var b = nodes[pi];
        if (!b) return;
        var mx = (a.r + b.l) / 2;
        d.push("M" + a.r + " " + a.m + "H" + mx + "V" + b.m + "H" + b.l);
      });
    });
    svg.innerHTML = '<path d="' + d.join("") + '"></path>';
  }

  // ------------------------------------------------------------------ fan
  function fan(f, n) {
    var s = { 1: f };
    for (var k = 1; k < Math.pow(2, n + 1); k++) {
      var p = s[k] && P[s[k]];
      s[2 * k] = p ? p[4] : ""; s[2 * k + 1] = p ? p[5] : "";
    }
    var W = 1000, cx = 500, cy = 520, r0 = 110, w = (490 - r0) / n, out = [];
    for (var g = 1; g <= n; g++) {
      var cnt = Math.pow(2, g);
      for (var i = 0; i < cnt; i++) {
        var key = cnt + i, sl = s[key], pp = sl && P[sl];
        var a0 = Math.PI + Math.PI * i / cnt, a1 = Math.PI + Math.PI * (i + 1) / cnt;
        var ri = r0 + (g - 1) * w, ro = ri + w, txt = "";
        if (pp) {
          var mid = (a0 + a1) / 2, rm = (ri + ro) / 2, tx = cx + rm * Math.cos(mid), ty = cy + rm * Math.sin(mid);
          var deg = mid * 180 / Math.PI, radial = g >= 3;
          var rot = radial ? (deg < 270 ? deg + 180 : deg - 360) : deg + 90;
          var fs = g <= 2 ? 22 : g <= 4 ? 17 : g <= 6 ? 13 : 10;
          var maxc = radial ? Math.floor(w / (fs * .52)) : Math.floor((rm * (a1 - a0)) / (fs * .52));
          if (fs * 1.1 < rm * (a1 - a0) || !radial) {
            txt = '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="' + fs +
              '" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + rot.toFixed(1) + " " +
              tx.toFixed(1) + " " + ty.toFixed(1) + ')">' + esc(shorten(pp[0], maxc)) + "</text>";
          }
        }
        out.push("<a " + (pp ? 'href="' + href(sl) + '" aria-label="' + esc(pp[0] + ", " + pp[1] + ", " + pp[2]) + '"' : 'aria-hidden="true"') +
          ' class="seg ' + (pp ? cls(pp[2]) : "none") + '"><path d="' + arc(cx, cy, ri, ro, a0, a1) + '" style="fill:' +
          (pp ? "var(--c)" : "transparent") + '"></path>' + txt + "</a>");
      }
    }
    var fp = P[f];
    el.className = "tree fan";
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' 540" role="group" aria-label="Fan chart of ' + esc(fp[0]) + '\'s ancestors">' +
      out.join("") + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 6) + '" class="fan-center"></circle>' +
      '<text x="' + cx + '" y="' + (cy - 60) + '" text-anchor="middle" font-size="22" class="fan-name">' + esc(shorten(fp[0], 20)) + "</text>" +
      '<text x="' + cx + '" y="' + (cy - 34) + '" text-anchor="middle" font-size="17" class="fan-life">' + esc(fp[1]) + "</text></svg>" +
      '<p class="fan-open"><a class="btn" href="' + base + "p/" + f + '/">Open ' + esc(fp[0]) + "’s page</a></p>";
  }
  function arc(cx, cy, ri, ro, a0, a1) {
    function pt(r, a) { return (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1); }
    return "M" + pt(ri, a0) + " L" + pt(ro, a0) + " A" + ro + " " + ro + " 0 0 1 " + pt(ro, a1) +
      " L" + pt(ri, a1) + " A" + ri + " " + ri + " 0 0 0 " + pt(ri, a0) + "Z";
  }
  function shorten(name, n) {
    if (name.length <= n) return name;
    var w = name.split(" "), s = w[0] + (w.length > 1 ? " " + w[w.length - 1] : "");
    if (s.length <= n) return s;
    return w[0].length <= n ? w[0] : w[0].slice(0, Math.max(n - 1, 2)) + "…";
  }

  function children(f) {
    if (!kidsEl) return;
    var kids = [], sp = P[f][6] || [];
    for (var k in P) if (P[k][4] === f || P[k][5] === f) kids.push(k);
    var chip = function (sl) { return '<a class="chip" href="' + href(sl) + '">' + esc(P[sl][0]) + "</a>"; };
    kidsEl.innerHTML = (f !== D.root ? '<p><a class="chip" href="' + href(D.root) + '">Back to ' + esc(D.rootName) + "</a></p>" : "") +
      (sp.length ? '<p><span class="fine">Married to</span> ' + sp.map(chip).join(" ") + "</p>" : "") +
      (kids.length ? '<p><span class="fine">Children (go down a generation)</span> ' + kids.map(chip).join(" ") + "</p>" : "");
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
})();
