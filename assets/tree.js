/* The family tree: a map you can drag and zoom.
   - Drag to move, wheel or pinch to zoom, double-click to zoom in.
   - Tap a person: a card opens with who they are and what you can do next.
   - The + on a person's right edge opens their parents; − closes that branch.
   - The stepper goes from 2 generations to all of them, always left to right. Past six the
     rows become thin and every column is kept on screen; tap any part to zoom in there.
   - A heading over each column says which generation it is and when those people were born.
   - #/<slug> finds that person in the main tree; #/~<slug> starts the tree from them. */
(function () {
  "use strict";
  var stage = document.getElementById("tree");
  if (!stage) return;
  var base = stage.dataset.base || "";
  var world = stage.querySelector(".tree-world");
  var svg = stage.querySelector(".tree-lines");
  var cardsEl = stage.querySelector(".tree-cards");
  var panel = document.getElementById("tree-panel");
  var depthEl = document.getElementById("tree-depth");
  var homeEl = document.getElementById("tree-home");
  var hint = document.getElementById("tree-hint");
  var bar = stage.querySelector(".tree-bar");
  var colsEl = document.getElementById("tree-cols");

  var D, P, root = null, view = "tree", sel = null, open = {}, fanDepth = 5;
  var nodes = [], byPath = {}, W = 0, H = 0, maxG = 0;
  var T = { x: 0, y: 0, k: 1 }, cur = { x: 0, y: 0, k: 1 }, raf = 0, kMin = 0.05, kMax = 1.6;
  var CW = 184, CH = 56, GX = 46, GY = 10, small = false;
  var big = false, dense = false, marks = [], colEls = [];   // big: more than six generations, thin rows
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ancMemo = {}, deepMemo = {};
  var TREE_CAP = 6;   // up to here the cards are full size; deeper trees use thin rows

  fetch(base + "data/graph.json").then(function (r) { return r.json(); }).then(function (d) {
    D = d; P = d.people;
    metrics();
    wire();
    applyHash();
    stage.classList.add("ready");
  });

  // ------------------------------------------------------------------ data helpers
  function par(sl) {
    var p = P[sl];
    return [p[4] && P[p[4]] ? p[4] : "", p[5] && P[p[5]] ? p[5] : ""];
  }
  function anc(sl) {            // how many cards sit behind this person
    if (sl in ancMemo) return ancMemo[sl];
    ancMemo[sl] = 0;
    var n = 0;
    par(sl).forEach(function (x) { if (x) n += 1 + anc(x); });
    return (ancMemo[sl] = n);
  }
  function deep(sl) {           // generations from this person back, counting them
    if (sl in deepMemo) return deepMemo[sl];
    deepMemo[sl] = 1;
    var n = 0;
    par(sl).forEach(function (x) { if (x) n = Math.max(n, deep(x)); });
    return (deepMemo[sl] = n + 1);
  }
  function slugAt(path) {
    var sl = root;
    for (var i = 1; i < path.length && sl; i++) sl = par(sl)[path.charAt(i) === "f" ? 0 : 1];
    return sl;
  }
  function findPath(from, to) {  // shortest line of descent, as "r" + f/m steps
    var q = [[from, "r"]], seen = {};
    seen[from] = 1;
    while (q.length) {
      var it = q.shift();
      if (it[0] === to) return it[1];
      var pr = par(it[0]);
      for (var i = 0; i < 2; i++) {
        if (pr[i] && !seen[pr[i]]) { seen[pr[i]] = 1; q.push([pr[i], it[1] + (i ? "m" : "f")]); }
      }
    }
    return null;
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function cls(g) {
    return { "Confirmed": "conf-confirmed", "Probable": "conf-probable", "Speculative": "conf-speculative",
      "From family": "conf-user", "Living": "conf-living" }[g] || "conf-none";
  }
  function years(life) {        // "c. 1610 – aft. 1680" -> "1610–1680", for the thin rows of Everyone
    var y = String(life || "").match(/\d{4}/g);
    if (!y) return "";
    if (y.length > 1) return y[0] + "–" + y[1];
    return /^\s*\?/.test(life) ? "–" + y[0] : /[–-]/.test(life) ? y[0] + "–" : y[0];
  }
  function first(name) { return String(name || "").split(" ")[0]; }
  function ordinal(n) {
    var s = n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
    return n + s;
  }
  function kin(path) {
    var d = path.length - 1, who = first(P[root][0]) + "’s ";
    if (d === 0) return root === D.root ? "The tree starts here" : "This view starts here";
    var sx = P[slugAt(path)][3];
    var w = sx === "M" ? "father" : sx === "F" ? "mother" : "parent";
    var side = d >= 2 ? " · " + (path.charAt(1) === "f" ? "father’s" : "mother’s") + " side" : "";
    if (d === 1) return who + w;
    if (d === 2) return who + "grand" + w + side;
    if (d === 3) return who + "great-grand" + w + side;
    return who + ordinal(d - 2) + " great-grand" + w + side;
  }

  // ------------------------------------------------------------------ sizes and the camera
  function metrics() {
    small = stage.clientWidth < 700;
    dense = big && view === "tree";
    if (dense) { CW = small ? 164 : 220; CH = 22; GX = small ? 20 : 34; GY = 4; }
    else { CW = small ? 118 : 184; CH = small ? 60 : 56; GX = small ? 24 : 46; GY = small ? 8 : 10; }
    stage.style.setProperty("--cw", CW + "px");
    stage.style.setProperty("--ch", CH + "px");
    stage.classList.toggle("dense", dense);
    if (colsEl && bar) colsEl.style.height = (bar.offsetTop + bar.offsetHeight + 44) + "px";   // a solid band: toolbar, then headings
  }
  function region() {           // the part of the stage nothing else covers
    var w = stage.clientWidth, h = stage.clientHeight, on = !panel.hidden;
    var top = view === "tree" && colsEl ? colsEl.offsetHeight + 8 : (bar ? bar.offsetTop + bar.offsetHeight : 0) + 10;
    var right = on && !small ? panel.offsetWidth + 24 : small ? 10 : 64;
    var bottom = on && small ? panel.offsetHeight + 10 : (small ? 14 : 44);
    return { l: 14, t: top, r: w - right, b: h - bottom, w: w - right - 14, h: h - bottom - top };
  }
  // The camera is moved by hand, frame by frame. A CSS transition would make the browser keep
  // the whole world as one picture, and the full tree is far too big for that on a phone.
  function render() {
    world.style.transform = "translate(" + cur.x.toFixed(1) + "px," + cur.y.toFixed(1) + "px) scale(" + cur.k.toFixed(4) + ")";
    var far = view === "tree" && cur.k < (dense ? 0.5 : 0.42);
    stage.classList.toggle("far", far);
    if (far) for (var i = 0; i < marks.length; i++) marks[i].style.setProperty("--ring", (3.5 / cur.k).toFixed(1) + "px");
    if (view !== "tree" || !colsEl) return;       // the column headings ride along with their columns
    var pitch = (CW + GX) * cur.k, w = CW * cur.k, size = w >= 170 ? "l" : w >= 58 ? "m" : "s";
    if (colsEl.dataset.size !== size) colsEl.dataset.size = size;
    for (var c = 0; c < colEls.length; c++) {
      colEls[c].style.transform = "translateX(" + (cur.x + c * pitch).toFixed(1) + "px)";
      colEls[c].style.width = Math.max(w, 14).toFixed(1) + "px";
    }
  }
  function halt() {             // a new gesture takes over from wherever the camera is now
    if (!raf) return;
    cancelAnimationFrame(raf); raf = 0;
    T.x = cur.x; T.y = cur.y; T.k = cur.k;
  }
  function apply(ease) {
    T.k = Math.max(kMin, Math.min(kMax, T.k));
    var sw = stage.clientWidth, sh = stage.clientHeight, m = 70;
    T.x = Math.min(sw - m, Math.max(m - W * T.k, T.x));
    T.y = Math.min(sh - m, Math.max(m - H * T.k, T.y));
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!ease || calm) { cur.x = T.x; cur.y = T.y; cur.k = T.k; render(); return; }
    var a = { x: cur.x, y: cur.y, k: cur.k }, b = { x: T.x, y: T.y, k: T.k }, t0 = 0;
    raf = requestAnimationFrame(function step(now) {
      if (!t0) t0 = now;
      var u = Math.min(1, (now - t0) / 340), e = 1 - Math.pow(1 - u, 3);
      cur.x = a.x + (b.x - a.x) * e; cur.y = a.y + (b.y - a.y) * e; cur.k = a.k + (b.k - a.k) * e;
      render();
      raf = u < 1 ? requestAnimationFrame(step) : 0;
    });
  }
  function zoomAt(cx, cy, k, ease) {
    k = Math.max(kMin, Math.min(kMax, k));
    var wx = (cx - T.x) / T.k, wy = (cy - T.y) / T.k;
    T.x = cx - wx * k; T.y = cy - wy * k; T.k = k;
    apply(ease);
  }
  function fitBox(x, y, w, h, ease, floor, keep, wide) {
    var r = region();
    var k = Math.min(1, r.w / w, wide ? 1 : r.h / h);
    if (floor && k < floor) k = floor;
    T.k = k;
    T.x = w * k > r.w ? r.l - x * k : r.l + (r.w - w * k) / 2 - x * k;
    keep = keep || byPath.r;                 // too tall to fit: keep this person in the middle
    if (h * k > r.h && keep && view === "tree") T.y = r.t + r.h / 2 - (keep.y + CH / 2) * k;
    else T.y = r.t + (r.h - h * k) / 2 - y * k;
    apply(ease);
  }
  function fitAll(ease, floor) { fitBox(0, 0, W, H, ease, floor); }
  function floorNow() { return view === "tree" && !big ? FLOOR() : 0; }
  function anchor(lim) {        // who to hold still: the selected person if on screen, else whoever is nearest the middle
    var r = region(), cx = r.l + r.w / 2, cy = r.t + r.h / 2, best = null, bd = Infinity;
    nodes.forEach(function (n) {
      if (n.g >= lim) return;                    // about to be hidden
      var x = T.x + (n.x + CW / 2) * T.k, y = T.y + (n.y + CH / 2) * T.k;
      var d = Math.hypot(x - cx, y - cy);
      if (n.path === sel && x > r.l && x < r.r && y > r.t && y < r.b) d = -1;
      if (d < bd) { bd = d; best = { path: n.path, x: x, y: y }; }
    });
    return best;
  }
  function home(ease) {         // the view a tree opens in
    if (view === "tree" && big) fitBox(0, 0, W, H, ease, 0, null, true);   // every column across; drag up and down
    else fitAll(ease, floorNow());
  }
  function reveal(path, ease) { // bring a person into the clear part of the stage
    var n = byPath[path];
    if (!n) return;
    var r = region(), x0 = T.x + n.x * T.k, y0 = T.y + n.y * T.k, x1 = x0 + CW * T.k, y1 = y0 + CH * T.k;
    var pad = 16, dx = 0, dy = 0;            // move only as far as needed
    if (x1 > r.r - pad) dx = r.r - pad - x1; else if (x0 < r.l + pad) dx = r.l + pad - x0;
    if (y1 > r.b - pad) dy = r.b - pad - y1; else if (y0 < r.t + pad) dy = r.t + pad - y0;
    if (!dx && !dy) return;
    T.x += dx; T.y += dy;
    apply(ease);
  }

  // ------------------------------------------------------------------ the tree
  function layout() {
    nodes = []; byPath = {}; maxG = 0;
    var nextY = 0;
    (function place(sl, path, g) {
      var n = { sl: sl, path: path, g: g, kids: [] };
      nodes.push(n); byPath[path] = n;
      if (g > maxG) maxG = g;
      var pr = par(sl);
      n.hasPar = !!(pr[0] || pr[1]);
      if (n.hasPar && open[path] && g < 40) {
        if (pr[0]) n.kids.push(place(pr[0], path + "f", g + 1));
        if (pr[1]) n.kids.push(place(pr[1], path + "m", g + 1));
      }
      if (n.kids.length) n.y = (n.kids[0].y + n.kids[n.kids.length - 1].y) / 2;
      else { n.y = nextY; nextY += CH + GY; }
      n.x = g * (CW + GX);
      return n;
    })(root, "r", 0);
    W = (maxG + 1) * (CW + GX) - GX + 42;      // room for the + buttons on the last column
    H = Math.max(CH, nextY - GY);
  }
  function genName(g) {
    if (g === 0) return first(P[root][0]);
    if (g === 1) return "Parents";
    if (g === 2) return "Grandparents";
    if (g === 3) return "Great-grandparents";
    return ordinal(g - 2) + " great-grandparents";
  }
  function paintCols() {        // one heading per column: the generation and when its people were born
    if (!colsEl) return;
    var lo = [], hi = [], html = "";
    nodes.forEach(function (n) {
      var m = /^\s*(?:c\.|bef\.|aft\.)?\s*(\d{4})/.exec(P[n.sl][1] || "");
      if (!m) return;
      var y = +m[1];
      if (!(n.g in lo) || y < lo[n.g]) lo[n.g] = y;
      if (!(n.g in hi) || y > hi[n.g]) hi[n.g] = y;
    });
    for (var g = 0; g <= maxG; g++) {
      var yrs = g in lo ? (lo[g] === hi[g] ? String(lo[g]) : lo[g] + "–" + hi[g]) : "";
      html += '<div class="tc"><b class="c-kin">' + esc(genName(g)) + '</b><b class="c-gen">Gen ' + (g + 1) + '</b><b class="c-n">' + (g + 1) +
        '</b><small><span class="c-l">Gen ' + (g + 1) + (yrs ? " · born " : "") + "</span>" + yrs + "</small></div>";
    }
    colsEl.innerHTML = html;
    colEls = colsEl.children;
  }
  function paintTree() {
    layout();
    paintCols();
    var html = "", d = "", hi = "";
    nodes.forEach(function (n) {
      var p = P[n.sl], isOpen = !!n.kids.length;
      var onLine = sel && sel.indexOf(n.path) === 0;
      html += '<div class="tn ' + cls(p[2]) + (n.path === sel ? " sel" : "") + (n.g === 0 ? " root" : "") +
        '" data-path="' + n.path + '" style="left:' + n.x + "px;top:" + n.y + 'px">' +
        '<button type="button" class="tn-card" title="' + esc(p[0] + (p[1] ? ", " + p[1] : "")) + '">' +
        '<span class="tn-name">' + esc(p[0]) + '</span><span class="tn-life">' + esc(dense ? years(p[1]) : p[1]) + "</span></button>" +
        (n.hasPar ? '<button type="button" class="tn-x" aria-expanded="' + isOpen + '" aria-label="' +
          (isOpen ? "Hide the ancestors of " : "Show the parents of ") + esc(p[0]) + '">' +
          (isOpen ? "−" : "+" + anc(n.sl)) + "</button>" : "") + "</div>";
      n.kids.forEach(function (k) {
        var x1 = n.x + CW, y1 = n.y + CH / 2, x2 = k.x, y2 = k.y + CH / 2, mx = (x1 + x2) / 2;
        var seg = dense ? "M" + x1 + " " + y1 + "H" + mx + "V" + y2 + "H" + x2
          : "M" + x1 + " " + y1 + "C" + mx + " " + y1 + " " + mx + " " + y2 + " " + x2 + " " + y2;
        if (onLine && sel.indexOf(k.path) === 0) hi += seg; else d += seg;
      });
    });
    cardsEl.innerHTML = html;
    marks = cardsEl.querySelectorAll(".tn.sel, .tn.root");
    svg.setAttribute("width", W); svg.setAttribute("height", H);
    svg.innerHTML = '<path d="' + d + '"></path><path class="hi" d="' + hi + '"></path>';
    world.style.width = W + "px"; world.style.height = H + "px";
  }
  function setDepth(n) {        // show the same number of generations on every branch
    open = {};
    (function walk(sl, path, g) {
      var pr = par(sl);
      if (g >= n - 1 || !(pr[0] || pr[1])) return;
      open[path] = true;
      if (pr[0]) walk(pr[0], path + "f", g + 1);
      if (pr[1]) walk(pr[1], path + "m", g + 1);
    })(root, "r", 0);
  }
  function openAll(path) {
    (function walk(sl, pth, g) {
      var pr = par(sl);
      if (!(pr[0] || pr[1]) || g > 40) return;
      open[pth] = true;
      if (pr[0]) walk(pr[0], pth + "f", g + 1);
      if (pr[1]) walk(pr[1], pth + "m", g + 1);
    })(slugAt(path), path, path.length - 1);
  }
  function closeBranch(path) {
    Object.keys(open).forEach(function (k) { if (k.indexOf(path) === 0) delete open[k]; });
    if (sel && sel.indexOf(path) === 0 && sel !== path) sel = path;
  }
  function toggle(path) {
    var n = byPath[path];
    if (!n) return;
    halt();
    var sx = T.x + n.x * T.k, sy = T.y + n.y * T.k;
    var opening = !open[path];
    if (opening) open[path] = true; else closeBranch(path);
    paint();
    n = byPath[path];
    T.x = sx - n.x * T.k; T.y = sy - n.y * T.k;   // the person you tapped stays put
    apply(false);
    if (opening && n.kids.length) {               // make sure the new parents can be seen
      var r = region(), dx = 0, dy = 0;
      var k0 = n.kids[0], kl = n.kids[n.kids.length - 1];
      var left = T.x + Math.min(k0.x, kl.x) * T.k, right = T.x + (Math.max(k0.x, kl.x) + CW) * T.k;
      var top = T.y + k0.y * T.k, bot = T.y + (kl.y + CH) * T.k;
      if (right > r.r) dx = r.r - right; else if (left < r.l) dx = r.l - left;
      if (top < r.t) dy = r.t - top; else if (bot > r.b) dy = r.b - bot;
      if (dx || dy) { T.x += dx; T.y += dy; apply(true); }
    }
    if (!panel.hidden) showPanel();
  }

  // ------------------------------------------------------------------ the fan
  // Every ring is a generation, and every person's slice is split evenly between their two
  // parents, known or not: each parent is half of you, each grandparent a quarter. Where a
  // line has not been traced the slice stays empty, so a gap looks like a gap. Up to seven
  // rings it is a half circle; beyond that a full one (father's side left, mother's right).
  function fanRings() { return Math.max(1, Math.min(fanDepth, deep(root) - 1)); }
  function paintFan() {
    var n = fanRings(), full = n > 7;
    var r0 = 110, th = n <= 4 ? 96 : n <= 7 ? 88 : 96, slim = 44, wide = full ? 8 : n;
    // past the eighth ring a slice is too narrow for a name, so those rings are thinner
    function rIn(g) { return r0 + (Math.min(g, wide + 1) - 1) * th + Math.max(0, g - 1 - wide) * slim; }
    var R = rIn(n + 1), cx = R + 10, cy = R + 10, out = [], bands = "";
    var A0 = full ? Math.PI / 2 : Math.PI, A1 = full ? Math.PI * 2.5 : Math.PI * 2;
    for (var b = 1; b <= n; b++) bands += '<path class="band" d="' + arc(cx, cy, rIn(b), rIn(b + 1), A0, A1) + '"></path>';
    (function draw(sl, path, g, a0, a1) {
      if (g > 0) {
        var p = P[sl], ri = rIn(g), ro = rIn(g + 1), txt = "";
        var mid = (a0 + a1) / 2, rm = (ri + ro) / 2, len = rm * (a1 - a0);
        var tx = cx + rm * Math.cos(mid), ty = cy + rm * Math.sin(mid);
        var deg = ((mid * 180 / Math.PI) % 360 + 360) % 360;
        var fs = g <= 2 ? 21 : g <= 4 ? 16 : 13;
        var across = len >= Math.min(p[0].length, 14) * fs * 0.56 && g <= 3;   // room to write along the arc
        if (across || len >= fs * 1.15) {
          var rot = across ? (deg > 0 && deg < 180 ? deg - 90 : deg + 90) : (deg > 90 && deg < 270 ? deg + 180 : deg);
          var maxc = Math.floor((across ? len : ro - ri - 12) / (fs * 0.56));
          txt = '<text x="' + tx.toFixed(1) + '" y="' + ty.toFixed(1) + '" font-size="' + fs +
            '" text-anchor="middle" dominant-baseline="middle" transform="rotate(' + rot.toFixed(1) + " " +
            tx.toFixed(1) + " " + ty.toFixed(1) + ')">' + esc(shorten(p[0], maxc)) + "</text>";
        }
        out.push('<a href="#" data-path="' + path + '" aria-label="' + esc(p[0] + ", " + p[1] + ", " + p[2]) +
          '" class="seg ' + cls(p[2]) + (len < 6 ? " thin" : "") + (path === sel ? " sel" : "") + '"><title>' + esc(p[0] + (p[1] ? ", " + p[1] : "")) +
          '</title><path d="' + arc(cx, cy, ri, ro, a0, a1) + '"></path>' + txt + "</a>");
      }
      if (g >= n) return;
      var pr = par(sl), half = (a0 + a1) / 2;
      if (pr[0]) draw(pr[0], path + "f", g + 1, a0, half);
      if (pr[1]) draw(pr[1], path + "m", g + 1, half, a1);
    })(root, "r", 0, A0, A1);
    var fp = P[root];
    W = 2 * R + 20; H = full ? 2 * R + 20 : R + r0 + 14;
    cardsEl.innerHTML = '<svg class="fan" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H +
      '" role="group" aria-label="Fan chart of ' + esc(fp[0]) + '’s ancestors">' + bands + out.join("") +
      '<a href="#" data-path="r" class="fan-mid' + (sel === "r" ? " sel" : "") +
      '"><circle cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 6) + '"></circle>' +
      '<text x="' + cx + '" y="' + (cy - 12) + '" text-anchor="middle" font-size="21" class="fan-name">' + esc(shorten(fp[0], 18)) + "</text>" +
      '<text x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle" font-size="15">' + esc(fp[1]) + "</text></a></svg>";
    svg.innerHTML = "";
    world.style.width = W + "px"; world.style.height = H + "px";
  }
  function arc(cx, cy, ri, ro, a0, a1) {
    if (a1 - a0 > Math.PI * 2 - 0.002) a1 = a0 + Math.PI * 2 - 0.002;
    var big = a1 - a0 > Math.PI ? 1 : 0;
    function pt(r, a) { return (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1); }
    return "M" + pt(ri, a0) + " L" + pt(ro, a0) + " A" + ro + " " + ro + " 0 " + big + " 1 " + pt(ro, a1) +
      " L" + pt(ri, a1) + " A" + ri + " " + ri + " 0 " + big + " 0 " + pt(ri, a0) + "Z";
  }
  function shorten(name, n) {
    if (name.length <= n) return name;
    var w = name.split(" "), s = w[0] + (w.length > 1 ? " " + w[w.length - 1] : "");
    if (s.length <= n) return s;
    return w[0].length <= n ? w[0] : w[0].slice(0, Math.max(n - 1, 2)) + "…";
  }

  // ------------------------------------------------------------------ paint, toolbar, panel
  function paint() {
    metrics();
    marks = [];
    if (view === "fan") paintFan(); else paintTree();
    var r = region();
    kMin = Math.max(0.02, Math.min(0.3, 0.7 * Math.min(r.w / W, r.h / H)));
    kMax = view === "fan" ? 8 : 1.6;          // the outer rings of the fan are hairlines until you zoom in
    stage.dataset.view = view;
    var max = deep(root), shown = view === "fan" ? fanRings() + 1 : maxG + 1;
    if (depthEl) depthEl.textContent = shown + (small ? " gen." : " generations");
    stage.querySelectorAll("[data-view]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.view === view)); });
    stage.querySelectorAll("[data-depth]").forEach(function (b) {
      var a = b.dataset.depth;
      if (a === "all") b.setAttribute("aria-pressed", String(max > 2 && (view === "fan" ? shown >= max : nodes.length === anc(root) + 1)));
      else b.disabled = a === "-" ? shown <= 2 : shown >= max;
    });
    if (homeEl) {
      homeEl.hidden = root === D.root;
      homeEl.textContent = "← Back to " + D.rootName;
    }
  }
  function showPanel() {
    var sl = sel && slugAt(sel);
    if (!sl) return hidePanel();
    var p = P[sl], n = byPath[sel], f = first(p[0]), acts = "";
    var where = p[7] ? " · born in " + p[7] : "";
    if (view === "tree" && n && n.hasPar) {
      acts += '<button type="button" class="btn" data-act="toggle">' + (n.kids.length ? "Hide " + esc(f) + "’s ancestors" : "Show " + esc(f) + "’s parents") + "</button>";
      if (anc(sl) > 2 && anc(sl) <= 120 && !n.kids.length) acts += '<button type="button" class="btn" data-act="all">Show all ' + anc(sl).toLocaleString() + " ancestors</button>";
    }
    if (sl !== root) acts += '<button type="button" class="btn" data-act="root">Start the ' + (view === "fan" ? "fan" : "tree") + " from " + esc(f) + "</button>";
    panel.innerHTML = '<button type="button" class="tp-close" data-act="close" aria-label="Close">×</button>' +
      '<p class="tp-kin">' + esc(kin(sel)) + "</p>" +
      '<h2 class="tp-name">' + esc(p[0]) + "</h2>" +
      '<p class="tp-life">' + esc(p[1]) + esc(where) + "</p>" +
      '<p class="tp-grade ' + cls(p[2]) + '"><i class="dot"></i>' + esc(p[2]) + "</p>" +
      '<div class="tp-acts"><a class="btn primary" href="' + base + "p/" + sl + '/">Open ' + esc(f) + "’s page</a>" + acts + "</div>";
    panel.hidden = false;
    stage.style.setProperty("--sheet", small ? panel.offsetHeight + "px" : "0px");
  }
  function hidePanel() {
    panel.hidden = true; panel.innerHTML = "";
    stage.style.setProperty("--sheet", "0px");
  }
  function select(path, pan) {
    if (!path) { sel = null; hidePanel(); paint(); apply(false); syncHash(); return; }
    sel = path;
    paint(); apply(false);
    showPanel();
    if (pan !== false && view === "tree") reveal(path, true);
    syncHash();
  }
  function syncHash() {
    var h = root !== D.root ? "#/~" + root : sel && sel !== "r" ? "#/" + slugAt(sel) : "";
    try { history.replaceState(null, "", h || location.pathname + location.search); } catch (e) {}
  }
  function defaultDepth() { return small ? 3 : 4; }
  function FLOOR() { return small ? 0.8 : 0.85; }   // the opening view never shrinks text below this
  function applyHash() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, "")), r = D.root, target = null;
    if (h.charAt(0) === "~" && P[h.slice(1)]) r = h.slice(1);
    else if (P[h] && h !== D.root) { target = findPath(D.root, h); if (!target) r = h; }
    if (r !== root) { root = r; big = false; setDepth(defaultDepth()); fanDepth = small ? 4 : 5; }
    sel = null;
    hidePanel();
    if (target) {
      view = "tree";
      for (var i = 1; i < target.length; i++) open[target.slice(0, i)] = true;
      sel = target;
      paint(); showPanel();
      var n = byPath[target], rg = region();
      T.k = Math.max(FLOOR(), Math.min(1, rg.w / W, rg.h / H));
      T.x = rg.l + rg.w / 2 - (n.x + CW / 2) * T.k;
      T.y = rg.t + rg.h / 2 - (n.y + CH / 2) * T.k;
      apply(false);
    } else {
      paint();
      home(false);
    }
  }

  // ------------------------------------------------------------------ input
  function wire() {
    var pts = {}, drag = null, pinch = null, moved = false;
    function ui(e) { return e.target.closest && e.target.closest(".tree-ui"); }
    function local(e) { var r = stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function used() {
      if (!hint || hint.hidden) return;
      hint.hidden = true;
      try { localStorage.setItem("treeHint", "1"); } catch (e) {}
    }
    try { if (localStorage.getItem("treeHint")) hint.hidden = true; } catch (e) {}

    stage.addEventListener("pointerdown", function (e) {
      if (ui(e) || (e.pointerType === "mouse" && e.button !== 0)) return;
      halt();
      var p = local(e);
      pts[e.pointerId] = p;
      var ids = Object.keys(pts);
      if (ids.length === 1) { drag = { x: p.x, y: p.y, tx: T.x, ty: T.y }; moved = false; }
      else if (ids.length === 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: T.k,
          wx: ((a.x + b.x) / 2 - T.x) / T.k, wy: ((a.y + b.y) / 2 - T.y) / T.k };
        moved = true;
      }
    });
    window.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      var p = local(e);
      pts[e.pointerId] = p;
      var ids = Object.keys(pts);
      if (pinch && ids.length >= 2) {
        var a = pts[ids[0]], b = pts[ids[1]];
        var k = Math.max(kMin, Math.min(kMax, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
        T.k = k; T.x = (a.x + b.x) / 2 - pinch.wx * k; T.y = (a.y + b.y) / 2 - pinch.wy * k;
        apply(false); used();
        return;
      }
      if (!drag) return;
      var dx = p.x - drag.x, dy = p.y - drag.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 6) { moved = true; stage.classList.add("panning"); used(); }
      if (moved) { T.x = drag.tx + dx; T.y = drag.ty + dy; apply(false); }
    });
    function up(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      var ids = Object.keys(pts);
      pinch = null;
      if (ids.length === 1) { var p = pts[ids[0]]; drag = { x: p.x, y: p.y, tx: T.x, ty: T.y }; }
      else if (!ids.length) { drag = null; stage.classList.remove("panning"); setTimeout(function () { moved = false; }, 0); }
    }
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    stage.addEventListener("click", function (e) {   // a drag is not a tap
      if (moved && !ui(e)) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    stage.addEventListener("wheel", function (e) {
      if (ui(e)) return;
      e.preventDefault();
      halt();
      var p = local(e), unit = e.deltaMode === 1 ? 30 : 1;
      zoomAt(p.x, p.y, T.k * Math.exp(-e.deltaY * unit * (e.ctrlKey ? 0.012 : 0.0018)), false);
      used();
    }, { passive: false });
    stage.addEventListener("dblclick", function (e) {
      if (ui(e) || e.target.closest(".tn-x")) return;
      var p = local(e);
      zoomAt(p.x, p.y, T.k * 1.7, true);
    });

    stage.addEventListener("click", function (e) {
      if (ui(e)) return;
      var x = e.target.closest(".tn-x"), node = e.target.closest("[data-path]");
      if (node && node.tagName.toLowerCase() === "a") e.preventDefault();
      used();
      if (x && node) return toggle(node.dataset.path);
      if (view === "tree" && stage.classList.contains("far")) {   // too far to read: go to that spot
        var p = local(e);
        halt();
        return zoomAt(p.x, p.y, dense ? (small ? 0.9 : 1) : FLOOR(), true);
      }
      if (node) return select(node.dataset.path);
      if (sel) select(null);
    });
    panel.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var a = b.dataset.act;
      if (a === "close") select(null);
      else if (a === "toggle") toggle(sel);
      else if (a === "root") location.hash = "#/~" + slugAt(sel);
      else if (a === "all") {
        openAll(sel);
        paint(); showPanel();
        var n = byPath[sel], y0 = Infinity, y1 = -Infinity, x0 = Infinity, x1 = -Infinity;
        nodes.forEach(function (m) {
          if (m.path.indexOf(sel) !== 0) return;
          y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y + CH); x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x + CW);
        });
        fitBox(x0, y0, x1 - x0, y1 - y0, true, 0.45, n);
      }
    });
    stage.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (view === b.dataset.view) return;
        view = b.dataset.view;
        if (view === "fan" && fanDepth > 8) fanDepth = small ? 4 : 5;
        if (view === "fan" && sel && sel.length - 1 > fanRings()) sel = null;
        if (view === "tree" && sel) for (var i = 1; i < sel.length; i++) open[sel.slice(0, i)] = true;
        paint();
        if (sel) showPanel(); else hidePanel();
        home(false);
      });
    });
    stage.querySelectorAll("[data-depth]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.depth;
        halt();
        // Changing the number of generations never moves the camera: the person nearest the
        // middle of the screen (or the one selected) stays exactly where they are.
        var keep = null, zoomed = false, mx = 0, my = 0;
        if (view === "fan") {
          var rg = region();
          zoomed = T.k > Math.min(1, rg.w / W, rg.h / H) * 1.05;     // looking at one part of the fan
          mx = T.x + W / 2 * T.k; my = T.y + W / 2 * T.k;            // where the middle of the fan is
          fanDepth = a === "all" ? 99 : a === "+" ? fanRings() + 1 : fanRings() - 1;
        } else {
          var to = Math.min(deep(root), a === "all" ? 99 : a === "+" ? maxG + 2 : Math.max(maxG, 2));
          keep = anchor(to);
          big = to > TREE_CAP;
          setDepth(to);
        }
        if (sel && view === "fan" && sel.length > fanRings() + 1) sel = null;
        paint();
        if (sel && view === "tree" && !byPath[sel]) { sel = null; paint(); }
        if (sel) showPanel(); else hidePanel();
        syncHash();
        var n = keep && byPath[keep.path];
        if (n) { T.x = keep.x - (n.x + CW / 2) * T.k; T.y = keep.y - (n.y + CH / 2) * T.k; apply(false); }
        else if (view === "fan" && zoomed) { T.x = mx - W / 2 * T.k; T.y = my - W / 2 * T.k; apply(false); }
        else home(true);
      });
    });
    stage.querySelectorAll("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () {
        var a = b.dataset.zoom, r = region();
        if (a === "fit") fitAll(true);
        else zoomAt(r.l + r.w / 2, r.t + r.h / 2, T.k * (a === "in" ? 1.5 : 1 / 1.5), true);
      });
    });
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("keydown", function (e) { if (e.key === "Escape" && sel) select(null); });
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var was = small;
        metrics();
        paint();
        if (sel) showPanel();
        if (was !== small) home(false); else apply(false);
      }, 150);
    });
  }
})();
