// Voice maths in Node with synthetic voices: pitch tracking, hum to notes, auto-tune, pitch shift, character,
// harmony, beatbox to drums. Run: node tools/testing/voice_test.js  -> prints VOICE OK
const path = require('path');
global.window = undefined;
require(path.join(__dirname, '../../theme/assets/hb-music.js'));
require(path.join(__dirname, '../../theme/assets/hb-voice.js'));
const HB = globalThis.HB, V = HB.voice, T = HB.theory;
const SR = 32000;
let failures = 0;
function check(cond, msg) { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) failures++; }

// a "sung" note: harmonics shaped by two formants, light vibrato, soft attack/release
function sing(notes, sr, opts) {
  opts = opts || {};
  const total = notes.reduce((a, n) => a + n.dur + (n.gap || 0), 0) + 0.3;
  const out = new Float32Array(Math.ceil(total * sr));
  let t0 = 0.15, phase = 0;
  for (const n of notes) {
    const N = Math.floor(n.dur * sr), base = Math.floor(t0 * sr);
    for (let i = 0; i < N; i++) {
      const t = i / sr, f = T.freq(n.midi + (n.cents || 0) / 100) * (1 + 0.006 * Math.sin(2 * Math.PI * 5.5 * t));
      phase += 2 * Math.PI * f / sr;
      let s = 0;
      for (let h = 1; h <= 12; h++) {
        const fh = f * h, form = Math.exp(-Math.pow((fh - 700) / 300, 2)) + 0.6 * Math.exp(-Math.pow((fh - 1200) / 400, 2)) + 0.15;
        s += Math.sin(phase * h) * form / h;
      }
      const env = Math.min(1, i / (0.03 * sr)) * Math.min(1, (N - i) / (0.04 * sr));
      out[base + i] += s * 0.25 * env;
    }
    t0 += n.dur + (n.gap || 0);
  }
  return out;
}
function medianPitch(an, from, to) {
  const v = []; for (let i = Math.floor(from / an.hop); i < Math.floor(to / an.hop) && i < an.n; i++) if (an.f0[i] > 0) v.push(T.midiOf(an.f0[i]));
  v.sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN;
}

// 1. pitch tracking
const melody = [{ midi: 60, dur: 0.45, gap: 0.08 }, { midi: 62, dur: 0.45, gap: 0.08 }, { midi: 64, dur: 0.45, gap: 0.08 }, { midi: 67, dur: 0.9, gap: 0.1 }];
const x = sing(melody, SR);
let t = Date.now();
const an = V.analyse(x, SR);
check(Math.abs(medianPitch(an, 0.25, 0.5) - 60) < 0.3, 'YIN finds C4 (got ' + medianPitch(an, 0.25, 0.5).toFixed(2) + ')');
check(Math.abs(medianPitch(an, 1.9, 2.5) - 67) < 0.3, 'YIN finds G4 (got ' + medianPitch(an, 1.9, 2.5).toFixed(2) + ')');
console.log('     analyse: ' + (Date.now() - t) + ' ms for ' + (x.length / SR).toFixed(1) + ' s');

// 2. hum to notes (100 bpm: a beat is 0.6 s)
const hum = V.humToNotes(x, SR, { bpm: 100, start: 0.15, grid: 0.25 });
check(hum.notes.length === 4, 'hum: 4 notes (got ' + hum.notes.length + ': ' + hum.notes.map(n => T.name(n.p) + '@' + n.t).join(' ') + ')');
check(hum.notes.map(n => n.p).join() === '60,62,64,67', 'hum: pitches C D E G');
check(hum.notes[0].t === 0 && Math.abs(hum.notes[1].t - 0.88) < 0.3, 'hum: timing on the beat grid (' + hum.notes.map(n => n.t).join(', ') + ')');
const humSnap = V.humToNotes(sing([{ midi: 61, dur: 0.5, gap: 0.1, cents: 20 }, { midi: 64, dur: 0.5 }], SR), SR, { bpm: 100, snap: true, key: 0, scale: 'major' });
check(humSnap.notes[0] && (humSnap.notes[0].p === 60 || humSnap.notes[0].p === 62), 'hum: C# snaps into C major (' + (humSnap.notes[0] && T.name(humSnap.notes[0].p)) + ')');
const humRange = V.humToNotes(x, SR, { bpm: 100, range: [28, 52] });
check(humRange.notes[0].p === 36, 'hum: folded into the bass range (C2, got ' + T.name(humRange.notes[0].p) + ')');
const repeated = sing([{ midi: 64, dur: 0.3, gap: 0.04 }, { midi: 64, dur: 0.3, gap: 0.04 }, { midi: 64, dur: 0.3 }], SR);
check(V.humToNotes(repeated, SR, { bpm: 100 }).notes.length === 3, 'hum: three "da da da" on one note are three notes');

// 3. auto-tune: a flat note (40 cents low) snaps to the scale
const flat = sing([{ midi: 64, dur: 1.2, cents: -40 }], SR);
const tuned = V.process(flat, SR, { tune: 1, speed: 0 }, 0, 'major');
const anT = V.analyse(tuned.left, SR);
const before = medianPitch(V.analyse(flat, SR), 0.4, 1.1), after = medianPitch(anT, 0.4, 1.1);
check(Math.abs(after - 64) < 0.12 && Math.abs(before - 63.6) < 0.15, 'auto-tune: 63.6 -> ' + after.toFixed(2) + ' (E4 = 64)');
const half = V.process(flat, SR, { tune: 0.5, speed: 0 }, 0, 'major');
const mid = medianPitch(V.analyse(half.left, SR), 0.4, 1.1);
check(mid > 63.7 && mid < 63.95, 'auto-tune 50%: halfway (' + mid.toFixed(2) + ')');

// 4. pitch shift +5 semitones and the length is kept
const up = V.process(flat, SR, { pitch: 5 }, 0, 'chromatic');
check(up.left.length === flat.length, 'pitch shift keeps the length');
check(Math.abs(medianPitch(V.analyse(up.left, SR), 0.4, 1.1) - 68.6) < 0.25, 'pitch +5: 63.6 -> ' + medianPitch(V.analyse(up.left, SR), 0.4, 1.1).toFixed(2));
const down = V.process(flat, SR, { pitch: -12 }, 0, 'chromatic');
check(Math.abs(medianPitch(V.analyse(down.left, SR, { fmin: 60 }), 0.4, 1.1) - 51.6) < 0.3, 'pitch -12: an octave down (' + medianPitch(V.analyse(down.left, SR, { fmin: 60 }), 0.4, 1.1).toFixed(2) + ')');

// 5. character moves formants but not the pitch
const ch = V.process(flat, SR, { character: 5 }, 0, 'chromatic');
check(Math.abs(medianPitch(V.analyse(ch.left, SR), 0.4, 1.0) - 63.6) < 0.3, 'character +5: pitch stays (' + medianPitch(V.analyse(ch.left, SR), 0.4, 1.0).toFixed(2) + ')');
function centroid(sig) {  // brightness: zero crossings per second of the high-passed signal
  let zc = 0; for (let i = 1; i < sig.length; i++) if ((sig[i] - sig[i - 1] >= 0) !== (sig[i - 1] - (sig[i - 2] || 0) >= 0)) zc++; return zc / (sig.length / SR);
}
check(centroid(ch.left) > centroid(flat) * 1.1, 'character +5: brighter (' + Math.round(centroid(flat)) + ' -> ' + Math.round(centroid(ch.left)) + ')');

// 6. harmony adds a voice a third above (E -> G in C major)
const harm = V.process(sing([{ midi: 64, dur: 1.2 }], SR), SR, { tune: 1, speed: 0, harmony: 'third' }, 0, 'major');
const diff = new Float32Array(harm.left.length); for (let i = 0; i < diff.length; i++) diff[i] = harm.left[i] - harm.right[i];
const anH = V.analyse(diff, SR);
check(Math.abs(medianPitch(anH, 0.4, 1.1) - 67) < 0.4, 'harmony third above E4 = G4 (' + medianPitch(anH, 0.4, 1.1).toFixed(2) + ')');

// 7. robot: a gliding voice becomes one note
const glide = new Float32Array(SR * 1.5); let ph = 0;
for (let i = 0; i < glide.length; i++) { const f = T.freq(60 + 4 * i / glide.length); ph += 2 * Math.PI * f / SR; let s = 0; for (let h = 1; h < 8; h++) s += Math.sin(ph * h) / h; glide[i] = s * 0.2 * Math.min(1, i / 800, (glide.length - i) / 800); }
const rob = V.analyse(V.process(glide, SR, { tune: 1, speed: 0, robot: 1 }, 0, 'major').left, SR);
const r1 = medianPitch(rob, 0.2, 0.5), r2 = medianPitch(rob, 1.0, 1.3);
check(Math.abs(r1 - r2) < 0.2 && Math.abs(r1 - 60) < 0.3, 'robot: monotone C4 (' + r1.toFixed(2) + ', ' + r2.toFixed(2) + ')');

// 8. beatbox: boom (kick), tss (hat), psh (snare)
function bb(kinds, sr) {
  const out = new Float32Array(Math.ceil(sr * (kinds.length * 0.3 + 0.4))); let seed = 1;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x3fffffff - 1; };
  kinds.forEach((k, j) => {
    const a = Math.floor((0.2 + j * 0.3) * sr); let lp = 0, prev = 0;
    for (let i = 0; i < sr * 0.15; i++) {
      const t = i / sr, e = Math.exp(-t * (k === 'kick' ? 18 : k === 'hat' ? 60 : 25)); let s;
      if (k === 'kick') s = Math.sin(2 * Math.PI * (60 + 90 * Math.exp(-t * 30)) * t);
      else { const n = rnd(); if (k === 'hat') { s = n - prev; prev = n; } else { lp += (n - lp) * 0.35; s = lp * 2; } }
      out[a + i] += s * e * 0.6;
    }
  });
  return out;
}
const beat = V.beatboxToDrums(bb(['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat'], SR), SR, { bpm: 100, start: 0.2, grid: 0.25 });
check(beat.hits.map(h => h.lane).join(' ') === 'kick hat snare hat kick kick snare hat', 'beatbox: ' + beat.hits.map(h => h.lane).join(' '));
check(beat.hits[1].t === 0.5, 'beatbox: on the grid (' + beat.hits.map(h => h.t).join(', ') + ')');

// 9. theory
check(T.snap(61, 0, 'major') === 60 || T.snap(61, 0, 'major') === 62, 'snap C# to C major');
check(T.chordName(0, 'major', 6, '') === 'Am' && T.chordName(9, 'minor', 1, '7') === 'Am7', 'chord names');
check(T.detectKey({ 9: 4, 0: 3, 4: 3, 2: 1, 11: 1, 5: 1, 7: 1 }).scale === 'minor', 'key detection: A minor-ish');

console.log(failures ? failures + ' FAILED' : 'VOICE OK');
process.exit(failures ? 1 : 0);
