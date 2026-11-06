// Song engine in Node: every genre builds a valid song, progressions regenerate, transitions, MIDI + WAV writers.
// Run: node tools/testing/engine_test.js  -> prints ENGINE OK
const path = require('path');
require(path.join(__dirname, '../../theme/assets/hb-music.js'));
require(path.join(__dirname, '../../theme/assets/hb-audio.js'));
require(path.join(__dirname, '../../theme/assets/hb-voice.js'));
const HB = globalThis.HB;
let failures = 0;
function check(cond, msg) { if (!cond) { console.log('FAIL ' + msg); failures++; } else console.log('ok   ' + msg); }

const presets = {}; HB.voice.PRESETS.forEach(p => { presets[p.id] = 1; });
HB.GENRES.forEach(g => {
  const doc = HB.Doc.fromRecipe(g.id, { seed: 3 });
  const tracks = {}; doc.tracks.forEach(t => { tracks[t.id] = t; });
  const badClip = doc.clips.find(c => !tracks[c.track] || (c.pat && !doc.patterns[c.pat]));
  const len = HB.Doc.lengthBeats(doc);
  const notes = Object.values(doc.patterns).reduce((a, p) => a + (p.notes ? p.notes.length : p.hits.length), 0);
  const badNote = Object.values(doc.patterns).some(p => (p.notes || []).some(n => !(n.d > 0) || isNaN(n.p) || n.p < 12 || n.p > 110));
  const instOk = doc.tracks.every(t => t.kind === 'voice' ? presets[t.voice.preset] : t.kind === 'drums' ? HB.KITS[t.inst] : HB.INSTRUMENTS.some(i => i.id === t.inst));
  const groove = !!HB.GROOVES[g.groove];
  check(!badClip && len >= 48 && notes > 50 && !badNote && instOk && groove && doc.tracks.some(t => t.kind === 'voice'),
    g.id + ': ' + doc.tracks.length + ' tracks, ' + doc.clips.length + ' clips, ' + notes + ' notes, ' + Math.round(len / 4) + ' bars, ' + (len * 60 / doc.bpm).toFixed(0) + ' s');
  const json = JSON.stringify(doc);
  check(json.length < 200000, g.id + ': document is ' + Math.round(json.length / 1024) + ' KB');
  HB.voice.applyPreset(doc.tracks.find(t => t.kind === 'voice'), g.parts.find(p => p[0] === 'voice')[2]);
});
const d1 = HB.Doc.fromRecipe('mumble', { seed: 5 }), d2 = HB.Doc.fromRecipe('mumble', { seed: 5 });
check(JSON.stringify(d1.patterns).replace(/p[0-9a-z]+/g, '') === JSON.stringify(d2.patterns).replace(/p[0-9a-z]+/g, ''), 'same seed, same song');
const changed = HB.Doc.setProgression(d1, 'verse', [6, 4, 1, 5], '');
check(changed > 0 && HB.Doc.progression(d1, 'verse').deg.join() === '6,4,1,5', 'new verse chords regenerate ' + changed + ' clips');
const tr = HB.audio._internals.transitionAt(d1);
check(tr.length >= 3 && tr.every(t => t.at > 0), 'transitions: ' + tr.map(t => t.type + '@' + t.at).join(' '));
check(HB.audio._internals.swingBeat(0.25, 0.2) === 0.3 && HB.audio._internals.swingBeat(0.5, 0.2) === 0.5, 'swing moves only the off-beat 16ths');
const ev = HB.audio.trackEvents(d1, d1.tracks[0]);
check(ev.length > 100 && ev.every(e => e.midi >= 35 && e.midi <= 50), 'drum events in General MIDI drum notes (' + ev.length + ')');
const empty = HB.Doc.fromRecipe('house', { empty: true });
check(empty.sections.length === 2 && empty.tracks.length === 2 && empty.clips.length > 0, 'empty song: drums + a voice track');
HB.Doc.starterPart(d1, d1.tracks[1]);
check(d1.clips.some(c => c.track === d1.tracks[1].id), 'starter part fills a track');
(async () => {
  const mid = Buffer.from(await HB.audio.midi(d1).arrayBuffer());
  check(mid.slice(0, 4).toString() === 'MThd' && mid.readUInt16BE(10) === d1.tracks.filter(t => t.kind !== 'voice').length + 1, 'MIDI file: ' + mid.length + ' bytes, ' + mid.readUInt16BE(10) + ' tracks');
  const wav = Buffer.from(await HB.audio.wavMono(new Float32Array([0, 0.5, -0.5, 1]), 32000).arrayBuffer());
  check(wav.slice(0, 4).toString() === 'RIFF' && wav.readUInt32LE(24) === 32000 && wav.readInt16LE(46) === 16383, 'WAV writer');
  console.log(failures ? failures + ' FAILED' : 'ENGINE OK');
  process.exit(failures ? 1 : 0);
})();
