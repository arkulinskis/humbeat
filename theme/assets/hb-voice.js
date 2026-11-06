/* hb-voice.js: everything about the human voice (window.HB.voice).
   - the microphone recorder (raw samples, so takes line up with the beat and stay lossless for tuning)
   - pitch tracking with YIN (de Cheveigne & Kawahara 2002) on a 16 kHz copy, 10 ms frames
   - pitch shifting with TD-PSOLA: grains two periods long, laid down at the new period, so the voice keeps its own
     character (formants) unless "Character" moves them on purpose
   - auto-tune (snap to the song's scale with a retune speed: 0 = the hard robotic snap), robot monotone, harmonies
     a third / fifth / octave away in the scale, doubling
   - hum to notes (a melody you hum becomes MIDI-style notes for any instrument) and beatbox to drums
   Pure functions take Float32Arrays, so tools/testing/voice_test.js checks them in Node with synthetic voices. */
(function (root) {
  'use strict';
  var HB = root.HB = root.HB || {};
  var T = HB.theory;
  var V = HB.voice = {};

  // ------------------------------------------------------------------ presets (Voice tab gallery)
  V.PRESETS = [
    { id: 'natural', name: 'Natural', hint: 'Your voice, a little polish', v: { tune: 0, speed: 0.5, pitch: 0, character: 0, harmony: 'none', double: 0, robot: 0 }, fx: { space: 0.18, echo: 0, drive: 0, low: 0, high: 0.1, punch: 0.4, tone: 1, wide: 0, lofi: 0 } },
    { id: 'pop', name: 'Pop polish', hint: 'Gentle tuning, bright and close', v: { tune: 0.6, speed: 0.45 }, fx: { space: 0.25, echo: 0.08, high: 0.22, punch: 0.55 } },
    { id: 'mumble', name: 'Hard tune', hint: 'Instant snap between notes (trap, mumble rap)', v: { tune: 1, speed: 0 }, fx: { space: 0.3, echo: 0.25, high: 0.25, punch: 0.6 } },
    { id: 'hopecore', name: 'Hopecore haze', hint: 'Soft tuning, huge airy reverb', v: { tune: 0.5, speed: 0.5 }, fx: { space: 0.72, echo: 0.2, high: 0.35, low: -0.2, punch: 0.4, wide: 0.3 } },
    { id: 'teenpop', name: 'Y2K breathy', hint: 'Doubled, bright, light tuning', v: { tune: 0.55, speed: 0.35, double: 0.5 }, fx: { space: 0.3, high: 0.35, punch: 0.55 } },
    { id: 'ballad', name: 'Ballad', hint: 'Natural tuning, long plate reverb', v: { tune: 0.35, speed: 0.6 }, fx: { space: 0.55, echo: 0.06, punch: 0.45 } },
    { id: 'stadium', name: 'Stadium', hint: 'Big room, doubled, wide', v: { tune: 0.4, speed: 0.5, double: 0.5 }, fx: { space: 0.82, echo: 0.3, wide: 0.4 } },
    { id: 'harmony', name: 'Harmony', hint: 'A second voice a third above you', v: { tune: 0.6, speed: 0.4, harmony: 'third' }, fx: { space: 0.35 } },
    { id: 'choir', name: 'Choir', hint: 'Three voices: third, fifth, octave down', v: { tune: 0.7, speed: 0.4, harmony: 'choir' }, fx: { space: 0.6, wide: 0.5 } },
    { id: 'robot', name: 'Robot', hint: 'One flat note, metallic', v: { tune: 1, speed: 0, robot: 1 }, fx: { space: 0.15, drive: 0.15, wide: 0.2 } },
    { id: 'chipmunk', name: 'Chipmunk', hint: 'Higher and smaller', v: { pitch: 7, character: 5, tune: 0.5, speed: 0.2 }, fx: { space: 0.2 } },
    { id: 'giant', name: 'Giant', hint: 'Lower and huge', v: { pitch: -7, character: -5 }, fx: { space: 0.35, low: 0.3 } },
    { id: 'hyper', name: 'Hyperpop', hint: 'Pitched up, hard tuned, doubled', v: { pitch: 4, character: 3, tune: 1, speed: 0, double: 0.4 }, fx: { space: 0.3, echo: 0.15, high: 0.3, punch: 0.6 } },
    { id: 'metal', name: 'Metal grit', hint: 'Distorted, doubled, pushed', v: { double: 0.6 }, fx: { drive: 0.55, space: 0.2, echo: 0.1, punch: 0.7, high: 0.2 } },
    { id: 'punk', name: 'Punk shout', hint: 'Doubled and a bit crunchy', v: { double: 0.7, tune: 0.2 }, fx: { drive: 0.15, space: 0.15, punch: 0.65, high: 0.2 } },
    { id: 'rap', name: 'Dry rap', hint: 'Upfront, no tuning, tight', v: { tune: 0 }, fx: { space: 0.05, echo: 0.05, punch: 0.65, high: 0.15 } },
    { id: 'drill', name: 'Drill', hint: 'Low and confident, echo tails', v: { tune: 0.2, speed: 0.4 }, fx: { space: 0.15, echo: 0.3, punch: 0.6 } },
    { id: 'telephone', name: 'Telephone', hint: 'Thin, like an old phone line', v: {}, fx: { tone: 0.42, low: -1, high: -0.4, drive: 0.25, space: 0.05 } },
    { id: 'lofi', name: 'Lo-fi tape', hint: 'Worn, warm and dusty', v: {}, fx: { lofi: 0.5, tone: 0.6, space: 0.25 } }
  ];
  var PBY = {}; V.PRESETS.forEach(function (p) { PBY[p.id] = p; });
  V.preset = function (id) { return PBY[id] || PBY.natural; };
  V.applyPreset = function (track, id) {
    var p = V.preset(id), base = V.preset('natural');
    track.voice = Object.assign({}, HB.VOICE_DEFAULT, base.v, p.v, { preset: p.id });
    track.fx = Object.assign({}, base.fx, p.fx);
    return track;
  };
  V.HARMONIES = [['none', 'No harmony'], ['third', 'Third above'], ['fifth', 'Fifth above'], ['sixth', 'Sixth above'], ['octave', 'Octave below'], ['choir', 'Choir (3 voices)']];

  // ------------------------------------------------------------------ analysis: YIN pitch + loudness
  function downsample(x, sr, target) {
    var D = Math.max(1, Math.round(sr / target)), n = Math.floor(x.length / D), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var s = 0; for (var k = 0; k < D; k++) s += x[i * D + k]; y[i] = s / D; }
    return { x: y, sr: sr / D };
  }

  // -> {hop (s), f0 Float32Array (Hz, 0 = no pitch), conf, rms, n}
  V.analyse = function (samples, sr, opts) {
    opts = opts || {};
    var ds = downsample(samples, sr, 16000), x = ds.x, s2 = ds.sr;
    var hop = Math.round(s2 * (opts.hop || 0.01)), W = Math.round(s2 * 0.024);
    var tmin = Math.floor(s2 / (opts.fmax || 1100)), tmax = Math.ceil(s2 / (opts.fmin || 65));
    var n = Math.max(0, Math.floor((x.length - W - tmax) / hop));
    var f0 = new Float32Array(n), conf = new Float32Array(n), rms = new Float32Array(n);
    var d = new Float32Array(tmax + 2), th = opts.threshold || 0.15;
    for (var f = 0; f < n; f++) {
      var i0 = f * hop, e = 0, j, tau;
      for (j = 0; j < W; j++) e += x[i0 + j] * x[i0 + j];
      rms[f] = Math.sqrt(e / W);
      if (rms[f] < 1e-4) { f0[f] = 0; conf[f] = 0; continue; }
      var run = 0; d[0] = 1;
      for (tau = 1; tau <= tmax; tau++) {
        var sum = 0;
        for (j = 0; j < W; j++) { var df = x[i0 + j] - x[i0 + j + tau]; sum += df * df; }
        run += sum;
        d[tau] = run > 0 ? sum * tau / run : 1;  // cumulative mean normalised difference
      }
      var best = -1;
      for (tau = tmin; tau <= tmax; tau++) {
        if (d[tau] < th) { while (tau + 1 <= tmax && d[tau + 1] < d[tau]) tau++; best = tau; break; }
      }
      if (best < 0) {  // no clear dip: take the deepest one, with low confidence
        var mv = 9; for (tau = tmin; tau <= tmax; tau++) if (d[tau] < mv) { mv = d[tau]; best = tau; }
      }
      var a = d[best - 1] || d[best], b = d[best], c = d[best + 1] || d[best];
      var shift = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
      var period = best + Math.max(-1, Math.min(1, shift));
      conf[f] = Math.max(0, 1 - b);
      f0[f] = conf[f] > 0.6 ? s2 / period : 0;
    }
    // remove one-frame octave jumps and dropouts (median of 5)
    var med = new Float32Array(n);
    for (f = 0; f < n; f++) {
      var w = []; for (var k2 = -2; k2 <= 2; k2++) { var v = f0[Math.max(0, Math.min(n - 1, f + k2))]; if (v > 0) w.push(v); }
      if (f0[f] > 0 && w.length >= 3) { w.sort(function (p, q) { return p - q; }); med[f] = w[Math.floor(w.length / 2)]; } else med[f] = f0[f];
    }
    var peak = 0; for (f = 0; f < n; f++) peak = Math.max(peak, rms[f]);
    var gate = Math.max(0.004, peak * (opts.gate || 0.08));
    for (f = 0; f < n; f++) if (rms[f] < gate) med[f] = 0;
    return { hop: hop / s2, offset: W / 2 / s2, f0: med, conf: conf, rms: rms, n: n, gate: gate, peak: peak };
  };

  function f0At(an, t) { var i = Math.round((t - (an.offset || 0)) / an.hop); return i >= 0 && i < an.n ? an.f0[i] : 0; }

  // ------------------------------------------------------------------ TD-PSOLA
  // ratioAt(t seconds) -> pitch factor; stretch = output length / input length; voicedOnly mutes noise (harmonies)
  V.psola = function (x, sr, an, ratioAt, stretch, voicedOnly, f0Scale) {
    stretch = stretch || 1; f0Scale = f0Scale || 1;
    var N = x.length, Nout = Math.floor(N * stretch), out = new Float32Array(Nout), wsum = new Float32Array(Nout);
    var marks = [], t = 0, unv = Math.round(sr * 0.008);
    while (t < N) {
      var f = f0At(an, t / sr * f0Scale) * f0Scale, P = f > 0 ? sr / f : unv;  // f0Scale: x is a sped-up copy
      marks.push(t, P, f > 0 ? 1 : 0);
      t += Math.max(16, Math.round(P));
    }
    var mi = 0, M = marks.length / 3, ts = 0;
    while (ts < Nout) {
      var ta = ts / stretch;
      while (mi + 1 < M && marks[(mi + 1) * 3] <= ta) mi++;
      var k = (mi + 1 < M && marks[(mi + 1) * 3] - ta < ta - marks[mi * 3]) ? mi + 1 : mi;
      var pos = marks[k * 3], Ta = marks[k * 3 + 1], voiced = marks[k * 3 + 2];
      var r = voiced ? Math.max(0.5, Math.min(2.2, ratioAt(pos / sr))) : 1;
      var L = Math.max(8, Math.round(Ta)), c = Math.round(ts), amp = (voicedOnly && !voiced) ? 0 : 1;
      for (var j = -L; j <= L; j++) {
        var si = pos + j, oi = c + j;
        if (si < 0 || si >= N || oi < 0 || oi >= Nout) continue;
        var w = 0.5 + 0.5 * Math.cos(Math.PI * j / L);
        out[oi] += x[si] * w * amp; wsum[oi] += w;
      }
      ts += Math.max(8, Ta / r);
    }
    for (var i = 0; i < Nout; i++) out[i] = wsum[i] > 0.05 ? out[i] / Math.max(wsum[i], 0.65) : 0;
    return out;
  };

  function resample(x, factor) {  // factor > 1 = faster (shorter, higher)
    var n = Math.floor(x.length / factor), y = new Float32Array(n);
    for (var i = 0; i < n; i++) { var p = i * factor, a = Math.floor(p), fr = p - a; y[i] = (x[a] || 0) * (1 - fr) + (x[a + 1] || 0) * fr; }
    return y;
  }

  // the corrected pitch per frame (midi) for a voice setting: auto-tune / robot
  V.targets = function (an, settings, key, scale) {
    var n = an.n, out = new Float32Array(n), src = new Float32Array(n);
    var tune = Math.max(0, Math.min(1, settings.tune || 0)), speed = Math.max(0, Math.min(1, settings.speed === undefined ? 0.5 : settings.speed));
    var tau = 0.004 + speed * speed * 0.22, alpha = speed <= 0.02 ? 1 : 1 - Math.exp(-an.hop / tau);
    var robotNote = null;
    if (settings.robot) {
      var v = []; for (var i = 0; i < n; i++) if (an.f0[i] > 0) v.push(T.midiOf(an.f0[i]));
      v.sort(function (a, b) { return a - b; });
      var med = v.length ? v[Math.floor(v.length / 2)] : 60;
      robotNote = Math.round((med - key) / 12) * 12 + key;
    }
    var y = null;
    for (var f = 0; f < n; f++) {
      if (an.f0[f] <= 0) { out[f] = 0; src[f] = 0; y = null; continue; }
      var m = T.midiOf(an.f0[f]); src[f] = m;
      var tgt = robotNote !== null ? robotNote : T.snap(m, key, scale);
      y = (y === null) ? tgt : y + alpha * (tgt - y);
      out[f] = m + tune * (y - m);
    }
    return { src: src, out: out };
  };

  function harmonyMidi(target, kind, key, scale) {
    var st = T.steps(scale === 'chromatic' ? 'major' : scale), rel = target - key, oct = Math.floor(rel / 12), pc = ((Math.round(rel) % 12) + 12) % 12;
    var deg = 0, bd = 99; for (var i = 0; i < st.length; i++) { var d = Math.abs(st[i] - pc); if (d < bd) { bd = d; deg = i; } }
    var up = { third: 2, fifth: 4, sixth: 5 }[kind];
    if (kind === 'octave') return target - 12;
    var di = deg + up, o2 = Math.floor(di / st.length);
    return key + 12 * (oct + o2) + st[di % st.length] + (Math.round(rel) - (12 * oct + st[deg]));
  }

  // the whole voice chain for one take -> {left, right} Float32Arrays at sr
  V.process = function (samples, sr, settings, key, scale, an) {
    settings = settings || {};
    var pitch = settings.pitch || 0, character = settings.character || 0, harmony = settings.harmony || 'none', dbl = settings.double || 0;
    var needPitch = (settings.tune > 0) || settings.robot || pitch || character || harmony !== 'none';
    var N = samples.length, left = new Float32Array(N), right = new Float32Array(N), main = samples, i;
    if (needPitch) {
      an = an || V.analyse(samples, sr);
      var tg = V.targets(an, settings, key, scale);
      var ratioMain = function (t) {
        var fi = Math.round((t - an.offset) / an.hop); if (fi < 0 || fi >= an.n || !tg.src[fi]) return Math.pow(2, pitch / 12);
        return Math.pow(2, (tg.out[fi] - tg.src[fi] + pitch) / 12);
      };
      if (character) {
        var c = Math.pow(2, character / 12), y = resample(samples, c);
        main = V.psola(y, sr, an, function (t) { return ratioMain(t * c) / c; }, c, false, c);
        if (main.length < N) { var pad = new Float32Array(N); pad.set(main); main = pad; } else if (main.length > N) main = main.subarray(0, N);
      } else main = V.psola(samples, sr, an, ratioMain, 1, false);
      var voices = harmony === 'choir' ? [['third', 0.45, -0.6], ['fifth', 0.38, 0.6], ['octave', 0.3, 0]] : harmony !== 'none' ? [[harmony, 0.5, 0.45]] : [];
      voices.forEach(function (hv) {
        var h = V.psola(samples, sr, an, function (t) {
          var fi = Math.round((t - an.offset) / an.hop); if (fi < 0 || fi >= an.n || !tg.src[fi]) return 1;
          return Math.pow(2, (harmonyMidi(tg.out[fi], hv[0], key, scale) - tg.src[fi] + pitch) / 12);
        }, 1, true);
        var gl = hv[1] * (1 - Math.max(0, hv[2])), gr = hv[1] * (1 + Math.min(0, hv[2]));
        for (i = 0; i < N && i < h.length; i++) { left[i] += h[i] * gl; right[i] += h[i] * gr; }
      });
    }
    for (i = 0; i < N; i++) { left[i] += main[i]; right[i] += main[i]; }
    if (dbl > 0) {  // two slightly detuned, slightly late copies, left and right
      var an2 = an || V.analyse(samples, sr);
      var up = V.psola(main, sr, an2, function () { return Math.pow(2, 0.11 / 12); }, 1, false);
      var dn = V.psola(main, sr, an2, function () { return Math.pow(2, -0.09 / 12); }, 1, false);
      var dl = Math.round(sr * 0.017), dr = Math.round(sr * 0.026), g = dbl * 0.55;
      for (i = 0; i < N; i++) { if (i - dl >= 0) left[i] += up[i - dl] * g; if (i - dr >= 0) right[i] += dn[i - dr] * g; }
    }
    var pk = 0; for (i = 0; i < N; i++) pk = Math.max(pk, Math.abs(left[i]), Math.abs(right[i]));
    if (pk > 0.98) { var s = 0.98 / pk; for (i = 0; i < N; i++) { left[i] *= s; right[i] *= s; } }
    return { left: left, right: right, an: an };
  };

  // ------------------------------------------------------------------ hum -> notes
  // opts: bpm, start (seconds into the recording where beat 0 is), grid (beats, 0.25 = 16th), key, scale, snap (bool),
  //       range [lo, hi] to fold the melody into (an instrument's comfortable range)
  V.humToNotes = function (samples, sr, opts) {
    opts = opts || {};
    var an = V.analyse(samples, sr, { gate: 0.12 }), n = an.n, hop = an.hop;
    var bpm = opts.bpm || 100, spb = 60 / bpm, grid = opts.grid || 0.25, start = opts.start || 0;
    var notes = [], cur = null, i;
    function close(endFrame) {
      if (!cur) return;
      var len = (endFrame - cur.f0) * hop;
      if (len >= 0.07 && cur.p.length) {
        var ps = cur.p.slice().sort(function (a, b) { return a - b; });
        cur.end = endFrame; cur.pitch = ps[Math.floor(ps.length / 2)];
        cur.loud = cur.e / Math.max(1, endFrame - cur.f0);
        notes.push(cur);
      }
      cur = null;
    }
    var gap = 0, off = 0, peak = 0;
    for (i = 0; i < n; i++) {
      var f = an.f0[i], r = an.rms[i];
      if (f <= 0) { gap++; if (gap >= 3) close(i - gap + 1); continue; }
      gap = 0;
      var m = T.midiOf(f);
      if (cur) {
        var ps2 = cur.p.slice(-6).sort(function (a, b) { return a - b; }), med = ps2[Math.floor(ps2.length / 2)];
        if (Math.abs(m - med) > 0.8) off++; else off = 0;
        peak = Math.max(peak * 0.97, r);
        var reattack = r > 1.7 * (an.rms[i - 3] || 0) && (an.rms[i - 3] || 0) < 0.55 * peak && i - cur.f0 > 6;
        if (off >= 5 || reattack) { close(i - (off >= 5 ? 4 : 0)); off = 0; }
      }
      if (!cur) { cur = { f0: i, p: [], e: 0 }; peak = r; }
      cur.p.push(m); cur.e += r;
    }
    close(n);
    // into beats on the grid
    var out = [], weights = {};
    notes.forEach(function (nt) {
      var t0 = nt.f0 * hop + an.offset - start, t1 = nt.end * hop + an.offset - start;
      var b0 = Math.round(t0 / spb / grid) * grid, b1 = Math.round(t1 / spb / grid) * grid;
      if (b1 <= b0) b1 = b0 + grid;
      if (b0 < 0) return;
      var p = Math.round(nt.pitch);
      weights[((p % 12) + 12) % 12] = (weights[((p % 12) + 12) % 12] || 0) + (b1 - b0);
      out.push({ t: b0, d: b1 - b0, p: p, raw: nt.pitch, v: 0.8 });
    });
    // no overlaps: a note ends where the next starts
    out.sort(function (a, b) { return a.t - b.t; });
    for (i = 0; i < out.length - 1; i++) if (out[i].t + out[i].d > out[i + 1].t) out[i].d = Math.max(grid, out[i + 1].t - out[i].t);
    out = out.filter(function (nt, k) { return k === 0 || nt.t !== out[k - 1].t; });
    var guess = T.detectKey(weights);
    if (opts.snap) {
      var key = opts.key !== undefined ? opts.key : guess.key, scale = opts.scale || guess.scale;
      out.forEach(function (nt) { nt.p = T.snap(nt.raw, key, scale); });
    }
    if (opts.range && out.length) {  // fold into the instrument's range by whole octaves
      var ps3 = out.map(function (nt) { return nt.p; }).sort(function (a, b) { return a - b; });
      var mid = ps3[Math.floor(ps3.length / 2)], want = (opts.range[0] + opts.range[1]) / 2;
      var sh = Math.round((want - mid) / 12) * 12;
      out.forEach(function (nt) { nt.p += sh; });
    }
    out.forEach(function (nt) { delete nt.raw; });
    var lenBeats = out.length ? out[out.length - 1].t + out[out.length - 1].d : 0;
    return { notes: out, key: guess.key, scale: guess.scale, keyName: T.pcName(guess.key) + ' ' + guess.scale, beats: lenBeats, analysis: { voicedFrames: an.f0.filter(function (x) { return x > 0; }).length, frames: n } };
  };

  // ------------------------------------------------------------------ beatbox -> drums
  V.beatboxToDrums = function (samples, sr, opts) {
    opts = opts || {};
    var bpm = opts.bpm || 100, spb = 60 / bpm, grid = opts.grid || 0.25, start = opts.start || 0;
    var hop = Math.round(sr * 0.005), n = Math.floor(samples.length / hop), env = new Float32Array(n), i, j;
    for (i = 0; i < n; i++) { var e = 0; for (j = 0; j < hop; j++) { var s = samples[i * hop + j] || 0; e += s * s; } env[i] = Math.sqrt(e / hop); }
    var peak = 0; for (i = 0; i < n; i++) peak = Math.max(peak, env[i]);
    var gate = Math.max(0.01, peak * 0.15), onsets = [], last = -999;
    for (i = 6; i < n; i++) {
      var prev = 0; for (j = 1; j <= 6; j++) prev += env[i - j]; prev /= 6;
      if (env[i] > gate && env[i] > prev * 2.2 && i - last > 16) { onsets.push(i); last = i; }
    }
    var hits = [];
    onsets.forEach(function (o) {
      var a = o * hop, len = Math.min(Math.round(sr * 0.04), samples.length - a), zc = 0, lowE = 0, totE = 0, lp = 0, k = Math.exp(-2 * Math.PI * 180 / sr);
      for (var q = 1; q < len; q++) {
        var x = samples[a + q], xp = samples[a + q - 1];
        if ((x >= 0) !== (xp >= 0)) zc++;
        lp = (1 - k) * x + k * lp; lowE += lp * lp; totE += x * x;
      }
      var zcr = zc / len, lowRatio = totE > 0 ? lowE / totE : 0;
      var lane = (lowRatio > 0.42 || zcr < 0.045) ? 'kick' : 'noise';
      var b = Math.round(((o * hop) / sr - start) / spb / grid) * grid;
      if (b < 0) return;
      hits.push({ t: b, lane: lane, v: Math.min(1, 0.45 + env[o] / peak * 0.55), zcr: zcr, low: lowRatio });
    });
    // "tss" (hat) vs "psh" (snare): split the noisy sounds by brightness, relative to this person's own sounds
    var noisy = hits.filter(function (h) { return h.lane === 'noise'; }).map(function (h) { return h.zcr; }).sort(function (a, b2) { return a - b2; });
    var lo = noisy[0], hi = noisy[noisy.length - 1], split = (lo && hi / lo > 1.35) ? Math.sqrt(lo * hi) : (hi > 0.35 ? 0 : 9);
    hits.forEach(function (h) { if (h.lane === 'noise') h.lane = h.zcr > split ? 'hat' : 'snare'; });
    var seen = {}; hits = hits.filter(function (h) { var k2 = h.t + h.lane; if (seen[k2]) return false; seen[k2] = 1; return true; });
    var beats = hits.length ? Math.ceil((hits[hits.length - 1].t + 0.01) / 4) * 4 : 4;
    hits.forEach(function (h) { delete h.zcr; delete h.low; });
    return { hits: hits, beats: beats };
  };

  // ------------------------------------------------------------------ the microphone
  var MIC = { stream: null, src: null, proc: null, chunks: [], recording: false, level: 0, t0: 0 };
  V.micReady = function () { return !!MIC.stream; };
  V.openMic = function () {
    if (MIC.stream) return Promise.resolve(MIC.stream);
    if (!root.navigator || !root.navigator.mediaDevices) return Promise.reject(new Error('This browser has no microphone access.'));
    return root.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } })
      .then(function (s) {
        MIC.stream = s;
        var ctx = HB.audio.ctx();
        MIC.src = ctx.createMediaStreamSource(s);
        MIC.proc = ctx.createScriptProcessor(4096, 1, 1);
        var silent = ctx.createGain(); silent.gain.value = 0;
        MIC.src.connect(MIC.proc); MIC.proc.connect(silent); silent.connect(ctx.destination);
        MIC.proc.onaudioprocess = function (e) {
          var d = e.inputBuffer.getChannelData(0), pk = 0;
          for (var i = 0; i < d.length; i += 4) pk = Math.max(pk, Math.abs(d[i]));
          MIC.level = Math.max(pk, MIC.level * 0.85);
          if (MIC.recording) {
            if (!MIC.chunks.length) MIC.t0 = ctx.currentTime - d.length / ctx.sampleRate;
            MIC.chunks.push(new Float32Array(d));
          }
        };
        return s;
      });
  };
  V.closeMic = function () {
    if (MIC.stream) MIC.stream.getTracks().forEach(function (t) { t.stop(); });
    try { if (MIC.proc) MIC.proc.disconnect(); if (MIC.src) MIC.src.disconnect(); } catch (e) {}
    MIC.stream = MIC.src = MIC.proc = null; MIC.recording = false;
  };
  V.micLevel = function () { var l = MIC.level; MIC.level *= 0.9; return l; };
  V.startRecording = function () { MIC.chunks = []; MIC.recording = true; };
  V.recording = function () { return MIC.recording; };
  V.recordedSeconds = function () { var n = 0; MIC.chunks.forEach(function (c) { n += c.length; }); return n / HB.audio.ctx().sampleRate; };
  // -> {samples, sr, t0 (AudioContext time of the first sample)}
  V.stopRecording = function () {
    MIC.recording = false;
    var n = 0; MIC.chunks.forEach(function (c) { n += c.length; });
    var out = new Float32Array(n), p = 0;
    MIC.chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    MIC.chunks = [];
    return { samples: out, sr: HB.audio.ctx().sampleRate, t0: MIC.t0 };
  };
  // smaller copy for storing (32 kHz is plenty for a voice and keeps uploads small)
  V.toStorageRate = function (samples, sr) {
    var target = 32000;
    if (sr <= target) return { samples: samples, sr: sr };
    return { samples: resample(samples, sr / target), sr: target };
  };
  V.resample = resample;
})(typeof window !== 'undefined' ? window : globalThis);
