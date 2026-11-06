/* hb-art.js: riso-print cover art (window.HB.art). Every song and every genre gets a poster-like cover: paper stock,
   two or three fluorescent inks laid over each other (multiply, like a Risograph), halftone dots, a slight
   misregistration, and the title set big. Same seed, same cover. Also the landing page's rolling cover stack. */
(function (root) {
  'use strict';
  var HB = root.HB = root.HB || {};
  var INK = { pink: '#ff3e7f', blue: '#2449f5', sun: '#ffc21a', green: '#00a95c', orange: '#ff6c2f', ink: '#111111' };
  var PAPER = ['#ffffff', '#ffe3ec', '#e3e9ff', '#fff1b8', '#ddf5e8', '#ffe8d9'];
  var MOTIF = { hopecore: 'sun', mumble: 'rings', metal: 'shards', pop80: 'grid', teenpop: 'stars', storypop: 'arch', lofi: 'tape', house: 'waves',
    synthwave: 'grid', reggaeton: 'blob', poppunk: 'checker', drill: 'bolt', afrobeats: 'blob', ballad: 'moon', futurebass: 'waves', hyperpop: 'stars',
    disco: 'ball', boombap: 'tape' };
  var n = 0;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function wrap(title, max) {
    var words = String(title || '').toUpperCase().split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      while (w.length > max) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, max - 1) + '-'); w = w.slice(max - 1); }
      if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].slice(0, max - 1) + '…'; }
    return lines;
  }

  function motif(kind, r, A, B, C, dots) {
    var s = '', i, x, y;
    var off = 'transform="translate(' + (2 + Math.floor(r() * 3)) + ',' + (-1 - Math.floor(r() * 3)) + ')"';  // misregistration
    if (kind === 'sun') {
      var cy = 120 + r() * 30, rad = 74 + r() * 26;
      s += '<circle cx="150" cy="' + cy + '" r="' + rad + '" fill="' + C + '"/>';
      for (i = 0; i < 14; i++) { var a = i / 14 * Math.PI * 2 + r() * 0.1; s += '<line x1="150" y1="' + cy + '" x2="' + (150 + Math.cos(a) * 220) + '" y2="' + (cy + Math.sin(a) * 220) + '" stroke="url(#' + dots + 'a)" stroke-width="16"/>'; }
      s += '<g ' + off + '><rect x="0" y="' + (cy + rad * 0.55) + '" width="300" height="200" fill="' + B + '"/></g>';
      s += '<path d="M0 ' + (cy + rad * 0.55 + 18) + ' q75 -22 150 0 t150 0 V300 H0z" fill="url(#' + dots + 'b)"/>';
    } else if (kind === 'rings') {
      for (i = 6; i > 0; i--) s += '<circle cx="' + (140 + r() * 20) + '" cy="135" r="' + i * 22 + '" fill="none" stroke="' + (i % 2 ? B : 'url(#' + dots + 'a)') + '" stroke-width="13"/>';
      s += '<g ' + off + '><circle cx="190" cy="100" r="46" fill="' + A + '"/></g>';
    } else if (kind === 'shards') {
      for (i = 0; i < 7; i++) {
        x = r() * 300; y = r() * 220;
        s += '<polygon points="' + x + ',' + y + ' ' + (x + 40 + r() * 120) + ',' + (y + 20 + r() * 90) + ' ' + (x - 30 + r() * 60) + ',' + (y + 120 + r() * 80) + '" fill="' + (i % 2 ? B : 'url(#' + dots + 'a)') + '"/>';
      }
      s += '<g ' + off + '><polygon points="0,230 60,140 110,200 170,90 230,190 300,120 300,300 0,300" fill="' + A + '"/></g>';
    } else if (kind === 'grid') {
      s += '<g ' + off + '><circle cx="150" cy="150" r="88" fill="' + A + '"/></g>';
      for (i = 0; i < 6; i++) s += '<rect x="50" y="' + (112 + i * 12) + '" width="200" height="' + (3 + i) + '" fill="' + PAPER[0] + '"/>';
      s += '<rect x="0" y="170" width="300" height="130" fill="' + B + '"/>';
      for (i = -8; i <= 8; i++) s += '<line x1="150" y1="170" x2="' + (150 + i * 46) + '" y2="300" stroke="url(#' + dots + 'b)" stroke-width="3"/>';
      for (i = 0; i < 6; i++) { y = 170 + Math.pow(i / 6, 1.8) * 130; s += '<line x1="0" y1="' + y + '" x2="300" y2="' + y + '" stroke="' + C + '" stroke-width="2"/>'; }
    } else if (kind === 'stars') {
      for (i = 0; i < 6; i++) {
        x = 30 + r() * 240; y = 30 + r() * 180; var sz = 18 + r() * 40, pts = [];
        for (var k = 0; k < 10; k++) { var ang = k / 10 * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? sz * 0.42 : sz; pts.push((x + Math.cos(ang) * rr).toFixed(1) + ',' + (y + Math.sin(ang) * rr).toFixed(1)); }
        s += '<polygon points="' + pts.join(' ') + '" fill="' + (i % 3 === 0 ? B : i % 3 === 1 ? A : 'url(#' + dots + 'a)') + '"/>';
      }
      s += '<g ' + off + '><path d="M150 40 L162 128 L250 140 L162 152 L150 240 L138 152 L50 140 L138 128Z" fill="' + C + '"/></g>';
    } else if (kind === 'arch') {
      [A, C, B, 'url(#' + dots + 'a)'].forEach(function (col, j) { s += '<path d="M' + (30 + j * 26) + ' 240 A' + (120 - j * 26) + ' ' + (120 - j * 26) + ' 0 0 1 ' + (270 - j * 26) + ' 240" fill="none" stroke="' + col + '" stroke-width="24"/>'; });
      s += '<g ' + off + '><rect x="0" y="236" width="300" height="70" fill="' + B + '"/></g>';
    } else if (kind === 'tape') {
      s += '<g ' + off + '><rect x="40" y="70" width="220" height="140" rx="14" fill="' + B + '"/></g>';
      s += '<rect x="64" y="92" width="172" height="62" rx="8" fill="url(#' + dots + 'a)"/>';
      s += '<circle cx="110" cy="123" r="22" fill="' + C + '"/><circle cx="190" cy="123" r="22" fill="' + C + '"/>';
      s += '<circle cx="110" cy="123" r="8" fill="' + B + '"/><circle cx="190" cy="123" r="8" fill="' + B + '"/>';
      s += '<path d="M80 210 L100 180 H200 L220 210Z" fill="' + A + '"/>';
    } else if (kind === 'waves') {
      for (i = 0; i < 7; i++) { y = 40 + i * 30; s += '<path d="M-10 ' + y + ' q40 -' + (18 + r() * 12) + ' 80 0 t80 0 t80 0 t80 0 V' + (y + 22) + ' q-40 18 -80 0 t-80 0 t-80 0 t-80 0Z" fill="' + (i % 3 === 0 ? B : i % 3 === 1 ? 'url(#' + dots + 'a)' : A) + '"/>'; }
    } else if (kind === 'blob') {
      var pts2 = [], cx = 150, cy2 = 130;
      for (i = 0; i < 9; i++) { var a2 = i / 9 * Math.PI * 2, rr2 = 80 + r() * 40; pts2.push([cx + Math.cos(a2) * rr2, cy2 + Math.sin(a2) * rr2]); }
      var d = 'M' + pts2[0][0] + ' ' + pts2[0][1];
      for (i = 0; i < 9; i++) { var p1 = pts2[(i + 1) % 9], p0 = pts2[i]; d += ' Q' + p0[0] + ' ' + p0[1] + ' ' + ((p0[0] + p1[0]) / 2) + ' ' + ((p0[1] + p1[1]) / 2); }
      s += '<path d="' + d + 'Z" fill="url(#' + dots + 'a)"/>';
      s += '<g ' + off + '><circle cx="' + (110 + r() * 80) + '" cy="' + (100 + r() * 60) + '" r="60" fill="' + B + '"/></g>';
      s += '<circle cx="' + (60 + r() * 180) + '" cy="200" r="30" fill="' + C + '"/>';
    } else if (kind === 'checker') {
      for (y = 0; y < 6; y++) for (x = 0; x < 6; x++) if ((x + y) % 2 === 0) s += '<rect x="' + x * 50 + '" y="' + y * 50 + '" width="50" height="50" fill="' + B + '" opacity=".9"/>';
      s += '<g ' + off + '><circle cx="150" cy="130" r="80" fill="' + A + '"/></g>';
      s += '<path d="M90 120 h120 v24 h-120z" fill="url(#' + dots + 'b)"/>';
    } else if (kind === 'bolt') {
      s += '<rect x="0" y="0" width="300" height="300" fill="url(#' + dots + 'b)"/>';
      s += '<g ' + off + '><polygon points="170,20 80,160 140,160 110,280 220,120 155,120" fill="' + A + '"/></g>';
      s += '<polygon points="175,30 95,150 150,150 125,250 205,130 150,130" fill="' + B + '" opacity=".85"/>';
    } else if (kind === 'moon') {
      s += '<circle cx="150" cy="130" r="90" fill="' + C + '"/>';
      s += '<g ' + off + '><circle cx="190" cy="110" r="78" fill="' + B + '"/></g>';
      for (i = 0; i < 18; i++) s += '<circle cx="' + r() * 300 + '" cy="' + r() * 220 + '" r="' + (1.5 + r() * 2.5) + '" fill="' + A + '"/>';
    } else if (kind === 'ball') {
      s += '<circle cx="150" cy="130" r="96" fill="url(#' + dots + 'b)"/>';
      for (i = -4; i <= 4; i++) s += '<ellipse cx="150" cy="130" rx="' + Math.abs(96 * Math.cos(i / 9 * Math.PI)) + '" ry="96" fill="none" stroke="' + PAPER[0] + '" stroke-width="2"/>';
      for (i = -4; i <= 4; i++) s += '<line x1="54" y1="' + (130 + i * 21) + '" x2="246" y2="' + (130 + i * 21) + '" stroke="' + PAPER[0] + '" stroke-width="2"/>';
      s += '<g ' + off + '><circle cx="110" cy="96" r="26" fill="' + A + '"/></g>';
    }
    return s;
  }

  // cover({genre, seed, title, label}) -> SVG text (300 x 300, scales to any size)
  function cover(o) {
    o = o || {};
    var seed = o.seed || hash((o.title || '') + (o.genre || '')), r = HB.rng(seed), id = 'hbc' + (++n) + '-';
    var paper = PAPER[seed % PAPER.length];
    var pal = [[INK.pink, INK.blue, INK.sun], [INK.blue, INK.pink, INK.sun], [INK.pink, INK.blue, INK.green], [INK.orange, INK.blue, INK.sun], [INK.pink, INK.green, INK.sun]][Math.floor(r() * 5)];
    var A = pal[0], B = pal[1], C = pal[2];
    var lines = wrap(o.title || 'Untitled', 12), maxLen = Math.max.apply(null, lines.map(function (l) { return l.length; }).concat([4]));
    var size = Math.max(20, Math.min(56, 274 / (maxLen * 0.66)));  // heavy capitals are about 0.66 em wide
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="' + esc((o.title || 'Untitled') + ' cover') + '">' +
      '<defs><pattern id="' + id + 'a" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(' + (15 + Math.floor(r() * 30)) + ')"><circle cx="3.5" cy="3.5" r="2.3" fill="' + A + '"/></pattern>' +
      '<pattern id="' + id + 'b" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="3" cy="3" r="1.8" fill="' + B + '"/></pattern>' +
      '<clipPath id="' + id + 'c"><rect width="300" height="300"/></clipPath></defs>' +
      '<rect width="300" height="300" fill="' + paper + '"/>' +
      '<g clip-path="url(#' + id + 'c)" style="mix-blend-mode:multiply">' + motif(MOTIF[o.genre] || 'blob', r, A, B, C, id) + '</g>' +
      '<g font-family="Darker Grotesque, Instrument Sans, sans-serif" font-weight="900" fill="' + INK.ink + '">';
    var y0 = 300 - 16 - (lines.length - 1) * size * 0.86;
    var plate = lines.length * size * 0.86 + 14;
    svg += '<rect x="0" y="' + (300 - plate - 10) + '" width="' + Math.min(300, maxLen * size * 0.66 + 26) + '" height="' + (plate + 10) + '" fill="' + paper + '"/>';
    lines.forEach(function (l, i) { svg += '<text x="12" y="' + (y0 + i * size * 0.86) + '" font-size="' + size.toFixed(1) + '" letter-spacing="-0.5"' + (l.length * size * 0.66 > 278 ? ' textLength="276" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(l) + '</text>'; });
    if (o.label) svg += '<rect x="10" y="10" width="' + (String(o.label).length * 7.4 + 16) + '" height="24" fill="' + paper + '"/><text x="18" y="27" font-size="15" font-weight="800" font-family="Instrument Sans, sans-serif">' + esc(o.label) + '</text>';
    svg += '</g></svg>';
    return svg;
  }

  // ------------------------------------------------------------------ the landing hero: a stack of covers that rolls
  function Roller(host, items, opts) {
    var ro = this; ro.host = host; ro.items = items; ro.i = 0; ro.opts = opts || {}; ro.cards = [];
    host.innerHTML = '';
    host.classList.add('rl-stack');
    items.forEach(function (it, k) {
      var c = document.createElement('div');
      c.className = 'rl-card'; c.style.setProperty('--k', k);
      c.innerHTML = cover({ genre: it.id, seed: hash(it.id) % 9973 + 11, title: it.name, label: it.bpm + ' BPM' });
      var bars = document.createElement('canvas'); bars.className = 'rl-bars'; bars.setAttribute('aria-hidden', 'true'); c.appendChild(bars);
      host.appendChild(c); ro.cards.push(c);
    });
    ro.layout();
    host.classList.add('rl-in');  // the one authored entrance (CSS), content already visible without it
    ro._raf = root.requestAnimationFrame(function frame() { ro._raf = root.requestAnimationFrame(frame); ro.drawBars(); });
    ro.auto();
  }
  Roller.prototype.layout = function () {
    var ro = this, N = ro.cards.length;
    ro.cards.forEach(function (c, k) {
      var d = (k - ro.i + N) % N;
      c.style.setProperty('--d', d > 4 ? 4 : d);
      c.classList.toggle('on', d === 0);
      c.setAttribute('aria-hidden', d === 0 ? 'false' : 'true');
    });
    if (ro.opts.onChange) ro.opts.onChange(ro.items[ro.i]);
  };
  Roller.prototype.go = function (step) { var N = this.cards.length; this.i = (this.i + step + N) % N; this.layout(); if (HB.previewing()) HB.previewGenre(this.items[this.i].id, this.opts.onPlay); };
  Roller.prototype.current = function () { return this.items[this.i]; };
  Roller.prototype.auto = function () {
    var ro = this; clearInterval(ro._t);
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ro._t = setInterval(function () { if (!HB.previewing() && !ro.host.matches(':hover') && !reduce && !document.hidden) ro.go(1); }, 4200);
  };
  Roller.prototype.play = function () { return HB.previewGenre(this.items[this.i].id, this.opts.onPlay); };
  Roller.prototype.drawBars = function () {
    var c = this.cards[this.i]; if (!c) return;
    var cv = c.querySelector('.rl-bars'), playing = HB.previewing() === this.items[this.i].id;
    c.classList.toggle('playing', playing);
    if (!playing) return;
    var w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    var r = root.devicePixelRatio || 1; if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
    var x = cv.getContext('2d'); x.setTransform(r, 0, 0, r, 0, 0); x.clearRect(0, 0, w, h);
    var sp = HB.audio.spectrum(20) || []; x.fillStyle = '#111111';
    var bw = w / sp.length; sp.forEach(function (v, i) { var bh = Math.max(2, v * h); x.fillRect(i * bw + 2, h - bh, bw - 4, bh); });
  };
  Roller.prototype.destroy = function () { clearInterval(this._t); root.cancelAnimationFrame(this._raf); HB.stopPreview(); };

  HB.art = { cover: cover, wrap: wrap, Roller: Roller, MOTIF: MOTIF, hash: hash };
})(window);
