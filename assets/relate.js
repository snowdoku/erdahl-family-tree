/* How are two people related: nearest shared ancestor, named; else the chain of family
   links (marriage, in-laws). Uses the same words as the person pages. */
(function () {
  "use strict";
  var base = "../";
  var D, P, IDX, pick = { a: null, b: null };
  var out = document.getElementById("relate-out");
  Promise.all([
    fetch(base + "data/graph.json").then(function (r) { return r.json(); }),
    fetch(base + "search/index.json").then(function (r) { return r.json(); })
  ]).then(function (res) {
    D = res[0]; P = D.people; IDX = res[1];
    var h = location.hash.slice(1).split("/");
    pick.a = P[h[0]] ? h[0] : D.root;
    pick.b = P[h[1]] ? h[1] : null;
    setup("a", "ra"); setup("b", "rb");
    show();
  });

  function esc(s) { return window.FT.esc(s); }
  function setup(key, id) {
    var inp = document.getElementById(id), list = document.getElementById(id + "-list");
    if (pick[key]) inp.value = P[pick[key]][0];
    inp.addEventListener("focus", function () { inp.select(); });
    inp.addEventListener("input", function () {
      var q = window.FT.fold(inp.value).split(" ").filter(Boolean);
      if (!q.length) { list.innerHTML = ""; return; }
      var hits = IDX.filter(function (r) {
        var w = r[3].split(" ");
        return q.every(function (t) { return w.some(function (x) { return x.indexOf(t) === 0; }); });
      }).slice(0, 12);
      list.innerHTML = hits.map(function (r) {
        return '<li><a href="#" data-slug="' + r[0] + '"><span class="r-name">' + esc(r[1]) + '</span><span class="r-meta">' +
          esc([r[2], r[4] ? "child of " + r[4] : ""].filter(Boolean).join(" · ")) + "</span></a></li>";
      }).join("");
    });
    list.addEventListener("click", function (e) {
      var a = e.target.closest("a[data-slug]");
      if (!a) return;
      e.preventDefault();
      pick[key] = a.dataset.slug; inp.value = P[pick[key]][0]; list.innerHTML = "";
      history.replaceState(null, "", "#" + pick.a + (pick.b ? "/" + pick.b : ""));
      show();
    });
  }

  function anc(x) {
    var d = {}; d[x] = 0; var q = [x];
    while (q.length) {
      var y = q.shift(), p = P[y];
      [p[4], p[5]].forEach(function (z) { if (z && P[z] && !(z in d)) { d[z] = d[y] + 1; q.push(z); } });
    }
    return d;
  }
  var ORD = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
    "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth"];
  var TIMES = ["", "once", "twice", "three times", "four times", "five times", "six times", "seven times",
    "eight times", "nine times", "ten times"];
  function w(sex, m, f, n) { return sex === "M" ? m : sex === "F" ? f : n; }
  function greats(k) {
    if (k <= 0) return ""; if (k <= 2) return k === 1 ? "great-" : "great-great-";
    var suf = { 1: "st", 2: "nd", 3: "rd" }[k < 20 ? k : k % 10] || "th";
    return k + suf + " great-";
  }
  // Mirrors sitegen/graph.py blood_words.
  function words(up, down, sex) {
    if (down === 0) return up === 1 ? w(sex, "father", "mother", "parent") : greats(up - 2) + w(sex, "grandfather", "grandmother", "grandparent");
    if (up === 0) return down === 1 ? w(sex, "son", "daughter", "child") : greats(down - 2) + w(sex, "grandson", "granddaughter", "grandchild");
    if (up === 1 && down === 1) return w(sex, "brother", "sister", "sibling");
    if (down === 1) return greats(up - 2) + w(sex, "uncle", "aunt", "uncle or aunt");
    if (up === 1) return greats(down - 2) + w(sex, "nephew", "niece", "nephew or niece");
    var deg = Math.min(up, down) - 1, rem = Math.abs(up - down);
    return (ORD[deg] || deg + "th") + " cousin" + (rem ? " " + (TIMES[rem] || rem + " times") + " removed" : "");
  }
  function chainUp(from, to, depths) {
    // walk from `from` up to ancestor `to` along a shortest parent path
    var path = [from], cur = from;
    while (cur !== to) {
      var p = P[cur], next = [p[4], p[5]].filter(function (z) { return z && z in depths && depths[z] === depths[cur] - 1; })[0];
      if (!next) break;
      path.push(next); cur = next;
    }
    return path;
  }
  function card(sl) {
    var p = P[sl];
    return '<a class="card" href="' + base + "p/" + sl + '/"><span class="card-name">' + esc(p[0]) +
      '</span><span class="card-life">' + esc(p[1]) + "</span></a>";
  }
  function bfs(a, b) {
    var prev = {}; prev[a] = null; var q = [a];
    while (q.length) {
      var x = q.shift(), p = P[x], nb = [];
      [p[4], p[5]].forEach(function (z) { if (z) nb.push([z, "parent"]); });
      (p[6] || []).forEach(function (z) { nb.push([z, "spouse"]); });
      for (var k in P) if (P[k][4] === x || P[k][5] === x) nb.push([k, "child"]);
      for (var i = 0; i < nb.length; i++) {
        var y = nb[i][0];
        if (!P[y] || y in prev) continue;
        prev[y] = [x, nb[i][1]];
        if (y === b) { var path = [], c = b; while (c !== a) { path.unshift([c, prev[c][1]]); c = prev[c][0]; } return path; }
        q.push(y);
      }
    }
    return null;
  }

  function blood(x, y) {
    var dx = anc(x), dy = anc(y), best = null;
    for (var z in dx) if (z in dy) { var s = dx[z] + dy[z]; if (!best || s < best[0]) best = [s, dx[z], dy[z]]; }
    return best ? words(best[1], best[2], P[y][3]) : null;
  }
  // Mirrors sitegen/graph.py kinship(): married to a blood relative, or a spouse's relative.
  function inlaw(a, b) {
    var A = P[a], B = P[b], sp = B[6] || [], i, r;
    var word = B[3] === "M" ? "husband" : B[3] === "F" ? "wife" : "spouse";
    for (i = 0; i < sp.length; i++) {
      if (sp[i] === a) return "<strong>" + esc(B[0]) + "</strong> is " + esc(A[0]) + "’s " + word + ".";
      r = blood(a, sp[i]);
      if (r) return "<strong>" + esc(B[0]) + "</strong> is the " + word + " of " + esc(A[0]) + "’s <strong>" + esc(r) + "</strong> (" + esc(P[sp[i]][0]) + "). Not related by blood.";
    }
    var asp = A[6] || [];
    for (i = 0; i < asp.length; i++) {
      r = blood(asp[i], b);
      if (r) return "<strong>" + esc(B[0]) + "</strong> is the <strong>" + esc(r) + "</strong> of " + esc(A[0]) + "’s " +
        (P[asp[i]][3] === "F" ? "wife" : P[asp[i]][3] === "M" ? "husband" : "spouse") + " " + esc(P[asp[i]][0]) + ". Not related by blood.";
    }
    return "";
  }

  function show() {
    if (!pick.a || !pick.b) { out.innerHTML = ""; return; }
    var a = pick.a, b = pick.b, A = P[a], B = P[b];
    if (a === b) { out.innerHTML = "<p>That is the same person twice.</p>"; return; }
    var da = anc(a), db = anc(b), best = null;
    for (var x in da) if (x in db) {
      var s = da[x] + db[x];
      if (!best || s < best[0]) best = [s, x];
    }
    var html = "";
    if (best) {
      var ca = best[1], up = da[ca], down = db[ca];
      html += '<p class="verdict-line"><strong>' + esc(B[0]) + "</strong> is " + esc(A[0]) + "’s <strong>" +
        esc(words(up, down, B[3])) + "</strong>.</p>";
      var left = chainUp(a, ca, da), right = chainUp(b, ca, db).reverse();
      html += '<p class="fine">The shared ancestor is ' + esc(P[ca][0]) + ". " + esc(A[0]) + " is " + up +
        " generation" + (up === 1 ? "" : "s") + " below, " + esc(B[0]) + " " + down + ".</p>";
      html += '<ol class="chain">' + left.map(function (s) { return "<li>" + card(s) + "</li>"; }).join("") +
        right.slice(1).map(function (s) { return "<li>" + card(s) + "</li>"; }).join("") + "</ol>";
    } else if (inlaw(a, b)) {
      html += '<p class="verdict-line">' + inlaw(a, b) + "</p>";
      var p2 = bfs(a, b);
      if (p2) html += '<ol class="chain"><li>' + card(a) + "</li>" + p2.map(function (s) {
        return '<li><span class="fine">' + { parent: "whose parent is", child: "whose child is", spouse: "who married" }[s[1]] + "</span>" + card(s[0]) + "</li>";
      }).join("") + "</ol>";
    } else {
      var path = bfs(a, b);
      if (!path) { out.innerHTML = "<p>No chain of family links connects these two people in the tree.</p>"; return; }
      var step = { parent: "whose parent is", child: "whose child is", spouse: "who married" };
      html += '<p class="verdict-line">Not related by blood. They are connected by marriage:</p><ol class="chain">' +
        "<li>" + card(a) + "</li>" + path.map(function (s) {
          return '<li><span class="fine">' + step[s[1]] + "</span>" + card(s[0]) + "</li>";
        }).join("") + "</ol>";
    }
    out.innerHTML = html;
  }
})();
