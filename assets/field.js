// The page's background: a network on one fixed canvas behind the page. With reduced motion it
// draws one still frame.
(function () {
  var canvas = document.getElementById('field');
  var ctx = canvas.getContext('2d');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var RED = [255, 42, 58];
  var S = { w: 0, h: 0, dpr: 1, t: 0, px: -1e4, py: -1e4, sx: -1e4, sy: -1e4, moved: -1e4, ripples: [] };
  var t0 = performance.now();

  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, v) { return [0, 1, 2].map(function (q) { return Math.round(a[q] + (b[q] - a[q]) * v); }); }
  function light() { return document.documentElement.getAttribute('data-theme') === 'light'; }
  function ink() { return light() ? [40, 40, 48] : [200, 200, 210]; }
  // How present the pointer is: 1 while it moves, easing to 0 over two seconds of stillness.
  function presence() { return Math.max(0, 1 - (S.t - S.moved) / 2); }

  // A drifting fleet of nodes, linked when close, with traffic on the links.
  // Nodes sit at different depths: far ones are smaller, fainter and slower. Pulses of traffic
  // run along the links. The cursor is a node of its own, linking to everything near it and
  // drawing nodes in. A click adds a node there and broadcasts from it: the signal spreads hop
  // by hop through whatever links exist at that moment.
  var network = {
    LINK: 140,
    init: function () {
      this.n = []; this.pulses = []; this.nextPulse = 0;
      this.base = Math.min(150, Math.round(S.w * S.h / 11000));
      for (var i = 0; i < this.base; i++) this.add(Math.random() * S.w, Math.random() * S.h);
    },
    add: function (x, y) {
      var z = 0.35 + Math.random() * 0.65;
      var node = { x: x, y: y, z: z, vx: (Math.random() - 0.5) * 0.4 * z, vy: (Math.random() - 0.5) * 0.4 * z,
                   heat: 0, litAt: -1e4 };
      this.n.push(node);
      return node;
    },
    broadcast: function (x, y) {
      var n = this.n, src = this.add(x, y), t = S.t;
      src.z = 1; src.litAt = t;
      // Keep the fleet from growing without bound: a new node retires an old one.
      if (n.length > this.base + 24) n.splice(Math.floor(Math.random() * (n.length - 1)), 1);
      var nb = this.links(), start = n.indexOf(src), seen = {}, queue = [start];
      seen[start] = true;
      while (queue.length) {
        var i = queue.shift();
        for (var k = 0; k < nb[i].length; k++) {
          var j = nb[i][k];
          if (seen[j]) continue;
          seen[j] = true;
          n[j].litAt = n[i].litAt + 0.14;
          this.pulses.push({ a: n[i], b: n[j], f: 0, start: n[i].litAt, dur: 0.14, hot: 1, hops: 0 });
          queue.push(j);
        }
      }
    },
    links: function () {
      var n = this.n, nb = [], i, j;
      for (i = 0; i < n.length; i++) nb.push([]);
      for (i = 0; i < n.length; i++)
        for (j = i + 1; j < n.length; j++)
          if (Math.hypot(n[i].x - n[j].x, n[i].y - n[j].y) < this.LINK) { nb[i].push(j); nb[j].push(i); }
      return nb;
    },
    draw: function () {
      var k = ink(), pr = presence(), n = this.n, LINK = this.LINK, t = S.t, i, j;
      for (var r = 0; r < S.ripples.length; r++) {
        if (!S.ripples[r].seen) { S.ripples[r].seen = true; this.broadcast(S.ripples[r].x, S.ripples[r].y); }
      }
      ctx.clearRect(0, 0, S.w, S.h);
      for (i = 0; i < n.length; i++) {
        var a = n[i], dx = S.sx - a.x, dy = S.sy - a.y, d = Math.hypot(dx, dy);
        if (pr > 0 && d < 220 && d > 40) { a.vx += dx / d * 0.014 * pr * a.z; a.vy += dy / d * 0.014 * pr * a.z; }
        a.vx *= 0.985; a.vy *= 0.985;
        // A floor on speed, so the fleet never settles completely.
        var sp = Math.hypot(a.vx, a.vy), min = 0.12 * a.z;
        if (sp < min) { a.vx *= min / (sp || 1); a.vy *= min / (sp || 1); }
        a.x += a.vx; a.y += a.vy;
        if (a.x < 0 || a.x > S.w) { a.vx = -a.vx; a.x = Math.max(0, Math.min(S.w, a.x)); }
        if (a.y < 0 || a.y > S.h) { a.vy = -a.vy; a.y = Math.max(0, Math.min(S.h, a.y)); }
        var near = pr > 0 && d < 200 ? Math.pow(1 - d / 200, 1.5) * pr : 0;
        var lit = t >= a.litAt ? Math.max(0, 1 - (t - a.litAt) / 1.2) : 0;
        a.heat = Math.max(near, lit);
      }
      var nb = this.links();
      // Links.
      ctx.lineWidth = 1;
      for (i = 0; i < n.length; i++) {
        for (var q = 0; q < nb[i].length; q++) {
          j = nb[i][q];
          if (j < i) continue;
          var b = n[j], ld = Math.hypot(n[i].x - b.x, n[i].y - b.y);
          var heat = Math.max(n[i].heat, b.heat), al = (1 - ld / LINK) * Math.min(n[i].z, b.z);
          ctx.strokeStyle = rgba(mix(k, RED, heat), al * (0.16 + 0.6 * heat));
          ctx.beginPath(); ctx.moveTo(n[i].x, n[i].y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      // The cursor as a node: links to everything near it.
      if (pr > 0) {
        for (i = 0; i < n.length; i++) {
          var cd = Math.hypot(n[i].x - S.sx, n[i].y - S.sy);
          if (cd < 180) {
            ctx.strokeStyle = rgba(RED, (1 - cd / 180) * 0.55 * pr * n[i].z);
            ctx.beginPath(); ctx.moveTo(S.sx, S.sy); ctx.lineTo(n[i].x, n[i].y); ctx.stroke();
          }
        }
        ctx.fillStyle = rgba(RED, 0.8 * pr);
        ctx.beginPath(); ctx.arc(S.sx, S.sy, 2.6, 0, 6.2832); ctx.fill();
      }
      // Ambient traffic: now and then a pulse sets off along a random link, and may hop onward.
      if (t > this.nextPulse) {
        this.nextPulse = t + 0.35 + Math.random() * 0.5;
        i = Math.floor(Math.random() * n.length);
        if (nb[i] && nb[i].length) {
          j = nb[i][Math.floor(Math.random() * nb[i].length)];
          this.pulses.push({ a: n[i], b: n[j], start: t, dur: 0.6 + Math.random() * 0.6, hot: 0, hops: 3 });
        }
      }
      for (i = this.pulses.length - 1; i >= 0; i--) {
        var p = this.pulses[i];
        if (t < p.start) continue;
        var f = (t - p.start) / p.dur;
        if (f >= 1 || Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y) > LINK * 1.3) {
          this.pulses.splice(i, 1);
          if (f >= 1 && p.hops > 0) {
            var bi = n.indexOf(p.b);
            if (bi >= 0 && nb[bi] && nb[bi].length) {
              var nj = nb[bi][Math.floor(Math.random() * nb[bi].length)];
              if (n[nj] !== p.a) this.pulses.push({ a: p.b, b: n[nj], start: t, dur: p.dur, hot: 0, hops: p.hops - 1 });
            }
          }
          continue;
        }
        var px = p.a.x + (p.b.x - p.a.x) * f, py = p.a.y + (p.b.y - p.a.y) * f;
        var tl = p.hot ? 0.25 : 0.12, tx = p.a.x + (p.b.x - p.a.x) * Math.max(0, f - tl), ty = p.a.y + (p.b.y - p.a.y) * Math.max(0, f - tl);
        ctx.strokeStyle = rgba(p.hot ? RED : k, p.hot ? 0.85 : 0.22);
        ctx.lineWidth = p.hot ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(px, py); ctx.stroke();
      }
      ctx.lineWidth = 1;
      // Nodes, with a halo while lit.
      for (i = 0; i < n.length; i++) {
        var nd = n[i], rad = (1.1 + 1.4 * nd.z) * (1 + 0.9 * nd.heat);
        if (nd.heat > 0.05) {
          ctx.fillStyle = rgba(RED, 0.18 * nd.heat);
          ctx.beginPath(); ctx.arc(nd.x, nd.y, rad * 3.2, 0, 6.2832); ctx.fill();
        }
        ctx.fillStyle = rgba(mix(k, RED, nd.heat), (0.15 + 0.3 * nd.z) + 0.5 * nd.heat);
        ctx.beginPath(); ctx.arc(nd.x, nd.y, rad, 0, 6.2832); ctx.fill();
      }
    }
  };

  function size() {
    S.dpr = Math.min(window.devicePixelRatio || 1, 2);
    S.w = window.innerWidth; S.h = window.innerHeight;
    canvas.width = S.w * S.dpr; canvas.height = S.h * S.dpr;
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  }
  function frame(now) {
    S.t = (now - t0) / 1000;
    S.sx += (S.px - S.sx) * 0.12; S.sy += (S.py - S.sy) * 0.12;
    S.ripples = S.ripples.filter(function (r) { return S.t - r.t < 4; });
    network.draw();
    if (!still) requestAnimationFrame(frame);
  }

  // The canvas is fixed to the viewport, so a pointer's client position is its position on it.
  document.addEventListener('pointermove', function (e) {
    if (S.px < -1e3) { S.sx = e.clientX; S.sy = e.clientY; }
    S.px = e.clientX; S.py = e.clientY; S.moved = (performance.now() - t0) / 1000;
  });
  document.addEventListener('pointerdown', function (e) {
    if (e.target.closest('a, button, select, input')) return;
    S.ripples.push({ x: e.clientX, y: e.clientY, t: (performance.now() - t0) / 1000 });
  });
  window.addEventListener('resize', function () { size(); network.init(); if (still) frame(performance.now()); });

  size();
  network.init();
  frame(performance.now());
})();
