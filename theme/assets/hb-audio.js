/* hb-audio.js: the sound engine (window.HB.audio). Every instrument and drum is synthesised with Web Audio (no
   samples to download or license): subtractive and FM synths, an additive piano and organ, Karplus-Strong plucked
   strings for guitars, an 808 with glides. Each track runs through its own effects chain (drive, tone, EQ, punch,
   wide, lo-fi, pan, volume) with sends to a shared reverb and a tempo-synced echo. A look-ahead scheduler plays the
   song document (hb-music.js), section transitions (fills, builds, risers, sweeps, drops) are generated on the fly,
   and the same graph renders offline into a WAV. MIDI export lives here too. */
(function (root) {
  'use strict';
  var HB = root.HB = root.HB || {};
  var T = HB.theory;

  // ------------------------------------------------------------------ instruments
  // cat: the gallery group; gm: General MIDI program for MIDI export; range: comfortable [low, high]
  var INST = HB.INSTRUMENTS = [
    { id: 'piano', name: 'Grand piano', cat: 'Keys', kind: 'piano', gm: 0, range: [36, 96] },
    { id: 'epiano', name: 'Electric piano', cat: 'Keys', kind: 'fm', ratio: 1, index: 1.6, idec: 0.9, a: 0.004, d: 1.6, s: 0.15, r: 0.35, tine: 0.12, gm: 4, range: [40, 88] },
    { id: 'organ', name: 'Organ', cat: 'Keys', kind: 'organ', gm: 16, range: [40, 88] },
    { id: 'musicbox', name: 'Music box', cat: 'Mallets', kind: 'fm', ratio: 5.19, index: 1.4, idec: 0.25, a: 0.002, d: 1.1, s: 0, r: 0.6, gm: 10, range: [60, 100] },
    { id: 'bell', name: 'Bells', cat: 'Mallets', kind: 'fm', ratio: 3.5, index: 2.2, idec: 0.6, a: 0.002, d: 1.8, s: 0, r: 0.8, gm: 14, range: [55, 96] },
    { id: 'marimba', name: 'Marimba', cat: 'Mallets', kind: 'fm', ratio: 4, index: 1.2, idec: 0.08, a: 0.002, d: 0.45, s: 0, r: 0.2, gm: 12, range: [48, 88] },
    { id: 'pad', name: 'Warm pad', cat: 'Synths', kind: 'sub', oscs: [['sawtooth', -9, 0, 0.35], ['sawtooth', 9, 0, 0.35], ['triangle', 0, -1, 0.3]], cut: 1800, q: 0.7, fenv: 600, fdec: 2, a: 0.6, d: 1.5, s: 0.8, r: 1.4, vib: [0.25, 6], gm: 89, range: [48, 84] },
    { id: 'strings', name: 'Strings', cat: 'Strings', kind: 'sub', oscs: [['sawtooth', -6, 0, 0.3], ['sawtooth', 7, 0, 0.3], ['sawtooth', 0, 1, 0.12]], cut: 3200, q: 0.5, fenv: 800, fdec: 1, a: 0.35, d: 0.8, s: 0.85, r: 0.8, vib: [5.2, 7], gm: 48, range: [40, 96] },
    { id: 'brass', name: 'Brass stabs', cat: 'Strings', kind: 'sub', oscs: [['sawtooth', -4, 0, 0.4], ['sawtooth', 5, 0, 0.4]], cut: 900, q: 1.2, fenv: 3200, fdec: 0.25, a: 0.02, d: 0.3, s: 0.6, r: 0.18, gm: 61, range: [48, 84] },
    { id: 'lead', name: 'Synth lead', cat: 'Synths', kind: 'sub', oscs: [['sawtooth', 0, 0, 0.45], ['square', 6, 0, 0.25]], cut: 2600, q: 2, fenv: 2000, fdec: 0.3, a: 0.01, d: 0.3, s: 0.7, r: 0.2, vib: [5.5, 10], glide: 0.04, gm: 81, range: [55, 96] },
    { id: 'chip', name: 'Chiptune', cat: 'Synths', kind: 'sub', oscs: [['square', 0, 0, 0.35]], cut: 9000, q: 0.3, fenv: 0, fdec: 0.1, a: 0.002, d: 0.1, s: 0.75, r: 0.05, gm: 80, range: [55, 100] },
    { id: 'supersaw', name: 'Supersaw', cat: 'Synths', kind: 'sub', oscs: [['sawtooth', -22, 0, 0.18], ['sawtooth', -9, 0, 0.18], ['sawtooth', 0, 0, 0.18], ['sawtooth', 10, 0, 0.18], ['sawtooth', 23, 0, 0.18]], cut: 5200, q: 0.6, fenv: 1500, fdec: 0.4, a: 0.008, d: 0.4, s: 0.75, r: 0.25, gm: 90, range: [48, 88] },
    { id: 'pluck', name: 'Synth pluck', cat: 'Synths', kind: 'sub', oscs: [['sawtooth', -5, 0, 0.35], ['square', 5, 0, 0.25]], cut: 600, q: 3, fenv: 5000, fdec: 0.12, a: 0.002, d: 0.25, s: 0.05, r: 0.15, gm: 84, range: [48, 96] },
    { id: 'stabsynth', name: 'Stab synth', cat: 'Synths', kind: 'sub', oscs: [['square', -7, 0, 0.3], ['sawtooth', 7, 0, 0.3]], cut: 1200, q: 4, fenv: 4200, fdec: 0.09, a: 0.002, d: 0.18, s: 0.2, r: 0.08, gm: 87, range: [48, 88] },
    { id: 'flute', name: 'Soft flute', cat: 'Winds', kind: 'sub', oscs: [['sine', 0, 0, 0.6], ['triangle', 3, 1, 0.08]], cut: 4000, q: 0.3, fenv: 0, fdec: 0.1, a: 0.06, d: 0.2, s: 0.85, r: 0.18, vib: [5, 14], breath: 0.05, gm: 73, range: [60, 96] },
    { id: 'choir', name: 'Choir "aah"', cat: 'Voices', kind: 'choir', gm: 52, range: [48, 79] },
    { id: 'acoustic', name: 'Acoustic guitar', cat: 'Guitars', kind: 'ks', decay: 2.4, bright: 0.75, body: 1, gm: 25, range: [40, 84] },
    { id: 'cleanguitar', name: 'Clean electric', cat: 'Guitars', kind: 'ks', decay: 1.6, bright: 0.55, body: 0.4, gm: 27, range: [40, 86] },
    { id: 'distguitar', name: 'Distorted guitar', cat: 'Guitars', kind: 'ks', decay: 2.2, bright: 0.6, dist: 28, cab: 1, gm: 30, range: [28, 76] },
    { id: 'leadguitar', name: 'Screaming lead', cat: 'Guitars', kind: 'ks', decay: 3, bright: 0.85, dist: 60, cab: 1, sustain: 1, gm: 29, range: [52, 96] },
    { id: 'harp', name: 'Harp', cat: 'Strings', kind: 'ks', decay: 2.8, bright: 0.45, body: 0.6, gm: 46, range: [36, 96] },
    { id: 'bassguitar', name: 'Bass guitar', cat: 'Bass', kind: 'ks', decay: 1.6, bright: 0.35, bass: 1, gm: 33, range: [28, 60] },
    { id: 'synthbass', name: 'Synth bass', cat: 'Bass', kind: 'sub', oscs: [['sawtooth', 0, 0, 0.5], ['square', -5, -1, 0.3]], cut: 380, q: 5, fenv: 1800, fdec: 0.14, a: 0.003, d: 0.2, s: 0.55, r: 0.06, gm: 38, range: [24, 55] },
    { id: 'bass808', name: '808 bass', cat: 'Bass', kind: 'b808', mono: 1, gm: 38, range: [24, 52] },
    { id: 'subbass', name: 'Sub bass', cat: 'Bass', kind: 'sub', oscs: [['sine', 0, 0, 0.8], ['triangle', 0, 0, 0.15]], cut: 600, q: 0.4, fenv: 0, fdec: 0.1, a: 0.02, d: 0.3, s: 0.9, r: 0.25, gm: 38, range: [24, 52] },
    { id: 'logdrum', name: 'Log drum', cat: 'Bass', kind: 'fm', ratio: 1.5, index: 2.4, idec: 0.05, a: 0.002, d: 0.5, s: 0, r: 0.15, pitchDrop: 1, gm: 116, range: [36, 64] }
  ];
  var INST_BY = {}; INST.forEach(function (i) { INST_BY[i.id] = i; });
  HB.inst = function (id) { return INST_BY[id] || INST_BY.piano; };
  HB.INST_CATS = ['Keys', 'Guitars', 'Strings', 'Synths', 'Bass', 'Mallets', 'Winds', 'Voices'];

  // drum kits: one set of synth settings per lane
  var KITS = HB.KITS = {
    acoustic: { name: 'Acoustic band', kick: { f0: 120, f1: 50, dec: 0.32, click: 0.35 }, snare: { tone: 200, nf: 1600, dec: 0.2, toneAmt: 0.45 }, clap: {}, hat: { f: 7600, dec: 0.05 }, open: { f: 7000, dec: 0.32 }, tom: { f: 110 }, crash: { dec: 1.4 }, perc: { kind: 'shaker' } },
    rock: { name: 'Rock', kick: { f0: 130, f1: 48, dec: 0.36, click: 0.6 }, snare: { tone: 190, nf: 1400, dec: 0.28, toneAmt: 0.55, room: 0.35 }, clap: {}, hat: { f: 7000, dec: 0.06 }, open: { f: 6500, dec: 0.4 }, tom: { f: 100 }, crash: { dec: 1.8 }, perc: { kind: 'ride' } },
    metal: { name: 'Metal', kick: { f0: 190, f1: 56, dec: 0.16, click: 1 }, snare: { tone: 230, nf: 2000, dec: 0.18, toneAmt: 0.5 }, clap: {}, hat: { f: 8000, dec: 0.04 }, open: { f: 7000, dec: 0.3 }, tom: { f: 120 }, crash: { dec: 1.6 }, perc: { kind: 'ride' } },
    trap808: { name: '808 trap', kick: { f0: 170, f1: 44, dec: 0.55, click: 0.2, drive: 0.4 }, snare: { tone: 240, nf: 2600, dec: 0.16, toneAmt: 0.3 }, clap: { bright: 1 }, hat: { f: 9500, dec: 0.03 }, open: { f: 8000, dec: 0.22 }, tom: { f: 140 }, crash: { dec: 1.2 }, perc: { kind: 'rim' } },
    house909: { name: '909 house', kick: { f0: 210, f1: 48, dec: 0.42, click: 0.45 }, snare: { tone: 210, nf: 3000, dec: 0.18, toneAmt: 0.35 }, clap: {}, hat: { f: 9000, dec: 0.04, metal: 1 }, open: { f: 8500, dec: 0.28, metal: 1 }, tom: { f: 130 }, crash: { dec: 1.3 }, perc: { kind: 'rim' } },
    gated80s: { name: 'Gated 80s', kick: { f0: 140, f1: 46, dec: 0.38, click: 0.4 }, snare: { tone: 180, nf: 1300, dec: 0.5, toneAmt: 0.5, gate: 0.3 }, clap: {}, hat: { f: 8200, dec: 0.04, metal: 1 }, open: { f: 7800, dec: 0.3, metal: 1 }, tom: { f: 95, gate: 1 }, crash: { dec: 1.4 }, perc: { kind: 'tamb' } },
    pop: { name: 'Pop', kick: { f0: 160, f1: 47, dec: 0.4, click: 0.5 }, snare: { tone: 220, nf: 2200, dec: 0.2, toneAmt: 0.4 }, clap: { bright: 1 }, hat: { f: 8800, dec: 0.035 }, open: { f: 8000, dec: 0.25 }, tom: { f: 120 }, crash: { dec: 1.3 }, perc: { kind: 'shaker' } },
    lofi: { name: 'Dusty lo-fi', kick: { f0: 100, f1: 48, dec: 0.3, click: 0.1 }, snare: { tone: 180, nf: 1100, dec: 0.16, toneAmt: 0.4 }, clap: {}, hat: { f: 5000, dec: 0.04 }, open: { f: 5000, dec: 0.2 }, tom: { f: 100 }, crash: { dec: 1 }, perc: { kind: 'rim' }, lp: 3800, crackle: 1 },
    brush: { name: 'Brushes', kick: { f0: 90, f1: 48, dec: 0.3, click: 0.05, soft: 1 }, snare: { brush: 1, dec: 0.28 }, clap: {}, hat: { f: 6000, dec: 0.08, soft: 1 }, open: { f: 6000, dec: 0.4, soft: 1 }, tom: { f: 90 }, crash: { dec: 2 }, perc: { kind: 'rim', soft: 1 }, lp: 9000 },
    afro: { name: 'Afro percussion', kick: { f0: 110, f1: 50, dec: 0.3, click: 0.2 }, snare: { tone: 300, nf: 2400, dec: 0.1, toneAmt: 0.5 }, clap: {}, hat: { f: 8000, dec: 0.03 }, open: { f: 7500, dec: 0.2 }, tom: { f: 210, conga: 1 }, crash: { dec: 1.1 }, perc: { kind: 'shaker' } }
  };
  HB.KIT_LIST = Object.keys(KITS).map(function (k) { return { id: k, name: KITS[k].name }; });
  HB.kit = function (id) { return KITS[id] || KITS.acoustic; };
  var GM_DRUM = { kick: 36, snare: 38, clap: 39, hat: 42, open: 46, tom: 45, crash: 49, perc: 37 };

  // ------------------------------------------------------------------ shared buffers + curves
  var _noise = new WeakMap(), _ir = new WeakMap(), _ks = {}, _curves = {};
  function noise(ctx) {
    var b = _noise.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      var d = b.getChannelData(0), s = 12345;
      for (var i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
      _noise.set(ctx, b);
    }
    return b;
  }
  function impulse(ctx) {
    var b = _ir.get(ctx);
    if (!b) {
      var sr = ctx.sampleRate, len = Math.floor(sr * 2.8);
      b = ctx.createBuffer(2, len, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = b.getChannelData(ch), s = 777 + ch * 99, lp = 0;
        for (var i = 0; i < len; i++) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          var n = s / 0x3fffffff - 1, t = i / sr;
          lp += (n - lp) * (0.55 - 0.4 * Math.min(1, t / 2.4));  // darker as it decays
          var env = Math.pow(1 - i / len, 2.2) * (t < 0.012 ? t / 0.012 : 1);
          d[i] = lp * env * 0.9;
        }
      }
      _ir.set(ctx, b);
    }
    return b;
  }
  function curve(kind, amount) {
    var key = kind + ':' + Math.round(amount * 100) / 100;
    if (_curves[key]) return _curves[key];
    var n = 2048, c = new Float32Array(n), i, x;
    if (kind === 'drive') {
      var k = 1 + amount * 60;
      for (i = 0; i < n; i++) { x = i * 2 / n - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    } else if (kind === 'crush') {
      var steps = Math.pow(2, Math.max(2, 9 - amount * 6));
      for (i = 0; i < n; i++) { x = i * 2 / n - 1; c[i] = Math.round(x * steps) / steps; }
    } else {
      for (i = 0; i < n; i++) { x = i * 2 / n - 1; c[i] = Math.max(-1, Math.min(1, x * (1 + amount))); }
    }
    _curves[key] = c;
    return c;
  }

  // Karplus-Strong plucked string, cached per instrument + note + sample rate
  function ksBuffer(ctx, inst, midi) {
    var key = inst.id + ':' + midi + ':' + ctx.sampleRate;
    if (_ks[key]) return _ks[key];
    var sr = ctx.sampleRate, f = T.freq(midi), N = sr / f, len = Math.floor(sr * Math.min(4, inst.decay || 2));
    var buf = ctx.createBuffer(1, len, sr), y = buf.getChannelData(0);
    var bright = inst.bright || 0.5, damp = 0.5 - 0.25 * bright;  // the loop filter's delay is `damp` samples
    var p = Math.max(2, Math.floor(N - damp));
    var s = midi * 7919 + 17, lp = 0;
    for (var i = 0; i <= p; i++) {  // the pluck: noise, low-passed by how bright the string is
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      var n = s / 0x3fffffff - 1;
      lp += (n - lp) * (0.25 + 0.7 * bright);
      y[i] = lp;
    }
    var fb = Math.pow(0.001, 1 / (f * (inst.decay || 2)));  // decay to -60 dB over `decay` seconds
    if (inst.sustain) fb = Math.min(0.99995, fb * 1.0004);
    for (var j = p + 1; j < len; j++) y[j] = fb * ((1 - damp) * y[j - p] + damp * y[j - p - 1]);
    var peak = 0; for (var k = 0; k < len; k++) peak = Math.max(peak, Math.abs(y[k]));
    if (peak > 0) for (k = 0; k < len; k++) y[k] /= peak;
    buf._rate = (p + damp) / N;  // play slightly faster/slower so the pitch is exact
    _ks[key] = buf;
    return buf;
  }

  // ------------------------------------------------------------------ note voices
  function env(g, t, peak, a, d, s, end, r) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.max(0.001, a));
    g.gain.setTargetAtTime(Math.max(0.0001, peak * s), t + a, Math.max(0.01, d / 3));
    g.gain.setTargetAtTime(0.0001, Math.max(end, t + a), Math.max(0.01, r / 4));
  }

  function playNote(ctx, out, inst, midi, t, dur, vel, opts) {
    opts = opts || {};
    var f = T.freq(midi), end = t + dur, g = ctx.createGain(), nodes = [], stopAt;
    g.connect(out);
    vel = Math.max(0.05, Math.min(1, vel || 0.8));
    if (inst.kind === 'sub' || inst.kind === 'choir') {
      var spec = inst.kind === 'choir' ? { oscs: [['sawtooth', -8, 0, 0.3], ['sawtooth', 8, 0, 0.3]], a: 0.25, d: 0.5, s: 0.85, r: 0.6, vib: [5, 9] } : inst;
      var filt;
      if (inst.kind === 'choir') {  // three formant filters ("aah")
        filt = ctx.createGain();
        [[800, 6, 1], [1150, 8, 0.5], [2900, 10, 0.25]].forEach(function (fm) {
          var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = fm[1];
          var bg = ctx.createGain(); bg.gain.value = fm[2] * 2.2; filt.connect(bp); bp.connect(bg); bg.connect(g);
        });
      } else {
        filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = spec.q || 0.7;
        var base = Math.min(18000, spec.cut + f * 0.6);
        filt.frequency.setValueAtTime(base, t);
        if (spec.fenv) {
          filt.frequency.setValueAtTime(Math.min(18000, base + spec.fenv * vel), t);
          filt.frequency.setTargetAtTime(base, t + 0.005, Math.max(0.02, spec.fdec / 3));
        }
        filt.connect(g);
      }
      var vibLfo = null;
      if (spec.vib) {
        vibLfo = ctx.createOscillator(); vibLfo.frequency.value = spec.vib[0];
        var vg = ctx.createGain(); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(spec.vib[1], t + 0.4);
        vibLfo.connect(vg); vibLfo.start(t); nodes.push(vibLfo);
        vibLfo._g = vg;
      }
      spec.oscs.forEach(function (o) {
        var osc = ctx.createOscillator(); osc.type = o[0];
        var target = f * Math.pow(2, o[2]);
        if (opts.from && spec.glide !== undefined) { osc.frequency.setValueAtTime(T.freq(opts.from) * Math.pow(2, o[2]), t); osc.frequency.exponentialRampToValueAtTime(target, t + (spec.glide || 0.05)); }
        else osc.frequency.setValueAtTime(target, t);
        osc.detune.value = o[1];
        if (vibLfo) vibLfo._g.connect(osc.detune);
        var og = ctx.createGain(); og.gain.value = o[3];
        osc.connect(og); og.connect(filt); osc.start(t); nodes.push(osc);
      });
      if (spec.breath) {
        var nb = ctx.createBufferSource(); nb.buffer = noise(ctx); nb.loop = true;
        var nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = f * 2; nbp.Q.value = 2;
        var nbg = ctx.createGain(); nbg.gain.value = spec.breath;
        nb.connect(nbp); nbp.connect(nbg); nbg.connect(g); nb.start(t, Math.random()); nodes.push(nb);
      }
      env(g, t, vel * 0.32, spec.a, spec.d, spec.s, end, spec.r);
      stopAt = end + spec.r + 0.2;
    } else if (inst.kind === 'fm') {
      var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      var startF = inst.pitchDrop ? f * 1.5 : f;
      car.frequency.setValueAtTime(startF, t);
      if (inst.pitchDrop) car.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      mod.frequency.value = f * inst.ratio;
      mg.gain.setValueAtTime(f * inst.index * (0.5 + vel), t);
      mg.gain.setTargetAtTime(f * inst.index * 0.08, t, inst.idec / 3);
      mod.connect(mg); mg.connect(car.frequency); car.connect(g);
      car.start(t); mod.start(t); nodes.push(car, mod);
      if (inst.tine) {  // the bell-like tine of an electric piano
        var tine = ctx.createOscillator(), tg = ctx.createGain(); tine.frequency.value = f * 7.1;
        tg.gain.setValueAtTime(inst.tine * vel, t); tg.gain.setTargetAtTime(0.0001, t, 0.05);
        tine.connect(tg); tg.connect(g); tine.start(t); nodes.push(tine);
      }
      env(g, t, vel * 0.42, inst.a, inst.d, inst.s, end, inst.r);
      stopAt = end + inst.r + 0.3;
    } else if (inst.kind === 'piano') {
      var lpP = ctx.createBiquadFilter(); lpP.type = 'lowpass';
      lpP.frequency.setValueAtTime(Math.min(16000, 1500 + f * 6 * (0.5 + vel)), t);
      lpP.frequency.setTargetAtTime(800 + f * 2, t, 0.6);
      lpP.connect(g);
      var decay = Math.max(0.8, 5 - (midi - 40) * 0.06);
      [[1, 1, 1], [2, 0.42, 0.7], [3, 0.2, 0.5], [4, 0.1, 0.35], [5, 0.05, 0.25]].forEach(function (pr) {
        var o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = f * pr[0] * Math.sqrt(1 + 0.0004 * pr[0] * pr[0]);
        o.detune.value = (pr[0] === 1 ? 0 : 1.5);
        var og = ctx.createGain(); og.gain.setValueAtTime(pr[1], t); og.gain.setTargetAtTime(pr[1] * 0.25, t + 0.01, decay * pr[2] / 4);
        o.connect(og); og.connect(lpP); o.start(t); nodes.push(o);
      });
      var hn = ctx.createBufferSource(); hn.buffer = noise(ctx);
      var hf = ctx.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = Math.min(9000, f * 4); hf.Q.value = 1.5;
      var hg = ctx.createGain(); hg.gain.setValueAtTime(0.06 * vel, t); hg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      hn.connect(hf); hf.connect(hg); hg.connect(g); hn.start(t, Math.random(), 0.05); nodes.push(hn);
      g.gain.setValueAtTime(vel * 0.3, t);
      g.gain.setTargetAtTime(vel * 0.06, t + 0.02, decay / 3);
      g.gain.setTargetAtTime(0.0001, end, 0.12);
      stopAt = end + 0.8;
    } else if (inst.kind === 'organ') {
      [[0.5, 0.25], [1, 0.4], [2, 0.3], [3, 0.12], [4, 0.1], [6, 0.05]].forEach(function (db) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * db[0];
        var og = ctx.createGain(); og.gain.value = db[1];
        o.connect(og); og.connect(g); o.start(t); nodes.push(o);
      });
      env(g, t, vel * 0.28, 0.01, 0.1, 1, end, 0.08);
      stopAt = end + 0.2;
    } else if (inst.kind === 'ks') {
      var src = ctx.createBufferSource(); src.buffer = ksBuffer(ctx, inst, midi); src.playbackRate.value = src.buffer._rate || 1;
      if (opts.from && inst.sustain) { src.detune.setValueAtTime((opts.from - midi) * 100, t); src.detune.linearRampToValueAtTime(0, t + 0.06); }
      var chainIn = src;
      if (inst.dist) {
        var pre = ctx.createGain(); pre.gain.value = 1;
        var ws = ctx.createWaveShaper(); ws.curve = curve('drive', inst.dist / 60); ws.oversample = '2x';
        var cab = ctx.createBiquadFilter(); cab.type = 'lowpass'; cab.frequency.value = 3800; cab.Q.value = 0.9;
        var mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 900; mid.gain.value = 4; mid.Q.value = 1;
        src.connect(pre); pre.connect(ws); ws.connect(mid); mid.connect(cab); chainIn = cab;
      } else if (inst.bass) {
        var bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 1400; src.connect(bl); chainIn = bl;
      } else if (inst.body) {
        var bp2 = ctx.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 220; bp2.gain.value = 4 * inst.body; bp2.Q.value = 1;
        src.connect(bp2); chainIn = bp2;
      }
      chainIn.connect(g);
      var pk = vel * (inst.dist ? 0.22 : inst.bass ? 0.6 : 0.42);
      g.gain.setValueAtTime(pk, t);
      g.gain.setTargetAtTime(0.0001, end, inst.dist ? 0.04 : 0.09);
      src.start(t); nodes.push(src);
      stopAt = end + 0.5;
    } else if (inst.kind === 'b808') {
      var o8 = ctx.createOscillator(); o8.type = 'sine';
      var from = opts.from ? T.freq(opts.from) : f * 2.2;
      o8.frequency.setValueAtTime(from, t);
      o8.frequency.exponentialRampToValueAtTime(f, t + (opts.from ? 0.09 : 0.035));
      var sat = ctx.createWaveShaper(); sat.curve = curve('drive', 0.12);
      o8.connect(sat); sat.connect(g); o8.start(t); nodes.push(o8);
      g.gain.setValueAtTime(vel * 0.85, t);
      g.gain.setTargetAtTime(vel * 0.5, t + 0.05, 0.6);
      g.gain.setTargetAtTime(0.0001, end, 0.05);
      stopAt = end + 0.3;
    }
    nodes.forEach(function (n) { try { n.stop(stopAt); } catch (e) {} });
    return { gain: g, nodes: nodes, end: stopAt, cut: function (when) {
      try { g.gain.cancelScheduledValues(when); g.gain.setTargetAtTime(0.0001, when, 0.015); nodes.forEach(function (n) { n.stop(when + 0.1); }); } catch (e) {}
    } };
  }

  // ------------------------------------------------------------------ drums
  function hitNoise(ctx, out, t, dur, type, freq, q, gain, decay) {
    var n = ctx.createBufferSource(); n.buffer = noise(ctx);
    var fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q || 0.7;
    var g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    n.connect(fl); fl.connect(g); g.connect(out); n.start(t, Math.random() * 1.5, dur + 0.05);
    return g;
  }
  function playDrum(ctx, out, kitId, lane, t, vel, extra) {
    var k = HB.kit(kitId), p = k[lane] || {}, v = Math.max(0.05, Math.min(1, vel || 0.8)), o, g;
    if (lane === 'kick') {
      o = ctx.createOscillator(); o.type = 'sine'; g = ctx.createGain();
      o.frequency.setValueAtTime(p.f0, t); o.frequency.exponentialRampToValueAtTime(p.f1, t + 0.07);
      g.gain.setValueAtTime(v * (p.soft ? 0.6 : 1), t); g.gain.exponentialRampToValueAtTime(0.0001, t + p.dec);
      if (p.drive) { var ws = ctx.createWaveShaper(); ws.curve = curve('drive', p.drive); o.connect(ws); ws.connect(g); } else o.connect(g);
      g.connect(out); o.start(t); o.stop(t + p.dec + 0.05);
      if (p.click) hitNoise(ctx, out, t, 0.01, 'highpass', 3000, 0.7, v * 0.25 * p.click, 0.012);
    } else if (lane === 'snare') {
      if (p.brush) { hitNoise(ctx, out, t, p.dec, 'lowpass', 3500, 0.5, v * 0.28, p.dec); return; }
      o = ctx.createOscillator(); o.type = 'triangle'; g = ctx.createGain();
      o.frequency.setValueAtTime(p.tone * 1.3, t); o.frequency.exponentialRampToValueAtTime(p.tone, t + 0.03);
      g.gain.setValueAtTime(v * p.toneAmt, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15);
      if (p.gate) {  // 80s gated reverb: a big noise tail cut off hard
        var gn = hitNoise(ctx, out, t, p.gate + 0.05, 'bandpass', p.nf, 0.5, v * 0.55, p.dec);
        gn.gain.setValueAtTime(v * 0.25, t + p.gate - 0.01); gn.gain.linearRampToValueAtTime(0.0001, t + p.gate + 0.015);
      } else hitNoise(ctx, out, t, p.dec, 'highpass', p.nf, 0.6, v * 0.5, p.dec);
      if (p.room) hitNoise(ctx, out, t + 0.012, 0.4, 'bandpass', 900, 0.4, v * p.room * 0.4, 0.35);
    } else if (lane === 'clap') {
      for (var i = 0; i < 3; i++) hitNoise(ctx, out, t + i * 0.011, 0.02, 'bandpass', p.bright ? 1800 : 1200, 1.2, v * 0.45, 0.02 + i * 0.004);
      hitNoise(ctx, out, t + 0.033, 0.25, 'bandpass', p.bright ? 1600 : 1100, 0.8, v * 0.35, 0.2);
    } else if (lane === 'hat' || lane === 'open') {
      var dec = (extra && extra.dec) || p.dec;
      if (p.metal) {
        g = ctx.createGain(); var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = p.f;
        [2, 3, 4.16, 5.43, 6.79, 8.21].forEach(function (r) {
          var m = ctx.createOscillator(); m.type = 'square'; m.frequency.value = 40 * r * 7.1; m.connect(hp); m.start(t); m.stop(t + dec + 0.05);
        });
        g.gain.setValueAtTime(v * 0.08, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        hp.connect(g); g.connect(out);
      } else hitNoise(ctx, out, t, dec, 'highpass', p.f, 0.8, v * (p.soft ? 0.12 : 0.22), dec);
    } else if (lane === 'tom') {
      var pf = p.f * (extra && extra.pitch ? extra.pitch : 1);
      o = ctx.createOscillator(); o.type = 'sine'; g = ctx.createGain();
      o.frequency.setValueAtTime(pf * (p.conga ? 1.15 : 1.4), t); o.frequency.exponentialRampToValueAtTime(pf, t + 0.06);
      var td = p.conga ? 0.18 : 0.4;
      g.gain.setValueAtTime(v * 0.7, t); g.gain.exponentialRampToValueAtTime(0.0001, t + td);
      if (p.gate) { g.gain.setValueAtTime(v * 0.4, t + 0.22); g.gain.linearRampToValueAtTime(0.0001, t + 0.24); }
      o.connect(g); g.connect(out); o.start(t); o.stop(t + td + 0.05);
      if (p.conga) hitNoise(ctx, out, t, 0.02, 'bandpass', 2500, 1, v * 0.12, 0.02);
    } else if (lane === 'crash') {
      hitNoise(ctx, out, t, p.dec, 'highpass', 4200, 0.4, v * 0.22, p.dec);
      hitNoise(ctx, out, t, p.dec * 0.6, 'bandpass', 7000, 2, v * 0.1, p.dec * 0.6);
    } else if (lane === 'perc') {
      var kind = p.kind;
      if (kind === 'rim') {
        o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700; g = ctx.createGain();
        g.gain.setValueAtTime(v * (p.soft ? 0.18 : 0.35), t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.05);
        hitNoise(ctx, out, t, 0.01, 'highpass', 5000, 0.7, v * 0.1, 0.01);
      } else if (kind === 'shaker') hitNoise(ctx, out, t, 0.06, 'bandpass', 6500, 1.2, v * 0.16, 0.05);
      else if (kind === 'tamb') { hitNoise(ctx, out, t, 0.12, 'highpass', 8000, 1, v * 0.16, 0.1); hitNoise(ctx, out, t, 0.12, 'bandpass', 5200, 6, v * 0.1, 0.1); }
      else if (kind === 'ride') {
        hitNoise(ctx, out, t, 0.6, 'bandpass', 5200, 3, v * 0.12, 0.6);
        o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 3400; g = ctx.createGain();
        g.gain.setValueAtTime(v * 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45);
      } else {
        [540, 800].forEach(function (fq) {
          var c = ctx.createOscillator(); c.type = 'square'; c.frequency.value = fq; var cg = ctx.createGain();
          cg.gain.setValueAtTime(v * 0.08, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); c.connect(cg); cg.connect(out); c.start(t); c.stop(t + 0.2);
        });
      }
    }
  }

  // ------------------------------------------------------------------ the graph: tracks, buses, master
  function makeTrack(ctx, graph, tr) {
    var c = { id: tr.id };
    c.input = ctx.createGain();
    c.drive = ctx.createWaveShaper(); c.driveGain = ctx.createGain();
    c.tone = ctx.createBiquadFilter(); c.tone.type = 'lowpass'; c.tone.Q.value = 0.5;
    c.low = ctx.createBiquadFilter(); c.low.type = 'lowshelf'; c.low.frequency.value = 180;
    c.high = ctx.createBiquadFilter(); c.high.type = 'highshelf'; c.high.frequency.value = 5000;
    c.comp = ctx.createDynamicsCompressor(); c.comp.attack.value = 0.008; c.comp.release.value = 0.15; c.comp.knee.value = 8;
    c.dry = ctx.createGain(); c.crushIn = ctx.createGain(); c.crush = ctx.createWaveShaper(); c.crushLp = ctx.createBiquadFilter(); c.crushLp.type = 'lowpass'; c.crushLp.frequency.value = 3200;
    c.lofiOut = ctx.createGain();
    c.chorusDelay = ctx.createDelay(0.05); c.chorusDelay.delayTime.value = 0.014; c.chorusWet = ctx.createGain();
    c.lfo = ctx.createOscillator(); c.lfo.frequency.value = 0.7; c.lfoGain = ctx.createGain(); c.lfoGain.gain.value = 0.004;
    c.lfo.connect(c.lfoGain); c.lfoGain.connect(c.chorusDelay.delayTime); c.lfo.start();
    c.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    c.vol = ctx.createGain(); c.mute = ctx.createGain();
    c.space = ctx.createGain(); c.echo = ctx.createGain();
    c.input.connect(c.drive); c.drive.connect(c.driveGain); c.driveGain.connect(c.tone); c.tone.connect(c.low); c.low.connect(c.high); c.high.connect(c.comp);
    c.comp.connect(c.dry); c.dry.connect(c.lofiOut);
    c.comp.connect(c.crushIn); c.crushIn.connect(c.crush); c.crush.connect(c.crushLp); c.crushLp.connect(c.lofiOut);
    c.lofiOut.connect(c.pan); c.lofiOut.connect(c.chorusDelay); c.chorusDelay.connect(c.chorusWet); c.chorusWet.connect(c.pan);
    c.pan.connect(c.vol); c.vol.connect(c.mute);
    c.mute.connect(tr.kind === 'voice' ? graph.voiceBus : graph.musicBus);
    c.mute.connect(c.space); c.space.connect(graph.reverb);
    c.mute.connect(c.echo); c.echo.connect(graph.delay);
    if (tr.kind === 'drums') {
      c.kitLp = ctx.createBiquadFilter(); c.kitLp.type = 'lowpass'; c.kitLp.frequency.value = 20000;
      c.kitLp.connect(c.input); c.out = c.kitLp;
    } else c.out = c.input;
    c.mono = null; c.last = null;
    graph.tracks[tr.id] = c;
    return c;
  }

  function setTrack(ctx, c, tr, anySolo, now) {
    var fx = tr.fx || HB.blankFx(tr.role), s = function (param, v) { param.setTargetAtTime(v, now, 0.02); };
    var drive = Math.max(0, Math.min(1, fx.drive || 0));
    if (c._drive !== drive) { c.drive.curve = drive > 0.01 ? curve('drive', drive) : null; c._drive = drive; }
    s(c.driveGain.gain, 1 / (1 + drive * 1.6));
    s(c.tone.frequency, 160 * Math.pow(125, Math.max(0, Math.min(1, fx.tone === undefined ? 1 : fx.tone))));
    s(c.low.gain, (fx.low || 0) * 12); s(c.high.gain, (fx.high || 0) * 12);
    var punch = fx.punch || 0;
    s(c.comp.threshold, -6 - punch * 30); s(c.comp.ratio, 1 + punch * 7);
    var lofi = Math.max(0, Math.min(1, fx.lofi || 0));
    if (c._lofi !== lofi) { c.crush.curve = curve('crush', lofi); c._lofi = lofi; }
    s(c.dry.gain, 1 - lofi); s(c.crushIn.gain, lofi);
    s(c.crushLp.frequency, 6000 - lofi * 3600);
    s(c.chorusWet.gain, (fx.wide || 0) * 0.8);
    if (c.pan.pan) s(c.pan.pan, Math.max(-1, Math.min(1, tr.pan || 0)));
    s(c.vol.gain, Math.max(0, Math.min(1.4, tr.vol === undefined ? 0.8 : tr.vol)));
    var audible = !tr.mute && (!anySolo || tr.solo);
    s(c.mute.gain, audible ? 1 : 0);
    s(c.space.gain, (fx.space || 0) * 0.9); s(c.echo.gain, (fx.echo || 0) * 0.7);
    if (c.kitLp) s(c.kitLp.frequency, (HB.kit(tr.inst).lp || 20000));
  }

  function makeGraph(ctx, doc, dest) {
    var g = { ctx: ctx, tracks: {}, active: [] };
    g.masterIn = ctx.createGain();
    g.musicBus = ctx.createGain(); g.voiceBus = ctx.createGain(); g.fxBus = ctx.createGain();
    g.sweep = ctx.createBiquadFilter(); g.sweep.type = 'lowpass'; g.sweep.frequency.value = 20000; g.sweep.Q.value = 2;
    g.musicBus.connect(g.sweep); g.sweep.connect(g.masterIn); g.voiceBus.connect(g.masterIn); g.fxBus.connect(g.masterIn);
    g.reverb = ctx.createConvolver(); g.reverb.buffer = impulse(ctx); g.reverbOut = ctx.createGain(); g.reverbOut.gain.value = 0.7;
    g.reverb.connect(g.reverbOut); g.reverbOut.connect(g.masterIn);
    g.delay = ctx.createDelay(2); g.delayFb = ctx.createGain(); g.delayFb.gain.value = 0.36; g.delayLp = ctx.createBiquadFilter(); g.delayLp.type = 'lowpass'; g.delayLp.frequency.value = 3200;
    g.delay.connect(g.delayLp); g.delayLp.connect(g.delayFb); g.delayFb.connect(g.delay); g.delayLp.connect(g.masterIn);
    g.fxSend = ctx.createGain(); g.fxSend.gain.value = 0.5; g.fxBus.connect(g.fxSend); g.fxSend.connect(g.reverb);
    g.limiter = ctx.createDynamicsCompressor(); g.limiter.threshold.value = -5; g.limiter.ratio.value = 14; g.limiter.knee.value = 4; g.limiter.attack.value = 0.002; g.limiter.release.value = 0.18;
    g.master = ctx.createGain();
    g.analyser = ctx.createAnalyser(); g.analyser.fftSize = 1024;
    g.masterIn.connect(g.limiter); g.limiter.connect(g.master); g.master.connect(g.analyser); g.master.connect(dest || ctx.destination);
    updateGraph(g, doc);
    return g;
  }

  function updateGraph(g, doc) {
    var ctx = g.ctx, now = ctx.currentTime;
    var anySolo = doc.tracks.some(function (t) { return t.solo; });
    doc.tracks.forEach(function (tr) {
      var c = g.tracks[tr.id] || makeTrack(ctx, g, tr);
      setTrack(ctx, c, tr, anySolo, now);
    });
    g.master.gain.setTargetAtTime(doc.master ? doc.master.vol : 0.85, now, 0.02);
    g.delay.delayTime.setTargetAtTime(0.75 * 60 / doc.bpm, now, 0.05);
  }

  // ------------------------------------------------------------------ scheduling
  function swingBeat(b, swing) {
    if (!swing) return b;
    var s16 = b * 4, r = Math.round(s16);
    if (Math.abs(s16 - r) < 1e-6 && ((r % 2) + 2) % 2 === 1) return b + swing * 0.25;
    return b;
  }

  function transitionAt(doc) {  // [{at (boundary beat), type, from section}]
    var out = [], b = 0;
    doc.sections.forEach(function (s, i) {
      b += s.bars * 4;
      if (s.trans && s.trans !== 'none' && i < doc.sections.length - 1) out.push({ at: b, type: s.trans });
    });
    return out;
  }

  function quietAt(trans, beat, kind) {  // drum hits silenced by a fill, music silenced by a drop
    for (var i = 0; i < trans.length; i++) {
      var tr = trans[i];
      if (tr.type === 'drop' && beat >= tr.at - 1 && beat < tr.at - 0.001 && kind !== 'voice') return true;
      if ((tr.type === 'fill' || tr.type === 'build') && kind === 'drums' && beat >= tr.at - (tr.type === 'fill' ? 1 : 2) && beat < tr.at - 0.001) return 'drums';
    }
    return false;
  }

  function scheduleRange(g, doc, b0, b1, timeOf, opts) {
    var ctx = g.ctx, trans = transitionAt(doc), byId = {};
    opts = opts || {};
    doc.tracks.forEach(function (t) { byId[t.id] = t; if (!g.tracks[t.id]) updateGraph(g, doc); });
    var drumTrack = doc.tracks.filter(function (t) { return t.kind === 'drums'; })[0];
    doc.clips.forEach(function (clip) {
      var tr = byId[clip.track]; if (!tr) return;
      var c = g.tracks[tr.id], cs = clip.start, ce = clip.start + clip.len;
      var lo = Math.max(b0, cs), hi = Math.min(b1, ce);
      if (hi <= lo) return;
      if (clip.take) {
        if (!opts.takeBuffer) return;
        var buf = opts.takeBuffer(tr, clip.take);
        if (!buf) return;
        var off = (clip.offset || 0), spb = 60 / doc.bpm;
        var startBeat = cs, into = 0;
        if (lo > cs + 1e-6) { if (!opts.first) return; startBeat = lo; into = (lo - cs) * spb; }
        else if (cs < b0 - 1e-6) return;
        var when = timeOf(startBeat), playFor = (ce - startBeat) * spb;
        if (off + into >= buf.duration) return;
        var src = ctx.createBufferSource(); src.buffer = buf;
        var sg = ctx.createGain(); sg.gain.value = clip.gain === undefined ? 1 : clip.gain;
        src.connect(sg); sg.connect(c.out);
        src.start(Math.max(ctx.currentTime, when), off + into, Math.max(0.01, playFor));
        g.active.push(src);
        return;
      }
      var pat = doc.patterns[clip.pat]; if (!pat || !pat.len) return;
      var L = pat.len, k0 = Math.floor((lo - cs) / L);
      for (var k = k0; cs + k * L < hi; k++) {
        var base = cs + k * L;
        if (pat.kind === 'drums') {
          pat.hits.forEach(function (h) {
            var b = base + h.t; if (b < lo || b >= hi || b >= ce) return;
            if (quietAt(trans, b, 'drums')) return;
            playDrum(ctx, c.out, tr.inst, h.lane, timeOf(swingBeat(b, doc.swing)), h.v);
          });
        } else {
          var inst = HB.inst(tr.inst), oct = (tr.oct || 0) * 12;
          pat.notes.slice().sort(function (a, b2) { return a.t - b2.t; }).forEach(function (n) {
            var b = base + n.t; if (b < lo || b >= hi || b >= ce) return;
            if (quietAt(trans, b, 'notes')) return;
            var t0 = timeOf(swingBeat(b, doc.swing)), dur = Math.min(n.d, ce - b) * 60 / doc.bpm;
            var midi = n.p + oct, from = null;
            if (inst.mono || inst.glide !== undefined || inst.sustain) {
              if (n.g && c.last !== null) from = c.last;
              if (c.mono && inst.mono) c.mono.cut(t0);
            }
            var voice = playNote(ctx, c.out, inst, midi, t0, dur, n.v, { from: from });
            if (inst.mono) c.mono = voice;
            c.last = midi;
          });
        }
      }
    });
    // transitions
    trans.forEach(function (tr) { scheduleTransition(g, doc, tr, b0, b1, timeOf, drumTrack); });
    if (opts.metronome) {
      for (var mb = Math.ceil(b0 - 1e-9); mb < b1; mb++) click(ctx, opts.clickDest || ctx.destination, timeOf(mb), mb % (doc.meter || 4) === 0);
    }
  }

  function click(ctx, dest, t, accent) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 2100 : 1400;
    g.gain.setValueAtTime(accent ? 0.35 : 0.22, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.05);
  }

  function inRange(b, b0, b1) { return b >= b0 && b < b1; }

  function scheduleTransition(g, doc, tr, b0, b1, timeOf, drumTrack) {
    var ctx = g.ctx, spb = 60 / doc.bpm, kit = drumTrack ? drumTrack.inst : 'acoustic';
    var dOut = drumTrack && g.tracks[drumTrack.id] ? g.tracks[drumTrack.id].out : g.fxBus;
    var at = tr.at, i;
    if (tr.type === 'fill') {
      var seq = [['snare', 1], ['snare', 0.7], ['tom', 1.25], ['tom', 0.85]];
      for (i = 0; i < 4; i++) { var fb = at - 1 + i * 0.25; if (inRange(fb, b0, b1)) playDrum(ctx, dOut, kit, seq[i][0], timeOf(fb), 0.7 + i * 0.08, { pitch: seq[i][1] }); }
      if (inRange(at, b0, b1)) playDrum(ctx, dOut, kit, 'crash', timeOf(at), 0.8);
    } else if (tr.type === 'build') {
      var pts = []; for (i = 0; i < 8; i++) pts.push(at - 8 + i * 0.5); for (i = 0; i < 8; i++) pts.push(at - 4 + i * 0.25); for (i = 0; i < 8; i++) pts.push(at - 2 + i * 0.125); for (i = 0; i < 8; i++) pts.push(at - 1 + i * 0.125);
      pts.forEach(function (pb, j) { if (inRange(pb, b0, b1)) playDrum(ctx, dOut, kit, 'snare', timeOf(pb), 0.35 + j / pts.length * 0.6); });
      if (inRange(at, b0, b1)) playDrum(ctx, dOut, kit, 'crash', timeOf(at), 0.9);
    } else if (tr.type === 'riser') {
      var st = at - 8;
      if (inRange(st, b0, b1)) {
        var t0 = timeOf(st), dur = 8 * spb;
        var n = ctx.createBufferSource(); n.buffer = noise(ctx); n.loop = true;
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(300, t0); bp.frequency.exponentialRampToValueAtTime(9000, t0 + dur);
        var ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.35, t0 + dur); ng.gain.setValueAtTime(0.0001, t0 + dur + 0.01);
        n.connect(bp); bp.connect(ng); ng.connect(g.fxBus); n.start(t0); n.stop(t0 + dur + 0.05);
        var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t0 + dur);
        var og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(0.05, t0 + dur); og.gain.setValueAtTime(0.0001, t0 + dur + 0.01);
        var olp = ctx.createBiquadFilter(); olp.type = 'lowpass'; olp.frequency.value = 2500;
        o.connect(olp); olp.connect(og); og.connect(g.fxBus); o.start(t0); o.stop(t0 + dur + 0.05);
      }
      if (inRange(at, b0, b1)) playDrum(ctx, dOut, kit, 'crash', timeOf(at), 0.8);
    } else if (tr.type === 'sweep') {
      var s0 = at - 8;
      if (inRange(s0, b0, b1)) {
        var ts = timeOf(s0), te = timeOf(at - 0.25);
        g.sweep.frequency.setValueAtTime(18000, ts); g.sweep.frequency.exponentialRampToValueAtTime(420, te);
        g.sweep.frequency.setValueAtTime(20000, timeOf(at));
      }
    } else if (tr.type === 'reverse') {
      var r0 = at - 4;
      if (inRange(r0, b0, b1)) {
        var len = Math.floor(4 * spb * ctx.sampleRate), rb = ctx.createBuffer(1, len, ctx.sampleRate), d = rb.getChannelData(0), s = 99;
        for (i = 0; i < len; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff - 1) * Math.pow(i / len, 3) * 0.5; }
        var src = ctx.createBufferSource(); src.buffer = rb; var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
        src.connect(hp); hp.connect(g.fxBus); src.start(timeOf(r0));
      }
    } else if (tr.type === 'drop') {
      var q0 = at - 1;
      if (inRange(q0, b0, b1)) {
        g.musicBus.gain.setValueAtTime(1, timeOf(q0) - 0.005); g.musicBus.gain.linearRampToValueAtTime(0.0001, timeOf(q0) + 0.02);
        g.musicBus.gain.setValueAtTime(0.0001, timeOf(at) - 0.01); g.musicBus.gain.linearRampToValueAtTime(1, timeOf(at));
      }
      if (inRange(at, b0, b1)) boom(g, timeOf(at), 0.6);
    } else if (tr.type === 'impact') {
      if (inRange(at, b0, b1)) { boom(g, timeOf(at), 1); playDrum(ctx, dOut, kit, 'crash', timeOf(at), 1); }
    }
  }
  function boom(g, t, amt) {
    var ctx = g.ctx, o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    og.gain.setValueAtTime(0.8 * amt, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(og); og.connect(g.fxBus); o.start(t); o.stop(t + 1.7);
  }

  // ------------------------------------------------------------------ the player
  var A = HB.audio = {};
  var P = { ctx: null, graph: null, doc: null, playing: false, segs: [], next: 0, timer: 0, opts: {}, preview: null };
  A.ctx = function () {
    if (!P.ctx) {
      var C = root.AudioContext || root.webkitAudioContext;
      P.ctx = new C({ latencyHint: 'interactive' });
      try { if (root.navigator && root.navigator.audioSession) root.navigator.audioSession.type = 'playback'; } catch (e) {}
    }
    if (P.ctx.state === 'suspended') P.ctx.resume();
    return P.ctx;
  };
  A.unlock = function () { var c = A.ctx(); if (c.resume) c.resume(); return c.state; };
  A.playing = function () { return P.playing; };
  A.doc = function () { return P.doc; };

  A.position = function () {  // the beat you hear now
    if (!P.playing || !P.segs.length) return P.pos || 0;
    var now = P.ctx.currentTime - (P.ctx.outputLatency || 0) * 0.5;
    var s = P.segs[0];
    for (var i = 0; i < P.segs.length; i++) if (P.segs[i].ctx0 <= now) s = P.segs[i];
    return Math.max(P.countFrom !== undefined ? P.countFrom : 0, s.beat0 + (now - s.ctx0) * P.doc.bpm / 60);
  };
  A.counting = function () { return P.playing && P.ctx.currentTime < P.segs[0].ctx0 ? Math.ceil((P.segs[0].ctx0 - P.ctx.currentTime) * P.doc.bpm / 60) : 0; };
  A.startTime = function () { return P.segs.length ? P.segs[0].ctx0 : 0; };

  function tick() {
    if (!P.playing) return;
    var ctx = P.ctx, horizon = ctx.currentTime + 0.16, doc = P.doc, end = HB.Doc.lengthBeats(doc);
    var guard = 0;
    while (guard++ < 64) {
      var seg = P.segs[P.segs.length - 1];
      var b = P.next, tb = seg.ctx0 + (b - seg.beat0) * 60 / doc.bpm;
      if (tb > horizon) break;
      var loop = doc.loop && doc.loop.b > doc.loop.a ? doc.loop : (P.opts.loopAll ? { a: 0, b: end } : null);
      var stop = loop ? loop.b : end + 0.001;
      var b2 = Math.min(b + 0.25, stop);
      seg.scheduledTo = b2;
      scheduleRange(P.graph, doc, b, b2, function (x) { return seg.ctx0 + (x - seg.beat0) * 60 / doc.bpm; },
        { takeBuffer: P.opts.takeBuffer, first: P.first, metronome: P.opts.metronome, clickDest: ctx.destination });
      P.first = false;
      P.next = b2;
      if (b2 >= stop - 1e-9) {
        if (loop) {
          var tEnd = seg.ctx0 + (stop - seg.beat0) * 60 / doc.bpm;
          P.segs.push({ ctx0: tEnd, beat0: loop.a, scheduledTo: loop.a });
          if (P.segs.length > 4) P.segs.shift();
          P.next = loop.a; P.first = true;
          if (P.opts.onLoop) P.opts.onLoop();
        } else {
          P.endAt = tb + (b2 - b) * 60 / doc.bpm;
          break;
        }
      }
    }
    if (P.endAt && ctx.currentTime > P.endAt + 0.3) { A.stop(); if (P.opts.onEnd) P.opts.onEnd(); }
  }

  // play(doc, fromBeat, {metronome, countIn (beats), takeBuffer(track, takeId), onEnd, loopAll})
  A.play = function (doc, from, opts) {
    A.stop(true);
    var ctx = A.ctx();
    P.doc = doc; P.opts = opts || {}; P.playing = true; P.first = true; P.endAt = 0;
    P.graph = makeGraph(ctx, doc);
    var lead = 0.08, count = P.opts.countIn || 0, spb = 60 / doc.bpm;
    var t0 = ctx.currentTime + lead + count * spb;
    for (var i = 0; i < count; i++) click(ctx, ctx.destination, ctx.currentTime + lead + i * spb, i === 0);
    P.segs = [{ ctx0: t0, beat0: from || 0, scheduledTo: from || 0 }];
    P.next = from || 0; P.countFrom = from || 0;
    tick();
    P.timer = root.setInterval(tick, 25);
    return t0;
  };
  A.stop = function (quiet) {
    if (P.timer) root.clearInterval(P.timer);
    P.timer = 0;
    if (P.playing) P.pos = A.position();
    P.playing = false;
    if (P.graph) {
      var g = P.graph, now = P.ctx.currentTime;
      try { g.master.gain.cancelScheduledValues(now); g.master.gain.setTargetAtTime(0, now, 0.03); } catch (e) {}
      g.active.forEach(function (s) { try { s.stop(now + 0.1); } catch (e) {} });
      root.setTimeout(function () { try { g.master.disconnect(); } catch (e) {} }, 400);
      P.graph = null;
    }
  };
  A.update = function (doc) {  // live parameter changes (volume, mute, effects) while playing
    if (P.playing && P.graph && doc === P.doc) updateGraph(P.graph, doc);
  };
  A.level = function () {
    if (!P.graph) return 0;
    var a = P.graph.analyser, buf = A._lv || (A._lv = new Float32Array(a.fftSize)); a.getFloatTimeDomainData(buf);
    var pk = 0; for (var i = 0; i < buf.length; i++) pk = Math.max(pk, Math.abs(buf[i]));
    return pk;
  };
  A.spectrum = function (bins) {
    if (!P.graph) return null;
    var a = P.graph.analyser, d = A._sp || (A._sp = new Uint8Array(a.frequencyBinCount)); a.getByteFrequencyData(d);
    var out = [], n = bins || 24;
    for (var i = 0; i < n; i++) {
      var lo = Math.floor(Math.pow(d.length, i / n)), hi = Math.max(lo + 1, Math.floor(Math.pow(d.length, (i + 1) / n))), s = 0;
      for (var j = lo; j < hi; j++) s = Math.max(s, d[j]);
      out.push(s / 255);
    }
    return out;
  };

  // single sounds for the gallery and the piano roll
  function previewOut() {
    var ctx = A.ctx();
    if (!P.preview) { var g = ctx.createGain(); g.gain.value = 0.8; var lim = ctx.createDynamicsCompressor(); g.connect(lim); lim.connect(ctx.destination); P.preview = g; }
    return P.preview;
  }
  A.previewNote = function (instId, midi, dur) { var ctx = A.ctx(); playNote(ctx, previewOut(), HB.inst(instId), midi, ctx.currentTime + 0.02, dur || 0.5, 0.75); };
  A.previewChord = function (instId, notes) { var ctx = A.ctx(), t = ctx.currentTime + 0.02; notes.forEach(function (n, i) { playNote(ctx, previewOut(), HB.inst(instId), n, t + i * 0.012, 0.9, 0.6); }); };
  A.previewDrum = function (kitId, lane) { var ctx = A.ctx(); playDrum(ctx, previewOut(), kitId, lane, ctx.currentTime + 0.02, 0.85); };

  // ------------------------------------------------------------------ offline render, WAV, MIDI
  A.render = function (doc, opts) {
    opts = opts || {};
    var sr = opts.sampleRate || 44100, len = HB.Doc.lengthBeats(doc), spb = 60 / doc.bpm;
    var from = opts.from || 0, to = opts.to || len, tail = 2.5;
    var secs = (to - from) * spb + tail;
    var OC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    var off = new OC(2, Math.ceil(secs * sr), sr);
    if (opts.solo || opts.fxOnly) {  // a stem: only one track (or only the transition effects) is heard
      doc = JSON.parse(JSON.stringify(doc));
      doc.tracks.forEach(function (t) { t.solo = false; t.mute = opts.fxOnly ? true : t.id !== opts.solo; });
    }
    var g = makeGraph(off, doc, off.destination);
    if (opts.solo) g.fxBus.gain.value = 0;
    var timeOf = function (b) { return 0.05 + (b - from) * spb; };
    for (var b = from; b < to; b += 4) scheduleRange(g, doc, b, Math.min(b + 4, to), timeOf, { takeBuffer: opts.takeBuffer, first: b === from });
    return off.startRendering();
  };
  A.wav = function (buffer) {
    var ch = buffer.numberOfChannels, n = buffer.length, sr = buffer.sampleRate, bytes = 44 + n * ch * 2;
    var view = new DataView(new ArrayBuffer(bytes)), p = 0;
    function str(s) { for (var i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); }
    function u32(v) { view.setUint32(p, v, true); p += 4; } function u16(v) { view.setUint16(p, v, true); p += 2; }
    str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(sr); u32(sr * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
    var data = []; for (var c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
    for (var i = 0; i < n; i++) for (c = 0; c < ch; c++) { var s = Math.max(-1, Math.min(1, data[c][i])); view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2; }
    return new Blob([view], { type: 'audio/wav' });
  };
  A.wavMono = function (samples, sr) {  // a recorded take, 16-bit mono
    var n = samples.length, bytes = 44 + n * 2, view = new DataView(new ArrayBuffer(bytes)), p = 0;
    function str(s) { for (var i = 0; i < s.length; i++) view.setUint8(p++, s.charCodeAt(i)); }
    function u32(v) { view.setUint32(p, v, true); p += 4; } function u16(v) { view.setUint16(p, v, true); p += 2; }
    str('RIFF'); u32(bytes - 8); str('WAVE'); str('fmt '); u32(16); u16(1); u16(1); u32(sr); u32(sr * 2); u16(2); u16(16); str('data'); u32(n * 2);
    for (var i = 0; i < n; i++) { var s = Math.max(-1, Math.min(1, samples[i])); view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true); p += 2; }
    return new Blob([view], { type: 'audio/wav' });
  };

  // events of one notes/drums track over the whole song: [{beat, dur, midi, vel}]
  A.trackEvents = function (doc, track) {
    var ev = [];
    doc.clips.forEach(function (c) {
      if (c.track !== track.id || !c.pat) return;
      var pat = doc.patterns[c.pat]; if (!pat) return;
      for (var base = c.start; base < c.start + c.len - 1e-9; base += pat.len) {
        (pat.kind === 'drums' ? pat.hits : pat.notes).forEach(function (n) {
          var b = base + n.t; if (b >= c.start + c.len) return;
          ev.push(pat.kind === 'drums' ? { beat: b, dur: 0.25, midi: GM_DRUM[n.lane] || 38, vel: n.v } : { beat: b, dur: Math.min(n.d, c.start + c.len - b), midi: n.p + (track.oct || 0) * 12, vel: n.v });
        });
      }
    });
    return ev.sort(function (a, b) { return a.beat - b.beat; });
  };

  A.midi = function (doc) {
    var PPQ = 480, tracks = [];
    function vlq(n) { var bytes = [n & 0x7f]; while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80); return bytes; }
    function trackChunk(events) {
      events.sort(function (a, b) { return a.tick - b.tick || a.order - b.order; });
      var data = [], last = 0;
      events.forEach(function (e) { data = data.concat(vlq(e.tick - last), e.bytes); last = e.tick; });
      data = data.concat([0, 0xff, 0x2f, 0]);
      return [0x4d, 0x54, 0x72, 0x6b, (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255].concat(data);
    }
    var tempo = Math.round(60000000 / doc.bpm), name = String(doc.title || 'Humbeat song').slice(0, 60);
    var meta = [{ tick: 0, order: 0, bytes: [0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
      { tick: 0, order: 0, bytes: [0xff, 0x58, 4, doc.meter || 4, 2, 24, 8] },
      { tick: 0, order: 0, bytes: [0xff, 0x03, name.length].concat(name.split('').map(function (ch) { return ch.charCodeAt(0) & 127; })) }];
    tracks.push(trackChunk(meta));
    var ch = 0;
    doc.tracks.forEach(function (tr) {
      if (tr.kind === 'voice') return;
      var chan = tr.kind === 'drums' ? 9 : ch++ % 16; if (chan === 9 && tr.kind !== 'drums') chan = ch++ % 16;
      var ev = [], nm = String(tr.name || 'Track').slice(0, 40);
      ev.push({ tick: 0, order: 0, bytes: [0xff, 0x03, nm.length].concat(nm.split('').map(function (c) { return c.charCodeAt(0) & 127; })) });
      if (tr.kind !== 'drums') ev.push({ tick: 0, order: 1, bytes: [0xc0 | chan, HB.inst(tr.inst).gm || 0] });
      A.trackEvents(doc, tr).forEach(function (e) {
        var on = Math.round(e.beat * PPQ), off = Math.max(on + 1, Math.round((e.beat + e.dur) * PPQ)), m = Math.max(0, Math.min(127, Math.round(e.midi)));
        ev.push({ tick: on, order: 3, bytes: [0x90 | chan, m, Math.max(1, Math.min(127, Math.round(e.vel * 127)))] });
        ev.push({ tick: off, order: 2, bytes: [0x80 | chan, m, 0] });
      });
      tracks.push(trackChunk(ev));
    });
    var head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (PPQ >> 8) & 255, PPQ & 255];
    var all = head; tracks.forEach(function (t) { all = all.concat(t); });
    return new Blob([new Uint8Array(all)], { type: 'audio/midi' });
  };

  A._internals = { playNote: playNote, playDrum: playDrum, makeGraph: makeGraph, scheduleRange: scheduleRange, transitionAt: transitionAt, swingBeat: swingBeat, ksBuffer: ksBuffer };
})(typeof window !== 'undefined' ? window : globalThis);
