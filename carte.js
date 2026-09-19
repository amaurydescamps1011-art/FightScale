/* Carte de France en semis de points, projetée en perspective, avec apparition progressive. */
(function () {
  var cv = document.getElementById('carte');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d');

  /* Contour simplifié de la France métropolitaine (lon, lat). */
  var FRANCE = [
    [2.37,51.03],[1.85,50.95],[1.37,50.06],[0.11,49.49],[-1.62,49.64],[-1.60,48.84],
    [-2.02,48.65],[-3.10,48.87],[-4.49,48.39],[-4.74,48.04],[-3.37,47.75],[-2.20,47.27],
    [-1.78,46.50],[-1.15,46.16],[-1.03,45.62],[-1.17,44.66],[-1.35,43.95],[-1.56,43.48],
    [-1.24,43.16],[-0.30,42.95],[0.60,42.80],[1.52,42.50],[2.10,42.35],[3.03,42.43],
    [3.15,43.17],[3.88,43.60],[4.85,43.42],[5.37,43.30],[5.93,43.12],[6.64,43.16],
    [7.27,43.70],[7.05,44.20],[6.63,44.90],[7.00,45.30],[6.87,45.83],[6.14,46.20],
    [6.05,46.60],[6.40,46.95],[7.05,47.35],[7.59,47.56],[7.75,48.58],[7.94,49.03],
    [6.75,49.16],[6.17,49.45],[5.77,49.55],[4.83,50.13],[4.20,49.95],[3.97,50.28],
    [3.06,50.63]
  ];
  var CORSE = [
    [9.35,43.01],[9.55,42.75],[9.53,42.25],[9.40,41.85],[9.28,41.40],[8.80,41.55],
    [8.60,41.95],[8.70,42.35],[9.00,42.70],[9.10,42.98]
  ];

  /* Villes où des clubs sont référencés (lon, lat, poids). */
  var VILLES = [
    [2.35,48.86,3],[4.84,45.76,3],[5.37,43.30,3],[1.44,43.60,2],[-0.58,44.84,2],
    [3.06,50.63,2],[-1.55,47.22,2],[7.27,43.70,2],[7.75,48.58,2],[-1.68,48.11,2],
    [3.88,43.61,2],[5.93,43.12,1],[5.72,45.19,1],[5.04,47.32,1],[-0.55,47.47,1],
    [4.36,43.84,1],[3.09,45.78,1],[0.11,49.49,1],[4.03,49.26,1],[4.39,45.44,1],
    [-4.49,48.39,1],[0.20,48.01,1],[2.30,49.89,1],[0.69,47.39,1],[1.26,45.83,1],
    [2.90,42.70,1],[6.17,49.12,1],[6.02,47.24,1],[-0.36,49.18,1],[1.90,47.90,1],
    [7.34,47.75,1],[1.09,49.44,1],[6.18,48.69,1],[4.81,43.95,1],[0.34,46.58,1],
    [-0.37,43.30,1],[-1.15,46.16,1],[-1.48,43.49,1],[6.13,45.90,1],[4.07,48.30,1],
    [5.05,43.53,1],[3.29,47.80,1],[-2.76,47.66,1],[2.44,48.53,1],[4.72,45.18,1],
    [8.74,41.93,1],[9.45,42.70,1],[5.61,44.56,1],[2.25,43.21,1],[-1.10,45.65,1]
  ];

  var LON0 = 2.4, LAT0 = 46.6, KX = Math.cos(LAT0 * Math.PI / 180);
  var TILT = 58 * Math.PI / 180, CAM = 2.5;

  function inside(pt, poly) {
    var x = pt[0], y = pt[1], ok = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ok = !ok;
    }
    return ok;
  }

  function brut(lon, lat) {
    var u = (lon - LON0) * KX / 6.2;
    var v = (LAT0 - lat) / 5.0;
    var y1 = v * Math.cos(TILT), z1 = v * Math.sin(TILT);
    var k = CAM / (CAM - z1);
    return { x: u * k, y: y1 * k, k: k };
  }

  var STEP = 0.235, pts = [];
  (function build() {
    var row = 0;
    for (var lat = 51.2; lat >= 41.3; lat -= STEP * 0.8, row++) {
      var off = (row % 2) ? STEP / 2 : 0;
      for (var lon = -5.2; lon <= 9.9; lon += STEP) {
        var p = [lon + off, lat];
        if (inside(p, FRANCE) || inside(p, CORSE)) pts.push([p[0], p[1], Math.random()]);
      }
    }
  })();

  var villePts = [], grillePts = [], W = 0, H = 0, dpr = 1;
  var T_POINTS = 1500, T_GRAIN = 520, T_VILLES = 700;
  /* l'onde repart en boucle : elle balaie la carte du centre vers les bords */
  var P_BOUCLE = 6400;

  function onde(t, d, grain) {
    var ph = t / P_BOUCLE - d * 0.62 + grain * 0.02;
    ph = ph - Math.floor(ph);
    var e = Math.min(ph, 1 - ph);
    return Math.exp(-(e * e) / 0.0055);
  }

  function layout() {
    var r = cv.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var xs = [], ys = [], i, q;
    for (i = 0; i < FRANCE.length; i++) {
      q = brut(FRANCE[i][0], FRANCE[i][1]); xs.push(q.x); ys.push(q.y);
    }
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var etroit = W < 760;
    var s = Math.min((W * (etroit ? 1.02 : 0.80)) / (x1 - x0), (H * 0.94) / (y1 - y0));
    var cx = W / 2 - ((x0 + x1) / 2) * s;
    var cy = H * 0.5 - ((y0 + y1) / 2) * s;
    var rayon = Math.max((x1 - x0), (y1 - y0)) * s * 0.62;

    function place(lon, lat) {
      var b = brut(lon, lat);
      var o = { x: cx + b.x * s, y: cy + b.y * s, k: b.k };
      o.d = Math.min(1, Math.hypot(o.x - W / 2, o.y - H / 2) / rayon);
      return o;
    }
    grillePts = pts.map(function (p) { var o = place(p[0], p[1]); o.al = p[2]; return o; });
    villePts = VILLES.map(function (v, i) {
      var o = place(v[0], v[1]); o.w = v[2]; o.i = i; return o;
    });
  }

  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var fige = t === null;

    for (var i = 0; i < grillePts.length; i++) {
      var p = grillePts[i];
      var av = 1;
      if (!fige) {
        var retard = p.d * T_POINTS + p.al * 320;
        av = easeOut(Math.min(1, Math.max(0, (t - retard) / T_GRAIN)));
        if (av <= 0) continue;
      }
      var o = fige ? 0 : onde(t, p.d, p.al);
      var scint = fige ? 0 : Math.sin(t / 2100 + p.al * 6.283);
      var prof = Math.min(1, Math.max(0, (p.k - 0.62) / 0.9));
      var r = (1.0 + 1.25 * prof) * Math.min(1.05, W / 900 + 0.4)
        * (0.6 + 0.4 * av) * (1 + 0.5 * o);
      var a = (0.26 + 0.42 * prof) * av * (fige ? 1 : 0.42 + 0.95 * o + 0.1 * scint);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, 6.2832);
      ctx.fillStyle = 'rgba(214,210,203,' + Math.max(0, a).toFixed(3) + ')';
      ctx.fill();
    }

    for (var j = 0; j < villePts.length; j++) {
      var c = villePts[j];
      var av2 = 1;
      if (!fige) {
        var r2t = T_POINTS * 0.55 + c.d * 900 + c.i * 12;
        av2 = easeOut(Math.min(1, Math.max(0, (t - r2t) / T_VILLES)));
        if (av2 <= 0) continue;
      }
      var puls = fige ? 0.5 : Math.min(1, 0.32 + 0.3 * Math.sin(t / 1400 + j * 1.7)
        + 0.85 * onde(t, c.d, c.i * 0.13));
      var rr = (1.15 + 0.6 * c.w) * Math.min(1.25, Math.max(0.7, c.k)) * (0.5 + 0.5 * av2);
      var halo = rr * (5.5 + 1.6 * puls);
      var g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, halo);
      g.addColorStop(0, 'rgba(250,1,23,' + ((0.38 + 0.16 * puls) * av2).toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(250,1,23,' + (0.11 * av2).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(250,1,23,0)');
      ctx.beginPath(); ctx.arc(c.x, c.y, halo, 0, 6.2832);
      ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(c.x, c.y, rr, 0, 6.2832);
      ctx.fillStyle = 'rgba(255,138,146,' + ((0.82 + 0.18 * puls) * av2).toFixed(3) + ')';
      ctx.fill();
    }
  }

  var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = null, t0 = 0;
  function boucle(t) {
    if (!t0) t0 = t;
    draw(t - t0);
    raf = requestAnimationFrame(boucle);
  }

  function demarrer(rejouer) {
    layout();
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (reduit) { draw(null); return; }
    if (rejouer) t0 = 0;
    raf = requestAnimationFrame(boucle);
  }

  demarrer(true);
  var tmo = null;
  window.addEventListener('resize', function () {
    clearTimeout(tmo); tmo = setTimeout(function () { demarrer(false); }, 180);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); });
})();
