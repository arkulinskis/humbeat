/* hb-music.js: music theory and the genre recipes (window.HB.theory, HB.GENRES, HB.Doc.fromRecipe).
   No audio here: notes, scales, chords, progressions, drum grooves, bass and chord styles, hooks, and the song
   document that the rest of Humbeat plays and edits. Pure functions, so tools/testing/engine_test.js runs it in Node. */
(function (root) {
  'use strict';
  var HB = root.HB = root.HB || {};

  // ------------------------------------------------------------------ small helpers
  function rng(seed) {  // mulberry32: the same seed always builds the same song
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function pick(r, list) { return list[Math.floor(r() * list.length) % list.length]; }
  var _id = 0;
  function uid(prefix) { _id += 1; return (prefix || 'x') + Date.now().toString(36).slice(-5) + _id.toString(36) + Math.floor(Math.random() * 1296).toString(36); }
  HB.rng = rng; HB.uid = uid; HB.pick = pick;
  HB.clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  // ------------------------------------------------------------------ theory
  var NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var SCALES = {
    major: { name: 'Major (bright)', steps: [0, 2, 4, 5, 7, 9, 11] },
    minor: { name: 'Minor (moody)', steps: [0, 2, 3, 5, 7, 8, 10] },
    dorian: { name: 'Dorian (cool minor)', steps: [0, 2, 3, 5, 7, 9, 10] },
    mixolydian: { name: 'Mixolydian (bluesy major)', steps: [0, 2, 4, 5, 7, 9, 10] },
    phrygian: { name: 'Phrygian (dark, metal)', steps: [0, 1, 3, 5, 7, 8, 10] },
    harmonic: { name: 'Harmonic minor (drama)', steps: [0, 2, 3, 5, 7, 8, 11] },
    lydian: { name: 'Lydian (dreamy)', steps: [0, 2, 4, 6, 7, 9, 11] },
    chromatic: { name: 'Chromatic (no snapping)', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
  };
  var T = HB.theory = {
    NOTE_NAMES: NOTE_NAMES,
    SCALES: SCALES,
    name: function (midi) { return NOTE_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1); },
    pcName: function (pc) { return NOTE_NAMES[((pc % 12) + 12) % 12]; },
    freq: function (midi) { return 440 * Math.pow(2, (midi - 69) / 12); },
    midiOf: function (hz) { return 69 + 12 * Math.log2(hz / 440); },
    steps: function (scale) { return (SCALES[scale] || SCALES.major).steps; },
    inScale: function (midi, key, scale) {
      var pc = (((midi - key) % 12) + 12) % 12;
      return T.steps(scale).indexOf(pc) >= 0;
    },
    snap: function (midi, key, scale) {  // nearest note of the scale (ties go down)
      var st = T.steps(scale), best = Math.round(midi), bd = 99;
      for (var o = -1; o <= 1; o++) {
        for (var i = 0; i < st.length; i++) {
          var base = Math.floor((midi - key) / 12) * 12 + key + o * 12 + st[i];
          var d = Math.abs(base - midi);
          if (d < bd - 1e-9) { bd = d; best = base; }
        }
      }
      return best;
    },
    degreeNote: function (key, scale, degree, octave) {  // degree 1..7 (8+ wraps up), octave 4 = middle
      var st = T.steps(scale === 'chromatic' ? 'major' : scale), n = st.length, d = degree - 1;
      var oct = Math.floor(d / n), idx = ((d % n) + n) % n;
      return 12 * (octave + 1) + key + st[idx] + 12 * oct;
    },
    // a diatonic chord: degree 1..7, ext '' | '7' | 'sus2' | 'sus4' | '5' (power) | 'add9'
    chord: function (key, scale, degree, ext) {
      var sc = (scale === 'chromatic') ? 'major' : scale;
      var root = T.degreeNote(key, sc, degree, 3);
      if (ext === '5') return [root, root + 7, root + 12];
      var third = T.degreeNote(key, sc, degree + 2, 3), fifth = T.degreeNote(key, sc, degree + 4, 3);
      if (ext === 'sus2') third = T.degreeNote(key, sc, degree + 1, 3);
      if (ext === 'sus4') third = T.degreeNote(key, sc, degree + 3, 3);
      var notes = [root, third, fifth];
      if (ext === '7') notes.push(T.degreeNote(key, sc, degree + 6, 3));
      if (ext === 'add9') notes.push(T.degreeNote(key, sc, degree + 8, 3));
      return notes;
    },
    // put chord tones near `center` (smooth voice leading between chords)
    voice: function (notes, center) {
      var pcs = notes.map(function (n) { return ((n % 12) + 12) % 12; });
      var best = null, bestScore = 1e9;
      for (var inv = 0; inv < pcs.length; inv++) {
        for (var base = center - 12; base <= center + 1; base++) {
          if (((base % 12) + 12) % 12 !== pcs[inv]) continue;
          var out = [base], last = base;
          for (var k = 1; k < pcs.length; k++) {
            var pc = pcs[(inv + k) % pcs.length], n = last + 1;
            while (((n % 12) + 12) % 12 !== pc) n++;
            out.push(n); last = n;
          }
          var mid = (out[0] + out[out.length - 1]) / 2, score = Math.abs(mid - center);
          if (score < bestScore) { bestScore = score; best = out; }
        }
      }
      return best || notes;
    },
    chordName: function (key, scale, degree, ext) {
      var n = T.chord(key, scale, degree, ext === '7' || ext === 'add9' ? '' : ext);
      var root = T.pcName(n[0]);
      if (ext === '5') return root + '5';
      var third = (n[1] - n[0] + 12) % 12, fifth = (n[2] - n[0] + 12) % 12;
      var q = third === 3 ? (fifth === 6 ? 'dim' : 'm') : (third === 4 ? (fifth === 8 ? 'aug' : '') : '');
      if (ext === 'sus2' || ext === 'sus4') q = ext;
      return root + q + (ext === '7' ? '7' : ext === 'add9' ? 'add9' : '');
    },
    roman: function (scale, degree) {
      var R = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
      var n = T.chord(0, scale, degree, '');
      var third = (n[1] - n[0] + 12) % 12;
      var r = R[(degree - 1) % 7];
      return third === 3 ? r.toLowerCase() : r;
    },
    // Krumhansl-Schmuckler key finding from {pc: weight}
    detectKey: function (weights) {
      var MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
      var MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
      var w = [], i; for (i = 0; i < 12; i++) w.push(weights[i] || 0);
      function corr(prof, shift) {
        var mx = 0, my = 0, k; for (k = 0; k < 12; k++) { mx += w[k]; my += prof[k]; } mx /= 12; my /= 12;
        var num = 0, dx = 0, dy = 0;
        for (k = 0; k < 12; k++) { var x = w[k] - mx, y = prof[(k - shift + 12) % 12] - my; num += x * y; dx += x * x; dy += y * y; }
        return dx && dy ? num / Math.sqrt(dx * dy) : 0;
      }
      var best = { key: 0, scale: 'major', score: -2 };
      for (var s = 0; s < 12; s++) {
        var a = corr(MAJ, s), b = corr(MIN, s);
        if (a > best.score) best = { key: s, scale: 'major', score: a };
        if (b > best.score) best = { key: s, scale: 'minor', score: b };
      }
      return best;
    }
  };

  // ------------------------------------------------------------------ progressions people know
  HB.PROGRESSIONS = [
    { id: 'axis', name: 'I V vi IV (the "four chords" of pop)', deg: [1, 5, 6, 4] },
    { id: 'sad', name: 'vi IV I V (the emotional flip)', deg: [6, 4, 1, 5] },
    { id: 'fifties', name: 'I vi IV V (50s doo-wop)', deg: [1, 6, 4, 5] },
    { id: 'lift', name: 'IV I V vi (chorus lift)', deg: [4, 1, 5, 6] },
    { id: 'jazzy', name: 'ii V I I (smooth, lo-fi with 7ths)', deg: [2, 5, 1, 1], ext: '7' },
    { id: 'royal', name: 'IV V iii vi (anime / J-pop "royal road")', deg: [4, 5, 3, 6] },
    { id: 'minor4', name: 'i VI III VII (epic minor)', deg: [1, 6, 3, 7] },
    { id: 'andalusian', name: 'i VII VI V (Andalusian, flamenco drama)', deg: [1, 7, 6, 5] },
    { id: 'dark', name: 'i iv v i (dark minor)', deg: [1, 4, 5, 1] },
    { id: 'trap', name: 'i VI i VII (trap loop)', deg: [1, 6, 1, 7] },
    { id: 'two', name: 'I IV (two-chord groove)', deg: [1, 4, 1, 4] },
    { id: 'one', name: 'i i i i (one-chord riff)', deg: [1, 1, 1, 1] },
    { id: 'metal', name: 'i VI VII i (power-chord riff)', deg: [1, 6, 7, 1], ext: '5' },
    { id: 'blues', name: 'I IV I V (short blues)', deg: [1, 4, 1, 5], ext: '7' },
    { id: 'hope', name: 'IV V iii vi I (hopeful climb)', deg: [4, 5, 3, 6] },
    { id: 'gospel', name: 'I iii IV iv-ish (warm lift)', deg: [1, 3, 4, 2] }
  ];

  // ------------------------------------------------------------------ drum grooves
  // lanes: kick snare clap hat open tom crash perc. One char = a 16th. x = hit, o = soft, r = 32nd roll,
  // t = triplet roll, . = rest. Strings of 16 repeat to 32 (two bars).
  HB.LANES = ['kick', 'snare', 'clap', 'hat', 'open', 'tom', 'crash', 'perc'];
  HB.LANE_NAMES = { kick: 'Kick', snare: 'Snare', clap: 'Clap', hat: 'Hi-hat', open: 'Open hat', tom: 'Toms', crash: 'Crash', perc: 'Perc' };
  var G = HB.GROOVES = {
    trap: {
      low: { hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.rrrr', kick: 'x...............x.........x.....' },
      mid: { kick: 'x......x..x.....x.....x...x.....', snare: '........x...............x.......', hat: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.' },
      high: { kick: 'x......x..x.....x.....x...x..x..', snare: '........x...............x.......', clap: '........x...............x.......',
        hat: 'x.x.x.x.xrx.x.x.x.x.xtx.x.rrx.x.', open: '..............x...............x.', crash: 'x...............................' }
    },
    drill: {
      low: { hat: 'x..x..x.x..x..x.', perc: '..........x.....' },
      mid: { kick: 'x.........x.......x.......x.....', snare: '........x.................x.....', hat: 'x..x..x.x..x.tx.x..x..x.x..xt.x.' },
      high: { kick: 'x.........x...x...x.......x..x..', snare: '........x.................x.....', clap: '........x.................x.....',
        hat: 'x..x..x.x..x.tx.x..x..x.x..xt.x.', perc: '...o.......o.......o.......o....', crash: 'x...............................' }
    },
    boombap: {
      low: { hat: 'x.x.x.x.x.x.x.x.', kick: 'x.........x.....' },
      mid: { kick: 'x......xx.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x......xx.x..x..', snare: '....x.......x..o', hat: 'xox.xox.xox.xoxx', open: '..............x.', crash: 'x...............................' }
    },
    lofi: {
      low: { hat: 'o.o.o.o.o.o.o.o.', perc: '..o.......o.....' },
      mid: { kick: 'x......x..x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', perc: '..o.......o.....' },
      high: { kick: 'x......x.xx.....', snare: '....x.......x..o', hat: 'oxo.oxo.oxo.oxoo', perc: '..o.......o.....' }
    },
    four: {
      low: { kick: 'x...x...x...x...', hat: '..o...o...o...o.' },
      mid: { kick: 'x...x...x...x...', clap: '....x.......x...', open: '..x...x...x...x.', hat: 'o.o.o.o.o.o.o.o.' },
      high: { kick: 'x...x...x...x...', clap: '....x.......x...', open: '..x...x...x...x.', hat: 'oooooooooooooooo', perc: '...o..o....o..o.', crash: 'x...............................' }
    },
    disco: {
      low: { kick: 'x...x...x...x...', hat: 'o.o.o.o.o.o.o.o.' },
      mid: { kick: 'x...x...x...x...', snare: '....x.......x...', open: '..x...x...x...x.', hat: 'xoxoxoxoxoxoxoxo' },
      high: { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', open: '..x...x...x...x.', hat: 'xoxoxoxoxoxoxoxo', perc: 'x..x..x.x..x..x.', crash: 'x...............................' }
    },
    pop80: {
      low: { kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' },
      mid: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
      high: { kick: 'x.....x.x.....x.', snare: '....x.......x...', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', perc: '..x...x...x...x.', crash: 'x...............................' }
    },
    teenpop: {
      low: { kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' },
      mid: { kick: 'x..x..x...x..x..', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
      high: { kick: 'x..x..x...x..x..', snare: '....x.......x...', clap: '....x.......x..x', hat: 'xoxoxoxoxoxoxoxo', open: '......x.......x.', crash: 'x...............................' }
    },
    storypop: {
      low: { perc: 'oooooooooooooooo', kick: 'x.......x.......' },
      mid: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', perc: 'oooooooooooooooo' },
      high: { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', perc: 'oooooooooooooooo', crash: 'x...............................' }
    },
    rock: {
      low: { kick: 'x.......x.......', hat: 'x.x.x.x.x.x.x.x.' },
      mid: { kick: 'x.x.....x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x...x...x...x...', snare: '..x...x...x...x.', open: 'x.x.x.x.x.x.x.x.', crash: 'x...............x...............' }
    },
    metal: {
      low: { kick: 'x..x..x.x..x..x.', perc: 'x.x.x.x.x.x.x.x.' },
      mid: { kick: 'x.xxx.xxx.xxx.xx', snare: '....x.......x...', perc: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'xxxxxxxxxxxxxxxx', snare: '....x.......x...', crash: 'x...x...x...x...', perc: 'x.x.x.x.x.x.x.x.' }
    },
    dembow: {
      low: { kick: 'x...x...x...x...', perc: 'o.o.o.o.o.o.o.o.' },
      mid: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', clap: '...x..x....x..x.', hat: 'xoxoxoxoxoxoxoxo', perc: 'o..o..o.o..o..o.', crash: 'x...............................' }
    },
    afro: {
      low: { perc: 'xoooxoooxoooxooo', tom: '......x.......x.' },
      mid: { kick: 'x..x..x...x..x..', snare: '....o..o....o...', perc: 'xoooxoooxoooxooo', tom: '..x...x...x.x...' },
      high: { kick: 'x..x..x...x..x..', snare: '...o..x....o..x.', clap: '......x.......x.', perc: 'xoooxoooxoooxooo', tom: '..x.o.x...x.x.o.', hat: 'o.o.o.o.o.o.o.o.', crash: 'x...............................' }
    },
    synthwave: {
      low: { kick: 'x.......x.......', hat: '..x...x...x...x.' },
      mid: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x.......x.x.....', snare: '....x.......x...', clap: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', tom: '............................xxxx', crash: 'x...............................' }
    },
    future: {
      low: { hat: 'x...x...x...x...', kick: 'x...............' },
      mid: { kick: 'x.........x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x.........x...x.', snare: '........x.......', clap: '........x.......', hat: 'x.xrx.x.x.xrx.xx', crash: 'x...............................' }
    },
    hope: {
      low: { perc: '....o.......o...' },
      mid: { kick: 'x.......x.x.....', perc: '....o.......o...', hat: 'o.o.o.o.o.o.o.o.' },
      high: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', open: '..............o.', crash: 'x...............................' }
    },
    ballad: {
      low: {},
      mid: { kick: 'x.......x.......', perc: '....o.......o...', hat: 'o...o...o...o...' },
      high: { kick: 'x.......x..x....', snare: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', crash: 'x...............................' }
    },
    hyper: {
      low: { hat: 'xxxxxxxxxxxxxxxx', kick: 'x.......x.......' },
      mid: { kick: 'x..x..x.x.x..x..', snare: '....x.......x...', hat: 'x.x.xrx.x.x.xrx.' },
      high: { kick: 'x..x..x.x.x..x..', snare: '....x.......x.xx', clap: '....x.......x...', hat: 'xrxrxrxrxrxrxrxr', crash: 'x.......x.......' }
    },
    indie: {
      low: { hat: 'x.x.x.x.x.x.x.x.' },
      mid: { kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
      high: { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', open: '..............x.', crash: 'x...............................' }
    }
  };

  function groovePattern(grooveId, level, bars) {
    var g = (G[grooveId] || G.indie)[level] || {};
    var steps = bars * 16, hits = [];
    HB.LANES.forEach(function (lane) {
      var s = g[lane]; if (!s) return;
      for (var i = 0; i < steps; i++) {
        var c = s[i % s.length];
        if (c === 'x' || c === 'o') hits.push({ t: i / 4, lane: lane, v: c === 'x' ? 0.9 : 0.5 });
        else if (c === 'r') { hits.push({ t: i / 4, lane: lane, v: 0.7 }); hits.push({ t: i / 4 + 0.125, lane: lane, v: 0.6 }); }
        else if (c === 't') { for (var k = 0; k < 3; k++) hits.push({ t: i / 4 + k / 12, lane: lane, v: 0.55 + k * 0.1 }); }
      }
    });
    return { kind: 'drums', len: bars * 4, hits: hits };
  }
  HB.groovePattern = groovePattern;

  // ------------------------------------------------------------------ parts: chords, bass, hooks
  function progFor(recipe, kind) {
    var p = recipe.prog[kind] || recipe.prog.verse;
    return p.map(function (c) { return typeof c === 'number' ? { d: c, x: recipe.ext || '' } : { d: c[0], x: c[1] }; });
  }

  // chord-style rhythms per bar: [startInBeats, length, velocity]
  var CHORD_RHYTHMS = {
    block: [[0, 4, 0.7]],
    pad: [[0, 4, 0.6]],
    piano: [[0, 2, 0.7], [2, 2, 0.6]],
    stabs: [[0.5, 0.25, 0.8], [1.5, 0.25, 0.7], [2.5, 0.25, 0.8], [3.5, 0.25, 0.7]],
    stab8: [[0, 0.25, 0.8], [0.75, 0.25, 0.7], [1.5, 0.25, 0.8], [2.5, 0.25, 0.7], [3, 0.25, 0.8]],
    pluck: [[0.5, 0.4, 0.7], [1.5, 0.4, 0.6], [2.5, 0.4, 0.7], [3.25, 0.4, 0.6]],
    rhodes: [[0, 1.5, 0.6], [1.75, 0.5, 0.5], [2.5, 1.5, 0.55]],
    supersaw: [[0, 0.75, 0.8], [0.75, 0.75, 0.7], [1.5, 0.5, 0.75], [2.5, 0.75, 0.7], [3.25, 0.75, 0.7]],
    strum: [[0, 1, 0.8], [1, 0.5, 0.6], [1.5, 0.5, 0.65], [2.5, 0.5, 0.6], [3, 0.5, 0.7], [3.5, 0.5, 0.6]],
    power: [[0, 0.4, 0.9], [0.5, 0.2, 0.6], [1, 0.4, 0.9], [1.5, 0.2, 0.6], [2, 0.4, 0.9], [2.5, 0.2, 0.6], [3, 0.9, 0.9]],
    chug: [[0, 0.2, 0.9], [0.25, 0.2, 0.6], [0.5, 0.2, 0.7], [1, 0.2, 0.9], [1.25, 0.2, 0.6], [1.5, 0.2, 0.7], [2, 0.2, 0.9], [2.25, 0.2, 0.6], [2.5, 0.2, 0.7], [3, 0.9, 0.9]]
  };

  function chordPart(recipe, kind, bars, style, center, rand) {
    var prog = progFor(recipe, kind), notes = [], prev = center;
    var power = style === 'power' || style === 'chug';
    for (var b = 0; b < bars; b++) {
      var c = prog[b % prog.length];
      var raw = T.chord(recipe.key, recipe.scale, c.d, power ? '5' : c.x);
      var v = power ? raw.map(function (n) { return n + 12 * Math.round((center - 12 - raw[0]) / 12); }) : T.voice(raw, prev);
      if (!power) prev = (v[0] + v[v.length - 1]) / 2;
      if (style === 'arp' || style === 'pianoarp') {
        var seq = style === 'arp' ? [0, 1, 2, 3, 2, 1, 0, 1] : [0, 2, 1, 2, 3, 2, 1, 2];
        var ext = v.concat([v[0] + 12]);
        var step = style === 'arp' ? 0.25 : 0.5, count = style === 'arp' ? 16 : 8;
        for (var i = 0; i < count; i++) notes.push({ t: b * 4 + i * step, d: step * (style === 'arp' ? 0.9 : 1.6), p: ext[seq[i % seq.length] % ext.length], v: i % 4 === 0 ? 0.75 : 0.55 });
        if (style === 'pianoarp') notes.push({ t: b * 4, d: 4, p: v[0] - 12, v: 0.6 });
        continue;
      }
      var rhythm = CHORD_RHYTHMS[style] || CHORD_RHYTHMS.block;
      rhythm.forEach(function (r, ri) {
        v.forEach(function (n, k) {
          var strumOff = style === 'strum' ? k * 0.02 * (ri % 2 ? -1 : 1) + (ri % 2 ? 0.06 : 0) : 0;
          notes.push({ t: b * 4 + r[0] + Math.max(0, strumOff), d: r[1], p: n, v: r[2] * (0.92 + rand() * 0.1) });
        });
      });
    }
    return { kind: 'notes', len: bars * 4, notes: notes };
  }

  function rootOf(recipe, c, octave) { return T.degreeNote(recipe.key, recipe.scale, c.d, octave); }

  function bassPart(recipe, kind, bars, style, rand) {
    var prog = progFor(recipe, kind), notes = [];
    for (var b = 0; b < bars; b++) {
      var c = prog[b % prog.length], r = rootOf(recipe, c, 1), t0 = b * 4;
      if (r < 33) r += 12;
      var fifth = r + 7;
      var add = function (t, d, p, v, g) { var n = { t: t0 + t, d: d, p: p, v: v || 0.8 }; if (g) n.g = 1; notes.push(n); };
      if (style === 'sub') { add(0, 4, r, 0.8); }
      else if (style === 'root') { add(0, 2, r, 0.8); add(2, 2, r, 0.7); }
      else if (style === 'root8') { for (var i = 0; i < 8; i++) add(i * 0.5, 0.45, r, i % 2 ? 0.65 : 0.85); }
      else if (style === 'gallop') { for (var j = 0; j < 4; j++) { add(j, 0.2, r, 0.9); add(j + 0.5, 0.2, r, 0.7); add(j + 0.75, 0.2, r, 0.7); } }
      else if (style === 'octave') { for (var k = 0; k < 8; k++) add(k * 0.5, 0.4, k % 2 ? r + 12 : r, 0.8); }
      else if (style === 'funk') { add(0, 0.4, r, 0.9); add(0.75, 0.2, r + 12, 0.6); add(1.5, 0.4, r, 0.8); add(2.25, 0.2, fifth, 0.6); add(2.5, 0.4, r + 10, 0.7); add(3.5, 0.4, r + 12, 0.7); }
      else if (style === 'synco') { add(0, 0.7, r, 0.85); add(0.75, 0.5, r, 0.6); add(1.5, 0.9, r, 0.75); add(2.5, 0.5, fifth, 0.65); add(3, 0.9, r, 0.75); }
      else if (style === 'dembow') { add(0, 0.7, r, 0.85); add(0.75, 0.6, r, 0.7); add(1.5, 0.4, r, 0.7); add(2, 0.7, r, 0.85); add(2.75, 0.6, r, 0.7); add(3.5, 0.4, fifth, 0.7); }
      else if (style === 'log') { add(0, 0.5, r + 12, 0.9); add(0.75, 0.4, r + 12, 0.7); add(1.5, 0.5, r + 7, 0.8); add(2.5, 0.4, r + 12, 0.8); add(3.25, 0.5, r + 10, 0.7); }
      else if (style === 'walk') { add(0, 1, r, 0.8); add(1, 1, r + 4 - (recipe.scale === 'major' ? 0 : 1), 0.65); add(2, 1, fifth, 0.7); add(3, 1, r + 9 > fifth ? fifth + 2 : r + 9, 0.6); }
      else if (style === '808') {
        // long 808 notes on the kick hits of the groove, gliding up an octave now and then
        var hits = ((G[recipe.groove] || G.trap).high.kick || 'x.......x.......').slice(0, 16);
        var starts = []; for (var s = 0; s < 16; s++) if (hits[s] === 'x') starts.push(s / 4);
        starts.forEach(function (st, si) {
          var end = si + 1 < starts.length ? starts[si + 1] : 4, d = Math.max(0.25, end - st - 0.02);
          var glide = (b % 2 === 1 && si === starts.length - 1 && rand() < 0.7);
          add(st, d, glide ? r + 12 : r, 0.9, glide);
        });
      } else { add(0, 4, r, 0.8); }
    }
    return { kind: 'notes', len: bars * 4, notes: notes };
  }

  var HOOK_RHYTHMS = [
    'x.x.x...x.x.xx..', 'x..x..x.x.......', 'x.xx.x..x.x.x...', '..x.x.x...x.x.x.', 'x...x.x.x...x...',
    'x.x...x.x.x...x.', 'xx.x.x..xx.x.x..', 'x..x.x..x..x....'
  ];
  function hookPart(recipe, kind, bars, octave, rand) {
    var prog = progFor(recipe, kind), notes = [];
    var rhythm = HOOK_RHYTHMS[Math.floor(rand() * HOOK_RHYTHMS.length)];
    var answer = HOOK_RHYTHMS[Math.floor(rand() * HOOK_RHYTHMS.length)];
    var contour = [0, 1, 2, 1, 0, -1, 0, 2, 3, 2];
    var shift = Math.floor(rand() * 3);
    for (var b = 0; b < bars; b++) {
      var c = prog[b % prog.length];
      var tones = [0, 2, 4].map(function (k) { return T.degreeNote(recipe.key, recipe.scale, c.d + k, octave); });
      var r = (b % 2 === 0) ? rhythm : answer, idx = 0;
      for (var s = 0; s < 16; s++) {
        if (r[s] !== 'x') continue;
        var cv = contour[(idx + shift + (b % 4 === 3 ? 2 : 0)) % contour.length];
        var p = cv >= 0 ? tones[cv % 3] + (cv >= 3 ? 12 : 0) : tones[2] - 12;
        if (idx % 3 === 2 && rand() < 0.5) p = T.snap(p + (rand() < 0.5 ? 2 : -2), recipe.key, recipe.scale);
        var nxt = r.indexOf('x', s + 1); var d = ((nxt < 0 ? 16 : nxt) - s) / 4;
        notes.push({ t: b * 4 + s / 4, d: Math.min(d, 1.5) * 0.92, p: p, v: idx === 0 ? 0.85 : 0.7 });
        idx++;
      }
    }
    return { kind: 'notes', len: bars * 4, notes: notes };
  }
  HB.parts = { chord: chordPart, bass: bassPart, hook: hookPart };

  // ------------------------------------------------------------------ the genre recipes
  // levels: which parts play in each kind of section (and how busy the drums are)
  var POP_LEVELS = {
    intro: { pad: 1, hook: 1, chords: 1, drums: 'low' }, verse: { drums: 'mid', bass: 1, chords: 1 },
    pre: { drums: 'mid', bass: 1, chords: 1, pad: 1 }, chorus: { drums: 'high', bass: 1, chords: 1, pad: 1, hook: 1, lead: 1 },
    bridge: { pad: 1, chords: 1, drums: 'low', bass: 1 }, drop: { drums: 'high', bass: 1, chords: 1, hook: 1, lead: 1 },
    solo: { drums: 'high', bass: 1, chords: 1, lead: 1, hook: 1 }, outro: { chords: 1, pad: 1, hook: 1 }
  };
  var POP_FORM = [['intro', 4, 'riser'], ['verse', 8, 'fill'], ['chorus', 8, 'none'], ['verse', 8, 'build'], ['chorus', 8, 'sweep'],
    ['bridge', 8, 'drop'], ['chorus', 8, 'none'], ['outro', 4, 'none']];

  var GENRES = HB.GENRES = [
    {
      id: 'hopecore', name: 'Millennial Hopecore', era: '2020s internet', bpm: 78, key: 2, scale: 'major', swing: 0, groove: 'hope', kit: 'brush',
      blurb: 'Soft piano, glowing pads and a lift at the end: the sound of a "you are going to be okay" edit.',
      prog: { verse: [1, 5, 6, 4], chorus: [4, 5, 3, 6], bridge: [6, 4, 1, 5], intro: [1, 5, 6, 4] }, ext: 'add9',
      parts: [['drums', 'Soft kit', 'brush'], ['chords', 'Piano', 'piano', 'pianoarp', 60], ['pad', 'Glow pad', 'pad', 'pad', 64],
        ['bass', 'Warm bass', 'subbass', 'sub'], ['hook', 'Music box', 'musicbox', 'hook', 6], ['voice', 'Vocals', 'hopecore']],
      form: [['intro', 4, 'reverse'], ['verse', 8, 'none'], ['chorus', 8, 'none'], ['verse', 8, 'riser'], ['chorus', 8, 'drop'], ['bridge', 8, 'build'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { pad: 1, hook: 1 }, verse: { chords: 1, pad: 1, bass: 1, drums: 'low' }, chorus: { chords: 1, pad: 1, bass: 1, hook: 1, drums: 'mid' },
        bridge: { pad: 1, hook: 1 }, outro: { chords: 1, pad: 1, hook: 1 } },
      lastChorus: 'high',
      ingredients: {
        drums: 'Barely there: brushed hats and a soft kick, often no drums at all until the last chorus.',
        bass: 'A warm sub that holds the chord root.',
        harmony: 'Major key with added 9ths. IV-V-iii-vi climbs feel like hope.',
        vocals: 'Close and breathy, with a long reverb tail. A spoken line works too.',
        structure: 'Start almost empty, grow one layer at a time, and land on a full, bright last chorus.',
        tip: 'Leave space. The feeling comes from the build, not from speed.'
      },
      lyrics: { verse: 'Late bus home, the window holds my face\nTen years from now I hope I like this place', chorus: 'And it gets lighter, it gets lighter\nEvery little step, I get a little brighter' },
      starters: ['A letter to the version of you from ten years ago', 'The first warm day after a long winter', 'Small things that kept you going this year']
    },
    {
      id: 'mumble', name: 'Mumble Rap', era: '2010s trap', bpm: 140, key: 1, scale: 'minor', swing: 0.06, groove: 'trap', kit: 'trap808',
      blurb: 'Half-time trap with sliding 808s, rattling hi-hats and a hard-tuned, melodic flow.',
      prog: { verse: [1, 6, 1, 7], chorus: [1, 6, 3, 7], intro: [1, 6, 1, 7] },
      parts: [['drums', 'Trap kit', 'trap808'], ['bass', '808', 'bass808', '808'], ['hook', 'Dark bells', 'bell', 'hook', 5],
        ['chords', 'Choir pad', 'choir', 'pad', 60], ['voice', 'Vocals', 'mumble']],
      form: [['intro', 4, 'drop'], ['chorus', 8, 'fill'], ['verse', 16, 'drop'], ['chorus', 8, 'fill'], ['verse', 16, 'drop'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { hook: 1, chords: 1, drums: 'low' }, chorus: { drums: 'high', bass: 1, hook: 1, chords: 1 }, verse: { drums: 'mid', bass: 1, hook: 1 }, outro: { hook: 1, chords: 1 } },
      ingredients: {
        drums: 'Half-time: the snare lands on beat 3. Hi-hats roll in 1/32 and triplets. Kick and 808 move together.',
        bass: 'A long 808 that is also the bass line, gliding up an octave at the end of a phrase.',
        harmony: 'Minor key, two or four chords looped on a dark bell or pluck melody.',
        vocals: 'Auto-tune on hard (retune speed near zero) so the voice snaps between notes, plus ad-libs and echo.',
        structure: 'Hook first, long verses, the beat drops out for a beat before the hook comes back.',
        tip: 'Try Voice > Hard tune, then sing loosely: the tuning turns slides into melody.'
      },
      lyrics: { chorus: 'Woke up in a new town (yeah)\nPhone face down, no sound (no sound)', verse: 'Pull up slow, I keep it low\nEverything I got, I made it on my own' },
      starters: ['A first big win', 'Late night drive with the windows down', 'Proving the doubters wrong']
    },
    {
      id: 'metal', name: 'Heavy Metal', era: '1980s-now', bpm: 160, key: 4, scale: 'phrygian', swing: 0, groove: 'metal', kit: 'metal',
      blurb: 'Down-tuned power-chord riffs, double-kick drums and a lead that screams.',
      prog: { verse: [[1, '5'], [1, '5'], [2, '5'], [1, '5']], chorus: [[1, '5'], [6, '5'], [7, '5'], [1, '5']], solo: [[1, '5'], [6, '5'], [3, '5'], [7, '5']], intro: [[1, '5'], [2, '5'], [1, '5'], [7, '5']] },
      parts: [['drums', 'Metal kit', 'metal'], ['chords', 'Rhythm guitar', 'distguitar', 'chug', 47], ['bass', 'Bass', 'bassguitar', 'gallop'],
        ['lead', 'Lead guitar', 'leadguitar', 'hook', 5], ['voice', 'Vocals', 'metal']],
      form: [['intro', 4, 'impact'], ['verse', 8, 'fill'], ['chorus', 8, 'fill'], ['verse', 8, 'fill'], ['chorus', 8, 'build'], ['solo', 8, 'impact'], ['chorus', 8, 'impact'], ['outro', 4, 'none']],
      levels: { intro: { chords: 1, drums: 'low' }, verse: { chords: 1, bass: 1, drums: 'mid' }, chorus: { chords: 1, bass: 1, drums: 'high', lead: 1 },
        solo: { chords: 1, bass: 1, drums: 'high', lead: 1 }, outro: { chords: 1, drums: 'low' } },
      ingredients: {
        drums: 'Double-kick 16ths, a crash on every beat in the chorus, ride cymbal on the verses.',
        bass: 'Locks to the guitar riff in gallops (da-da-dum).',
        harmony: 'Power chords (root and fifth) in Phrygian: the flat second (E to F) is the classic evil step.',
        vocals: 'Grit: drive, doubling and a short slap echo. Sing lower and push.',
        structure: 'Riff intro, verse, chorus, a guitar solo section, and a hard stop.',
        tip: 'Palm-muted chugs are short notes. Make chord notes shorter in the piano roll for more chug.'
      },
      lyrics: { verse: 'Iron sky above the wire\nWe were born to walk through fire', chorus: 'Rise! Out of the ashes\nRise! Louder than thunder' },
      starters: ['A storm you walk straight into', 'The last one standing', 'A machine that will not stop']
    },
    {
      id: 'pop80', name: '80s Dance Pop', era: 'Moonwalk era', bpm: 117, key: 4, scale: 'dorian', swing: 0, groove: 'pop80', kit: 'gated80s',
      blurb: 'Tight 16th-note synth bass, gated snares, brass stabs and finger-snap funk.',
      prog: { verse: [1, 1, 4, 1], chorus: [1, 4, 6, 5], bridge: [4, 5, 6, 7], intro: [1, 1, 4, 1] }, ext: '7',
      parts: [['drums', 'Drum machine', 'gated80s'], ['bass', 'Synth bass', 'synthbass', 'octave'], ['chords', 'Brass stabs', 'brass', 'stabs', 62],
        ['pad', 'Funk guitar', 'cleanguitar', 'stab8', 64], ['hook', 'Synth lead', 'lead', 'hook', 5], ['voice', 'Vocals', 'pop']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Drum machine kick, a huge gated-reverb snare on 2 and 4, 16th hats and claps doubling the snare.',
        bass: 'Synth bass bouncing between root and octave in 8ths or 16ths: the engine of the groove.',
        harmony: 'Dorian minor with 7th chords; brass stabs on the off-beats; a funk guitar chop.',
        vocals: 'Crisp and rhythmic, with hiccups and "hoo!" ad-libs, short echo, tight compression.',
        structure: 'Intro groove, verse, big chorus, a bridge that lifts the key mood, chorus, fade.',
        tip: 'The groove lives in the bass. Keep the snare dry and loud, the brass short.'
      },
      lyrics: { verse: 'City lights are calling out my name\nEvery step I take, I feel the same', chorus: 'Move it to the floor, tonight\nNothing in the world feels this right' },
      starters: ['A dance-off you did not expect to win', 'A mystery person on the dance floor', 'Neon city at midnight']
    },
    {
      id: 'teenpop', name: 'Y2K Teen Pop', era: 'Turn of the millennium', bpm: 96, key: 0, scale: 'minor', swing: 0, groove: 'teenpop', kit: 'pop',
      blurb: 'Staccato synth stabs, crunchy drums and a breathy, doubled voice: the late-90s chart sound.',
      prog: { verse: [1, 6, 3, 7], chorus: [1, 6, 7, 5], bridge: [6, 7, 1, 1], intro: [1, 6, 3, 7] },
      parts: [['drums', 'Pop kit', 'pop'], ['bass', 'Bass', 'synthbass', 'synco'], ['chords', 'Stab synth', 'stabsynth', 'stab8', 64],
        ['pad', 'Strings', 'strings', 'pad', 64], ['hook', 'Pluck', 'pluck', 'hook', 5], ['voice', 'Vocals', 'teenpop']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Punchy kick patterns with skips, claps on 2 and 4, a crunchy snare.',
        bass: 'Syncopated synth bass that follows the kick.',
        harmony: 'Minor key, staccato stab chords, strings in the chorus. A dramatic key-change feel in the last chorus.',
        vocals: 'Breathy and close, with a doubled chorus and a little "baby" attitude. Light auto-tune.',
        structure: 'A spoken or whispered intro line, verse, pre-chorus build, a chorus you can shout.',
        tip: 'Turn on Voice > Double in the chorus for that stacked sound.'
      },
      lyrics: { verse: 'You keep on texting me at two\nSaying all the things you never do', chorus: 'Oh, I am not that kind of girl\nNot gonna be your second world' },
      starters: ['A crush who keeps sending mixed signals', 'Your bedroom poster wall', 'The end of a school year']
    },
    {
      id: 'storypop', name: 'Storyteller Pop', era: 'Country to stadium pop', bpm: 120, key: 7, scale: 'major', swing: 0, groove: 'storypop', kit: 'acoustic',
      blurb: 'Strummed acoustic guitar, a diary-entry verse and a chorus that turns into a stadium sing-along.',
      prog: { verse: [1, 5, 6, 4], chorus: [4, 1, 5, 6], bridge: [6, 4, 1, 5], intro: [1, 5, 6, 4] },
      parts: [['drums', 'Band kit', 'acoustic'], ['chords', 'Acoustic guitar', 'acoustic', 'strum', 60], ['bass', 'Bass', 'bassguitar', 'root8'],
        ['pad', 'Piano', 'piano', 'piano', 64], ['hook', 'Banjo-ish pluck', 'pluck', 'hook', 5], ['voice', 'Vocals', 'pop']],
      form: [['intro', 4, 'none'], ['verse', 8, 'none'], ['pre', 4, 'build'], ['chorus', 8, 'none'], ['verse', 8, 'none'], ['pre', 4, 'build'], ['chorus', 8, 'drop'],
        ['bridge', 8, 'build'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: POP_LEVELS,
      ingredients: {
        drums: 'Shaker and kick in the verse, four-on-the-floor kick in the chorus, claps on the big moments.',
        bass: 'Driving root 8ths that push the chorus forward.',
        harmony: 'The four chords everyone knows (I V vi IV), re-ordered for the chorus.',
        vocals: 'Natural, close, light tuning. Specific details in the words: a street, a scarf, a date.',
        structure: 'Verse tells the story, pre-chorus builds, chorus says the feeling, the bridge is the plot twist.',
        tip: 'Write the bridge last: it is where the story changes.'
      },
      lyrics: { verse: 'Your jacket on the passenger seat\nThe radio still playing our song on repeat', chorus: 'And I remember all of it\nEvery single word you said' },
      starters: ['A friendship that changed', 'The street you grew up on', 'The moment you knew it was over']
    },
    {
      id: 'lofi', name: 'Lo-fi Hip Hop', era: 'Study beats', bpm: 82, key: 5, scale: 'dorian', swing: 0.22, groove: 'lofi', kit: 'lofi',
      blurb: 'Dusty swung drums, jazzy Rhodes 7th chords and a warm, worn-tape haze.',
      prog: { verse: [2, 5, 1, 1], chorus: [4, 3, 2, 5], intro: [2, 5, 1, 1] }, ext: '7',
      parts: [['drums', 'Dusty kit', 'lofi'], ['chords', 'Rhodes', 'epiano', 'rhodes', 60], ['bass', 'Upright-ish bass', 'bassguitar', 'walk'],
        ['hook', 'Soft lead', 'flute', 'hook', 5], ['voice', 'Vocals', 'lofi']],
      form: [['intro', 4, 'none'], ['verse', 8, 'none'], ['chorus', 8, 'none'], ['verse', 8, 'sweep'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { chords: 1, drums: 'low' }, verse: { chords: 1, bass: 1, drums: 'mid' }, chorus: { chords: 1, bass: 1, drums: 'high', hook: 1 }, outro: { chords: 1, hook: 1 } },
      ingredients: {
        drums: 'Lazy, swung boom-bap at low volume, filtered and crushed, with a rim click.',
        bass: 'Round and short, walking between chord tones.',
        harmony: 'ii-V-I with 7th chords on a Rhodes electric piano.',
        vocals: 'Usually none, or a filtered sample-like line through Telephone.',
        structure: 'One loop that slowly changes. No big drops.',
        tip: 'Song > Swing to about 25% makes any drum part lazy and human.'
      },
      lyrics: { verse: 'Rain on the window, coffee gone cold\nPages of notes that I never told', chorus: '(hum along, no words needed)' },
      starters: ['A rainy afternoon in a small room', 'A street at 6 am', 'Notes you never sent']
    },
    {
      id: 'house', name: 'House', era: 'Chicago to now', bpm: 124, key: 9, scale: 'minor', swing: 0.08, groove: 'four', kit: 'house909',
      blurb: 'Four-on-the-floor kick, off-beat open hats, piano stabs and a bass that never stops.',
      prog: { verse: [1, 6, 3, 7], chorus: [6, 7, 1, 1], intro: [1, 6, 3, 7] }, ext: '7',
      parts: [['drums', '909 kit', 'house909'], ['bass', 'Bass', 'synthbass', 'octave'], ['chords', 'House piano', 'piano', 'stabs', 64],
        ['pad', 'Pad', 'pad', 'pad', 62], ['hook', 'Lead', 'pluck', 'hook', 5], ['voice', 'Vocals', 'stadium']],
      form: [['intro', 8, 'sweep'], ['verse', 8, 'build'], ['drop', 16, 'riser'], ['bridge', 8, 'build'], ['drop', 16, 'none'], ['outro', 8, 'none']],
      levels: { intro: { drums: 'low', pad: 1 }, verse: { drums: 'mid', bass: 1, pad: 1 }, drop: { drums: 'high', bass: 1, chords: 1, hook: 1 }, bridge: { pad: 1, chords: 1 }, outro: { drums: 'low' } },
      ingredients: {
        drums: 'Kick on every beat, clap on 2 and 4, open hat on every off-beat.',
        bass: 'Off-beat or octave bass, short and bouncy.',
        harmony: 'Minor 7th chords played as piano stabs.',
        vocals: 'Big, soulful, lots of reverb. One repeated line is enough.',
        structure: 'DJ-friendly: long intro and outro with only drums, a breakdown, then the drop.',
        tip: 'Use the Sweep transition into the drop.'
      },
      lyrics: { verse: 'Feel it coming up through the floor', chorus: 'Lift me higher, lift me higher' },
      starters: ['The moment the lights go down', 'Strangers dancing together', 'Sunrise after a long night']
    },
    {
      id: 'synthwave', name: 'Synthwave', era: 'Retro future', bpm: 100, key: 9, scale: 'minor', swing: 0, groove: 'synthwave', kit: 'gated80s',
      blurb: 'Pulsing 8th-note bass, arpeggiated synths, gated drums and a night-drive mood.',
      prog: { verse: [1, 6, 3, 7], chorus: [6, 4, 1, 5], intro: [1, 6, 3, 7] },
      parts: [['drums', 'Drum machine', 'gated80s'], ['bass', 'Pulse bass', 'synthbass', 'root8'], ['chords', 'Arp synth', 'pluck', 'arp', 64],
        ['pad', 'Pad', 'pad', 'pad', 60], ['lead', 'Lead', 'lead', 'hook', 5], ['voice', 'Vocals', 'stadium']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Big 80s kick and gated snare, toms rolling into each chorus.',
        bass: 'Constant 8th-note pulse on the root.',
        harmony: 'Minor key, an arpeggiator running 16ths, wide pads.',
        vocals: 'Distant, with echo and chorus, or no vocals at all.',
        structure: 'Long build, chorus with the lead melody, a key-of-the-night bridge.',
        tip: 'Turn Effects > Wide (chorus) up on the pad.'
      },
      lyrics: { verse: 'Chrome horizon, engines low\nThe city hums a song I know', chorus: 'Drive into the night\nDrive into the light' },
      starters: ['An endless highway at night', 'A city in the year 2088', 'Leaving everything behind']
    },
    {
      id: 'reggaeton', name: 'Reggaeton', era: 'Latin urban', bpm: 94, key: 2, scale: 'minor', swing: 0, groove: 'dembow', kit: 'trap808',
      blurb: 'The dembow rhythm (boom, ch-boom, chick), a deep bass and catchy plucked chords.',
      prog: { verse: [1, 6, 3, 7], chorus: [1, 6, 3, 7], intro: [1, 6, 3, 7] },
      parts: [['drums', 'Dembow kit', 'trap808'], ['bass', 'Bass', 'bass808', 'dembow'], ['chords', 'Pluck chords', 'pluck', 'pluck', 64],
        ['hook', 'Lead', 'lead', 'hook', 5], ['voice', 'Vocals', 'pop']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Dembow: kick on every beat, snare on the "a" of 1 and the "and" of 2, repeated.',
        bass: 'A deep 808-like bass that follows the dembow.',
        harmony: 'Four minor chords looped, plucked on off-beats.',
        vocals: 'Rhythmic, a bit of auto-tune, call-and-response ad-libs.',
        structure: 'Short intro, verse, a chorus that repeats the title, a quieter bridge.',
        tip: 'Keep the hook to 2 or 3 words that repeat.'
      },
      lyrics: { verse: 'Under the moon, the street is warm\nMove with me, we start a storm', chorus: 'Baila, baila, all night long' },
      starters: ['A summer night by the sea', 'Dancing with someone new', 'A festival in your city']
    },
    {
      id: 'poppunk', name: 'Pop Punk', era: '2000s skate park', bpm: 172, key: 4, scale: 'major', swing: 0, groove: 'rock', kit: 'rock',
      blurb: 'Fast power chords, a snare that never sits still and a shout-along chorus.',
      prog: { verse: [[1, '5'], [5, '5'], [6, '5'], [4, '5']], chorus: [[4, '5'], [1, '5'], [5, '5'], [6, '5']], bridge: [[6, '5'], [4, '5'], [1, '5'], [5, '5']], intro: [[1, '5'], [5, '5'], [6, '5'], [4, '5']] },
      parts: [['drums', 'Rock kit', 'rock'], ['chords', 'Guitars', 'distguitar', 'power', 52], ['bass', 'Bass', 'bassguitar', 'root8'],
        ['lead', 'Lead guitar', 'leadguitar', 'hook', 5], ['voice', 'Vocals', 'punk']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Kick and snare trading 8ths in the chorus ("skank beat"), crash on every bar.',
        bass: 'Root 8ths, always.',
        harmony: 'Major-key power chords, I V vi IV at full speed.',
        vocals: 'A bit nasal, doubled, with gang shouts in the chorus.',
        structure: 'Verse, chorus, verse, chorus, a half-time breakdown bridge, last chorus faster.',
        tip: 'Double the vocals and pan them: Voice > Double.'
      },
      lyrics: { verse: 'Sneakers on the dashboard, nowhere left to go\nThis town is getting smaller and everybody knows', chorus: 'We were never gonna grow up\nWe were never gonna slow down' },
      starters: ['Your hometown is too small', 'Summer before everyone moves away', 'A band in a garage']
    },
    {
      id: 'drill', name: 'Drill', era: 'Chicago to London', bpm: 142, key: 6, scale: 'harmonic', swing: 0, groove: 'drill', kit: 'trap808',
      blurb: 'Sliding 808s, skippy triplet hats, off-kilter snares and dark strings.',
      prog: { verse: [1, 1, 6, 5], chorus: [1, 6, 4, 5], intro: [1, 1, 6, 5] },
      parts: [['drums', 'Drill kit', 'trap808'], ['bass', 'Sliding 808', 'bass808', '808'], ['chords', 'Dark strings', 'strings', 'pad', 60],
        ['hook', 'Bell', 'bell', 'hook', 5], ['voice', 'Vocals', 'drill']],
      form: [['intro', 4, 'drop'], ['verse', 16, 'drop'], ['chorus', 8, 'fill'], ['verse', 16, 'drop'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { chords: 1, hook: 1 }, verse: { drums: 'mid', bass: 1, chords: 1 }, chorus: { drums: 'high', bass: 1, chords: 1, hook: 1 }, outro: { chords: 1 } },
      ingredients: {
        drums: 'Snare on the 3rd beat and a late one, triplet hi-hats that skip and stutter.',
        bass: '808s that slide between notes (glide).',
        harmony: 'Harmonic minor: strings and a bell melody with that eerie raised 7th.',
        vocals: 'Low, confident, little tuning, echo on the ends of lines.',
        structure: 'Long verses, short hooks, the beat drops out before the hook.',
        tip: 'In the piano roll, overlapping 808 notes glide into each other.'
      },
      lyrics: { verse: 'Cold wind, grey streets, I stay on my feet', chorus: 'No days off, no days off' },
      starters: ['Your city at night', 'Loyalty', 'Coming up from nothing']
    },
    {
      id: 'afrobeats', name: 'Afrobeats', era: 'Lagos to the world', bpm: 104, key: 7, scale: 'major', swing: 0.12, groove: 'afro', kit: 'afro',
      blurb: 'Syncopated drums, shakers, a bouncing log-drum bass and bright guitar plucks.',
      prog: { verse: [1, 4, 6, 5], chorus: [4, 5, 1, 6], intro: [1, 4, 6, 5] },
      parts: [['drums', 'Afro percussion', 'afro'], ['bass', 'Log drum', 'logdrum', 'log'], ['chords', 'Guitar plucks', 'cleanguitar', 'pluck', 64],
        ['pad', 'Keys', 'epiano', 'block', 60], ['hook', 'Whistle lead', 'flute', 'hook', 6], ['voice', 'Vocals', 'pop']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Off-beat kick, rim clicks, shakers in 16ths, congas talking back.',
        bass: 'A melodic log-drum bass that bounces.',
        harmony: 'Major key, bright guitar plucks on the off-beats.',
        vocals: 'Smooth, melodic, light tuning, call and response.',
        structure: 'Groove-first, repeated chorus, a breakdown with only percussion.',
        tip: 'A little swing (12%) makes the shakers dance.'
      },
      lyrics: { verse: 'Sunshine on my skin today\nAll my worries float away', chorus: 'Come and dance with me, my love\nEverything is good enough' },
      starters: ['A wedding party', 'The best day of summer', 'Someone who makes you feel at home']
    },
    {
      id: 'ballad', name: 'Piano Ballad', era: 'Timeless', bpm: 68, key: 3, scale: 'major', swing: 0, groove: 'ballad', kit: 'brush',
      blurb: 'Just a piano and a voice at first, then strings and drums for the big final chorus.',
      prog: { verse: [1, 6, 4, 5], chorus: [4, 5, 3, 6], bridge: [2, 5, 1, 6], intro: [1, 6, 4, 5] },
      parts: [['drums', 'Soft kit', 'brush'], ['chords', 'Piano', 'piano', 'pianoarp', 60], ['pad', 'Strings', 'strings', 'pad', 64],
        ['bass', 'Bass', 'subbass', 'sub'], ['voice', 'Vocals', 'ballad']],
      form: [['intro', 4, 'none'], ['verse', 8, 'none'], ['chorus', 8, 'none'], ['verse', 8, 'none'], ['chorus', 8, 'build'], ['bridge', 8, 'drop'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { chords: 1 }, verse: { chords: 1 }, chorus: { chords: 1, pad: 1, bass: 1, drums: 'mid' }, bridge: { chords: 1, pad: 1 }, outro: { chords: 1 } },
      lastChorus: 'high',
      ingredients: {
        drums: 'None in the verses; a soft kit enters in the chorus and grows.',
        bass: 'Long sustained roots, or just the piano left hand.',
        harmony: 'Broken piano chords; strings take over in the last chorus.',
        vocals: 'Natural tone, gentle tuning, a long plate reverb.',
        structure: 'Quiet, quiet, BIG: save the drums and strings for the end.',
        tip: 'Record the last chorus a bit louder: the arrangement will meet you there.'
      },
      lyrics: { verse: 'There is a light on in the hallway\nYou left it on for me', chorus: 'Hold on, hold on\nThe night is not that long' },
      starters: ['Someone you miss', 'A promise you kept', 'The quiet after a storm']
    },
    {
      id: 'futurebass', name: 'Future Bass', era: '2010s festival', bpm: 150, key: 11, scale: 'major', swing: 0, groove: 'future', kit: 'house909',
      blurb: 'Huge wobbling supersaw chords, chopped vocals and a half-time drop.',
      prog: { verse: [4, 5, 3, 6], chorus: [4, 5, 3, 6], intro: [4, 5, 3, 6] }, ext: '7',
      parts: [['drums', 'Festival kit', 'house909'], ['chords', 'Supersaw', 'supersaw', 'supersaw', 64], ['bass', 'Sub', 'subbass', 'sub'],
        ['hook', 'Pluck lead', 'pluck', 'hook', 5], ['pad', 'Pad', 'pad', 'pad', 60], ['voice', 'Vocals', 'hyper']],
      form: [['intro', 8, 'riser'], ['verse', 8, 'build'], ['drop', 16, 'riser'], ['bridge', 8, 'build'], ['drop', 16, 'none'], ['outro', 4, 'none']],
      levels: { intro: { pad: 1, hook: 1 }, verse: { pad: 1, bass: 1, drums: 'low', hook: 1 }, drop: { drums: 'high', chords: 1, bass: 1, hook: 1 }, bridge: { pad: 1 }, outro: { pad: 1 } },
      ingredients: {
        drums: 'Half-time drop: snare on 3, rolling hats, claps layered.',
        bass: 'A sub under the big chords.',
        harmony: 'Major 7th chords on a detuned supersaw with a rhythmic wobble.',
        vocals: 'Pitched-up, chopped, lots of tuning.',
        structure: 'Build, riser, drop, breakdown, second drop.',
        tip: 'Use the Riser transition into every drop.'
      },
      lyrics: { verse: 'Paper planes over the city', chorus: 'Oh-oh-oh, we are the colors' },
      starters: ['A festival sunset', 'Flying', 'The best friend you have']
    },
    {
      id: 'hyperpop', name: 'Hyperpop', era: '2020s internet', bpm: 160, key: 1, scale: 'major', swing: 0, groove: 'hyper', kit: 'trap808',
      blurb: 'Everything turned to 11: pitched-up voices, blown-out 808s, glittery synths.',
      prog: { verse: [1, 5, 6, 4], chorus: [4, 5, 6, 1], intro: [1, 5, 6, 4] },
      parts: [['drums', 'Glitch kit', 'trap808'], ['bass', 'Distorted 808', 'bass808', '808'], ['chords', 'Supersaw', 'supersaw', 'stab8', 64],
        ['hook', 'Chip lead', 'chip', 'hook', 6], ['voice', 'Vocals', 'hyper']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Fast, glitchy, with constant hat rolls and loud claps.',
        bass: 'An 808 pushed into distortion.',
        harmony: 'Pop chords on bright, chiptune-like synths.',
        vocals: 'Pitched up (Chipmunk), hard-tuned, doubled.',
        structure: 'Pop form, but things break: sudden stops, speed changes.',
        tip: 'Try Voice > Chipmunk with Hard tune together.'
      },
      lyrics: { verse: 'Glitter in my phone screen, pixel heart', chorus: 'Turn it up, turn it up, til it falls apart' },
      starters: ['An internet friendship', 'A video game world', 'Feeling everything at once']
    },
    {
      id: 'disco', name: 'Disco Funk', era: '1970s', bpm: 118, key: 7, scale: 'dorian', swing: 0.06, groove: 'disco', kit: 'acoustic',
      blurb: 'Four-on-the-floor, octave bass, string swells and a choppy funk guitar.',
      prog: { verse: [1, 4, 1, 4], chorus: [2, 5, 1, 6], intro: [1, 4, 1, 4] }, ext: '7',
      parts: [['drums', 'Disco kit', 'acoustic'], ['bass', 'Funk bass', 'bassguitar', 'funk'], ['chords', 'Funk guitar', 'cleanguitar', 'stab8', 64],
        ['pad', 'Strings', 'strings', 'pad', 64], ['hook', 'Brass', 'brass', 'hook', 5], ['voice', 'Vocals', 'pop']],
      form: POP_FORM, levels: POP_LEVELS,
      ingredients: {
        drums: 'Four-on-the-floor kick, open hats on the off-beat, a tambourine.',
        bass: 'Busy funk bass with octave jumps.',
        harmony: 'Dorian 7th chords, strings that swell into the chorus.',
        vocals: 'Soulful, with falsetto backing and echo.',
        structure: 'Groove intro, verse, chorus, an instrumental break.',
        tip: 'Mix > Auto-mix, then push the bass up a little.'
      },
      lyrics: { verse: 'Mirror ball is spinning slow', chorus: 'Get up, get down, the night is ours' },
      starters: ['A roller rink', 'Platform shoes and big hair', 'The last song of the night']
    },
    {
      id: 'boombap', name: 'Boom Bap', era: '1990s hip hop', bpm: 90, key: 9, scale: 'minor', swing: 0.18, groove: 'boombap', kit: 'acoustic',
      blurb: 'Hard kicks and snares with swing, a jazzy loop and space for words.',
      prog: { verse: [1, 4, 1, 5], chorus: [6, 7, 1, 1], intro: [1, 4, 1, 5] }, ext: '7',
      parts: [['drums', 'Break kit', 'acoustic'], ['bass', 'Bass', 'bassguitar', 'walk'], ['chords', 'Piano loop', 'piano', 'rhodes', 60],
        ['hook', 'Horn', 'brass', 'hook', 5], ['voice', 'Vocals', 'rap']],
      form: [['intro', 4, 'none'], ['verse', 16, 'drop'], ['chorus', 8, 'none'], ['verse', 16, 'drop'], ['chorus', 8, 'none'], ['outro', 4, 'none']],
      levels: { intro: { chords: 1, drums: 'low' }, verse: { drums: 'mid', bass: 1, chords: 1 }, chorus: { drums: 'high', bass: 1, chords: 1, hook: 1 }, outro: { chords: 1 } },
      ingredients: {
        drums: 'Kick-kick-snare with heavy swing, sampled-break feel.',
        bass: 'Walking or a simple root under the loop.',
        harmony: 'A dusty minor piano or horn loop.',
        vocals: 'Dry and upfront: no tuning, a little compression.',
        structure: '16-bar verses, 8-bar hooks.',
        tip: 'Keep the vocal dry: Voice > Natural with Space at zero.'
      },
      lyrics: { verse: 'Notebook full of what I never said\nNow I let it out instead', chorus: 'This is how we do it, from the ground' },
      starters: ['Where you come from', 'The first time you held a mic', 'A teacher who believed in you']
    }
  ];
  var BY_ID = {}; GENRES.forEach(function (g) { BY_ID[g.id] = g; });
  HB.genre = function (id) { return BY_ID[id] || BY_ID.hopecore; };

  // ------------------------------------------------------------------ the song document
  HB.SECTION_KINDS = [['intro', 'Intro'], ['verse', 'Verse'], ['pre', 'Pre-chorus'], ['chorus', 'Chorus'], ['bridge', 'Bridge'],
    ['drop', 'Drop'], ['solo', 'Solo'], ['outro', 'Outro']];
  HB.SECTION_NAMES = {}; HB.SECTION_KINDS.forEach(function (k) { HB.SECTION_NAMES[k[0]] = k[1]; });
  HB.TRANSITIONS = [
    ['none', 'Straight cut', 'The next section just starts.'],
    ['fill', 'Drum fill', 'A snare and tom fill in the last beat.'],
    ['build', 'Snare build', 'A snare roll that speeds up over 2 bars.'],
    ['riser', 'Riser', 'A whoosh of noise rising in pitch over 2 bars.'],
    ['sweep', 'Filter sweep', 'The whole mix gets muffled, then opens up.'],
    ['reverse', 'Reverse cymbal', 'A cymbal swell played backwards into the downbeat.'],
    ['drop', 'Beat drop', 'Everything stops for one beat, then hits back.'],
    ['impact', 'Impact', 'A deep boom and crash on the first beat of the next section.']
  ];
  HB.ROLE_COLOR = { drums: 0, bass: 1, chords: 2, pad: 3, hook: 4, lead: 5, voice: 6, melody: 4 };

  function blankFx(role) {
    var fx = { space: 0.12, echo: 0, drive: 0, low: 0, high: 0, punch: 0.25, tone: 1, wide: 0, lofi: 0 };
    if (role === 'pad') { fx.space = 0.45; fx.wide = 0.4; }
    if (role === 'hook' || role === 'lead') { fx.space = 0.3; fx.echo = 0.18; }
    if (role === 'voice') { fx.space = 0.25; fx.punch = 0.45; }
    if (role === 'drums') { fx.space = 0.06; fx.punch = 0.4; }
    return fx;
  }
  HB.blankFx = blankFx;

  HB.VOICE_DEFAULT = { preset: 'natural', tune: 0, speed: 0.5, pitch: 0, character: 0, harmony: 'none', double: 0, robot: 0 };

  function sectionsFor(recipe) {
    return recipe.form.map(function (f, i) {
      return { id: 's' + (i + 1), kind: f[0], name: HB.SECTION_NAMES[f[0]], bars: f[1], trans: f[2] };
    }).map(function (s, i, all) {  // number repeated kinds: Verse 1, Verse 2
      var same = all.filter(function (x) { return x.kind === s.kind; });
      if (same.length > 1) s.name = HB.SECTION_NAMES[s.kind] + ' ' + (same.indexOf(s) + 1);
      return s;
    });
  }

  // build one track's patterns + clips over the sections, linking clips of the same section kind to one pattern
  function buildPart(doc, recipe, track, role, style, octave, rand) {
    var patByKind = {}, start = 0, lastChorusIdx = -1;
    doc.sections.forEach(function (s, i) { if (s.kind === 'chorus') lastChorusIdx = i; });
    doc.sections.forEach(function (s, si) {
      var lv = (recipe.levels[s.kind] || {})[role === 'melody' ? 'hook' : role];
      if (si === lastChorusIdx && recipe.lastChorus && (role === 'drums')) lv = recipe.lastChorus;
      if (si === lastChorusIdx && recipe.lastChorus && !lv && role !== 'voice') lv = 1;
      if (lv) {
        var key = s.kind + ':' + lv, pat = patByKind[key];
        if (!pat) {
          var bars = Math.min(4, s.bars), p;
          if (role === 'drums') p = groovePattern(recipe.groove, lv === 1 ? 'mid' : lv, 2);
          else if (role === 'bass') p = bassPart(recipe, s.kind, bars, style, rand);
          else if (role === 'hook' || role === 'lead') p = hookPart(recipe, s.kind, bars, octave || 5, rand);
          else p = chordPart(recipe, s.kind, bars, style, octave || 60, rand);
          pat = HB.uid('p'); doc.patterns[pat] = p; patByKind[key] = pat;
          p.name = HB.SECTION_NAMES[s.kind] + ' ' + track.name.toLowerCase();
        }
        doc.clips.push({ id: HB.uid('c'), track: track.id, start: start, len: s.bars * 4, pat: pat });
      }
      start += s.bars * 4;
    });
  }

  HB.Doc = {
    fromRecipe: function (genreId, opts) {
      opts = opts || {};
      var recipe = HB.genre(genreId), seed = opts.seed || (Date.now() % 100000), rand = rng(seed);
      var r = HB.clone(recipe);
      if (typeof opts.key === 'number') r.key = opts.key;
      var doc = {
        v: 1, title: opts.title || recipe.name + ' song', genre: recipe.id, seed: seed, bpm: opts.bpm || recipe.bpm, key: r.key, scale: r.scale,
        swing: recipe.swing || 0, meter: 4, sections: sectionsFor(r), tracks: [], clips: [], patterns: {}, takes: {}, lyrics: {},
        master: { vol: 0.85 }, loop: null
      };
      if (opts.empty) {
        doc.sections = [{ id: 's1', kind: 'verse', name: 'Verse', bars: 8, trans: 'none' }, { id: 's2', kind: 'chorus', name: 'Chorus', bars: 8, trans: 'none' }];
      }
      var colorUsed = {};
      recipe.parts.forEach(function (p, i) {
        var role = p[0];
        if (opts.empty && role !== 'drums' && role !== 'voice') return;
        var col = HB.ROLE_COLOR[role] !== undefined ? HB.ROLE_COLOR[role] : i % 8;
        while (colorUsed[col]) col = (col + 1) % 8;
        colorUsed[col] = 1;
        var t = { id: 't' + (i + 1), name: p[1], role: role, kind: role === 'drums' ? 'drums' : role === 'voice' ? 'voice' : 'notes',
          inst: role === 'voice' ? 'voice' : p[2], color: col, vol: role === 'drums' ? 0.85 : role === 'pad' ? 0.55 : 0.72, pan: 0, mute: false, solo: false,
          fx: blankFx(role), oct: 0 };
        if (role === 'voice') { t.voice = HB.clone(HB.VOICE_DEFAULT); t.voice.preset = p[2]; t.vol = 0.9; }
        doc.tracks.push(t);
        if (role !== 'voice' && !opts.empty) buildPart(doc, r, t, role, p[3], p[4], rand);
        if (role === 'drums' && opts.empty) buildPart(doc, r, t, role, null, null, rand);
      });
      if (recipe.lyrics && !opts.empty) {
        var seen = {};
        doc.sections.forEach(function (s) {
          var txt = recipe.lyrics[s.kind];
          if (txt && !seen[s.kind]) { doc.lyrics[s.id] = txt; seen[s.kind] = 1; }
          else if (txt && s.kind === 'chorus') doc.lyrics[s.id] = txt;
        });
      }
      return doc;
    },
    // only the parts a section needs, for previews (the landing page and the Styles page)
    preview: function (genreId, kind) {
      var full = HB.Doc.fromRecipe(genreId, { seed: 7 });
      var chorus = full.sections.filter(function (s) { return s.kind === (kind || 'chorus'); })[0] || full.sections[1];
      var beat0 = 0; for (var i = 0; i < full.sections.length && full.sections[i] !== chorus; i++) beat0 += full.sections[i].bars * 4;
      full.loop = { a: beat0, b: beat0 + 16 };
      return full;
    },
    lengthBeats: function (doc) { return doc.sections.reduce(function (a, s) { return a + s.bars * 4; }, 0); },
    sectionAt: function (doc, beat) {
      var b = 0;
      for (var i = 0; i < doc.sections.length; i++) { var s = doc.sections[i], len = s.bars * 4; if (beat < b + len) return { s: s, start: b, index: i }; b += len; }
      return null;
    },
    sectionStart: function (doc, id) {
      var b = 0;
      for (var i = 0; i < doc.sections.length; i++) { if (doc.sections[i].id === id) return b; b += doc.sections[i].bars * 4; }
      return 0;
    },
    // regenerate the harmony parts (chords, pad, bass, hook) of one kind of section with a new progression
    setProgression: function (doc, kind, degrees, ext) {
      var recipe = HB.clone(HB.genre(doc.genre));
      recipe.key = doc.key; recipe.scale = doc.scale;
      recipe.prog = HB.clone(recipe.prog);
      recipe.prog[kind] = degrees.map(function (d) { return ext ? [d, ext] : d; });
      var rand = rng((doc.seed || 1) + degrees.join('').length * 31);
      var partInfo = {}; recipe.parts.forEach(function (p) { partInfo[p[0]] = p; });
      var changed = 0;
      doc.clips.forEach(function (c) {
        var sec = HB.Doc.sectionAt(doc, c.start + 0.01), tr = doc.tracks.filter(function (t) { return t.id === c.track; })[0];
        if (!sec || sec.s.kind !== kind || !tr || !c.pat || tr.kind !== 'notes') return;
        var info = partInfo[tr.role]; if (!info) return;
        var bars = Math.min(4, sec.s.bars), p;
        if (tr.role === 'bass') p = bassPart(recipe, kind, bars, info[3], rand);
        else if (tr.role === 'hook' || tr.role === 'lead') p = hookPart(recipe, kind, bars, info[4] || 5, rand);
        else if (tr.role === 'chords' || tr.role === 'pad') p = chordPart(recipe, kind, bars, info[3], info[4] || 60, rand);
        else return;
        p.name = (doc.patterns[c.pat] && doc.patterns[c.pat].name) || 'Part';
        doc.patterns[c.pat] = p; changed++;
      });
      doc.progs = doc.progs || {}; doc.progs[kind] = { deg: degrees, ext: ext || '' };
      return changed;
    },
    progression: function (doc, kind) {
      if (doc.progs && doc.progs[kind]) return doc.progs[kind];
      var g = HB.genre(doc.genre), p = g.prog[kind] || g.prog.verse;
      return { deg: p.map(function (c) { return typeof c === 'number' ? c : c[0]; }), ext: (typeof p[0] === 'number' ? g.ext : p[0][1]) || '' };
    },
    // a starter part for a track that has no clips yet, from the song's genre
    starterPart: function (doc, track, style) {
      var recipe = HB.clone(HB.genre(doc.genre)); recipe.key = doc.key; recipe.scale = doc.scale;
      if (doc.progs) Object.keys(doc.progs).forEach(function (k) { recipe.prog[k] = doc.progs[k].deg.map(function (d) { return doc.progs[k].ext ? [d, doc.progs[k].ext] : d; }); });
      var role = track.role || (track.kind === 'drums' ? 'drums' : 'chords');
      var all = {}; Object.keys(recipe.levels).forEach(function (k) { all[k] = HB.clone(recipe.levels[k]); all[k][role] = all[k][role] || (role === 'drums' ? 'mid' : 1); });
      recipe.levels = all;
      doc.clips = doc.clips.filter(function (c) { return c.track !== track.id; });
      var info = recipe.parts.filter(function (p) { return p[0] === role; })[0] || [role, track.name, track.inst, style || 'block', 60];
      buildPart(doc, recipe, track, role, style || info[3], info[4], rng(Date.now() % 99991));
    }
  };

  // ------------------------------------------------------------------ lyrics -> a sung melody (a guide to sing along)
  var WEAK = { a: 1, an: 1, the: 1, to: 1, of: 1, in: 1, on: 1, at: 1, and: 1, or: 1, but: 1, for: 1, i: 1, my: 1, me: 1, you: 1, your: 1,
    it: 1, its: 1, is: 1, am: 1, are: 1, was: 1, be: 1, we: 1, our: 1, us: 1, he: 1, she: 1, they: 1, them: 1, his: 1, her: 1, as: 1,
    with: 1, from: 1, by: 1, so: 1, if: 1, that: 1, this: 1, do: 1, im: 1, ill: 1, ive: 1 };
  // "together" -> [{s:'to', st:0}, {s:'ge', st:1}, {s:'ther', st:0}]: vowel groups, a stress guess
  function syllables(word) {
    var clean = word.toLowerCase().replace(/[^a-z']/g, ''), bare = clean.replace(/'/g, '');
    if (!bare) return [];
    var parts = [], DG = { th: '1', sh: '2', ch: '3', ph: '4', wh: '5', ck: '6', ng: '7', gh: '8', qu: '9' }, UNDG = {};
    Object.keys(DG).forEach(function (k) { UNDG[DG[k]] = k; });
    var coded = clean.replace(/th|sh|ch|ph|wh|ck|ng|gh|qu/g, function (m) { return DG[m]; });  // letter pairs that are one sound stay together
    // vowel pairs that are two syllables split first (pla-ying, ra-di-o, li-on)
    coded.replace(/([aeiou])(y[aeiou])/g, '$1|$2').replace(/([^ts]i)([aou])/g, '$1|$2').replace(/(e)(o)/g, '$1|$2').split('|').forEach(function (chunk) {
      (chunk.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/g) || [chunk]).forEach(function (x) { parts.push(x); });
    });
    parts = parts.filter(Boolean).map(function (x) { return x.replace(/[1-9]/g, function (c) { return UNDG[c]; }); });
    for (var q = parts.length - 1; q > 0; q--) if (!/[aeiouy]/.test(parts[q])) { parts[q - 1] += parts[q]; parts.splice(q, 1); }
    if (parts.length > 1 && /^[^aeiouy]*e$/.test(parts[parts.length - 1]) && !/le$/.test(clean)) { parts[parts.length - 2] += parts.pop(); }
    var out = parts.map(function (p) { return { s: p, st: 0 }; });
    if (out.length === 1) out[0].st = WEAK[bare] ? 0 : 1;
    else {
      var st = /^(be|re|de|a[bcdfglmnprstv]|un|to|for|com|con|ex)/.test(bare) ? 1 : 0;  // re-PEAT, a-BOUT, be-CAUSE
      if (/(tion|sion|ic|ity)$/.test(bare)) st = Math.max(0, out.length - 2);
      out[st].st = 1;
    }
    return out;
  }
  HB.syllables = syllables;

  // a melody for one section's words -> {kind:'notes', len, notes:[{t, d, p, v, w}]}, null if there are no words
  HB.melodyFromLyrics = function (doc, sectionId, opts) {
    opts = opts || {};
    var sec = doc.sections.filter(function (s) { return s.id === sectionId; })[0];
    var text = sec ? String((doc.lyrics || {})[sectionId] || '') : '';
    var lines = text.split('\n').map(function (l) { return l.replace(/\([^)]*\)/g, ' ').trim(); }).filter(Boolean);  // (ad-libs) aren't sung
    if (!sec || !lines.length) return null;
    var rand = rng((opts.seed || 1) * 7919 + text.length);
    var bars = Math.min(16, sec.bars), totalBeats = bars * 4;
    var linesUsed = lines.slice(0, Math.max(1, bars));
    var perLine = Math.max(4, Math.floor(bars / linesUsed.length) * 4);
    var prog = HB.Doc.progression(doc, sec.kind), key = doc.key || 0, scale = doc.scale === 'chromatic' ? 'major' : (doc.scale || 'major');
    var steps = T.steps(scale);
    var high = sec.kind === 'chorus' || sec.kind === 'drop' ? 2 : sec.kind === 'bridge' ? 1 : 0;   // choruses sit higher
    var base = opts.low ? 57 : 62;                                                                // the middle of the voice
    function degreeOf(m) { var rel = ((m - key) % 12 + 12) % 12, best = 0, bd = 99; steps.forEach(function (s, i) { var d = Math.abs(s - rel); if (d < bd) { bd = d; best = i; } }); return best; }
    function stepFrom(m, n) { var oct = Math.floor((m - key) / 12), d = degreeOf(m) + n; oct += Math.floor(d / steps.length); d = ((d % steps.length) + steps.length) % steps.length; return key + oct * 12 + steps[d]; }
    function chordTones(beat) {
      var c = prog.deg[Math.floor(beat / 4) % prog.deg.length] || 1;
      var tones = [0, 2, 4].map(function (k) { return T.degreeNote(key, scale, c + k, 4); }), out = [];
      for (var o = -12; o <= 12; o += 12) tones.forEach(function (t) { out.push(t + o); });
      return out;
    }
    function nearestTone(beat, target) { var best = null, bd = 99; chordTones(beat).forEach(function (t) { var d = Math.abs(t - target); if (d < bd) { bd = d; best = t; } }); return best; }
    var notes = [], prevEnd = null, UNDG_SAFE = function (w) { return w; };
    linesUsed.forEach(function (line, li) {
      var syl = []; line.split(/\s+/).forEach(function (w) { syllables(w).forEach(function (x) { syl.push(x); }); });
      if (!syl.length) return;
      var start = li * perLine, room = perLine - 1;                          // a beat to breathe before the next line
      var pickup = !syl[0].st && syl.length > 2 ? 0.5 : 0;                   // "and the NIGHT": unstressed words lead in
      var grid = (syl.length + 2) <= room * 0.7 ? 1 : (syl.length + 2) * 0.5 <= room ? 0.5 : 0.25;  // fill about 3/4 of the line
      var t = li === 0 ? start + pickup : start - pickup;     // later lines lead in during the breath before them
      var durs = syl.map(function (x, i) { return i === syl.length - 1 ? 0 : (x.st && grid <= 0.5 ? grid * 2 : grid); });
      var used = durs.reduce(function (a, b) { return a + b; }, 0);
      while (used > room - grid && durs.some(function (d) { return d > grid; })) {      // too long: shorten the long ones
        var j = durs.indexOf(Math.max.apply(null, durs)); durs[j] -= grid; used -= grid;
      }
      // put stressed syllables on beats where the line has time to spare
      var times = [], cur = t;
      syl.forEach(function (x, i) {
        if (x.st && i > 0 && cur % 1 !== 0 && cur + (1 - cur % 1) + (durs.slice(i).reduce(function (a, b) { return a + b; }, 0)) <= start + room) cur += 1 - cur % 1;
        times.push(cur); cur += durs[i];
      });
      var lastLen = Math.max(grid, Math.min(3, start + room - times[times.length - 1]));
      durs[syl.length - 1] = lastLen;
      // contour: odd lines arch (rise, then come down), even lines answer from above and settle; stresses land on chord tones
      var top = base + high * 2 + 3 + Math.floor(rand() * 3), low = base - 2 + high, last = syl.length - 1;
      var p = prevEnd;
      syl.forEach(function (x, i) {
        var pos = last ? i / last : 1;
        var c = li % 2 === 0 ? low + (top - low) * Math.sin(Math.PI * Math.min(1, pos * 1.15)) : top - (top - low) * Math.pow(pos, 0.8);
        if (i === last) c = li % 2 === 0 ? base + high : low;              // statements come home low, questions stay up
        var target = (x.st || i === last) ? nearestTone(times[i], c) : T.snap(c + (rand() - 0.5) * 2, key, scale);
        if (p !== null && Math.abs(target - p) > 7) target = target > p ? stepFrom(p, 3) : stepFrom(p, -3);   // no wild leaps
        if (!x.st && i < last && p !== null && rand() < 0.15) target = p;   // a repeated note sounds like speech
        p = Math.max(base - 7, Math.min(base + 12, target));
        notes.push({ t: Math.round(times[i] * 1000) / 1000, d: Math.max(0.2, durs[i] * 0.94), p: p, v: x.st ? 0.85 : 0.65, w: UNDG_SAFE(x.s) });
      });
      prevEnd = p;
    });
    notes = notes.filter(function (n) { return n.t >= 0 && n.t < totalBeats; });
    return { kind: 'notes', len: totalBeats, notes: notes, name: sec.name + ' melody', lines: linesUsed.length };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HB;
})(typeof window !== 'undefined' ? window : globalThis);
