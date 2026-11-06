/* hb-studio.js: the studio (window.HB.Studio). One object owns the open song: the document, selection, undo, the
   clipboard, recordings (takes) and their processed voices, and the views it draws into the page:
     arranger  sections bar, ruler, one lane per track with its clips (drag to move, edge to resize), playhead
     editor    the selected clip: piano roll (notes), drum grid (hits) or voice view (waveform + pitch curves)
     prompter  the lyrics of the section you are in, line by line, while you play or record
   Python (Pages/Studio + the ribbon Forms) calls st.cmd(name, json) and hears back through hooks.change(stateJson),
   hooks.save(docJson) and hooks.saveTake(id, blob, seconds) -> Promise(key). Drawing and dragging stay here. */
(function (root) {
  'use strict';
  var HB = root.HB = root.HB || {};
  var T = HB.theory, A = HB.audio, V = HB.voice;
  var LANE_H = 68, HEAD_H = 50;

  function el(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function css(name, fallback) { var v = getComputedStyle(document.documentElement).getPropertyValue(name); return (v && v.trim()) || fallback; }
  function tkColor(i) { return css('--tk-' + ((i || 0) % 8), '#ff3e7f'); }
  function fmtTime(sec) { sec = Math.max(0, sec); var m = Math.floor(sec / 60), s = Math.floor(sec % 60); return m + ':' + (s < 10 ? '0' : '') + s; }
  function dpr(canvas, w, h) { var r = root.devicePixelRatio || 1; canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; var c = canvas.getContext('2d'); c.setTransform(r, 0, 0, r, 0, 0); return c; }

  // ------------------------------------------------------------------ guest recordings live in IndexedDB
  var IDB = HB.store = {
    db: function () {
      if (IDB._p) return IDB._p;
      IDB._p = new Promise(function (res, rej) {
        if (!root.indexedDB) { rej(new Error('no IndexedDB')); return; }
        var r = root.indexedDB.open('humbeat', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('takes'); };
        r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
      });
      return IDB._p;
    },
    put: function (id, blob) { return IDB.db().then(function (db) { return new Promise(function (res, rej) { var tx = db.transaction('takes', 'readwrite'); tx.objectStore('takes').put(blob, id); tx.oncomplete = function () { res(id); }; tx.onerror = function () { rej(tx.error); }; }); }); },
    get: function (id) { return IDB.db().then(function (db) { return new Promise(function (res, rej) { var q = db.transaction('takes').objectStore('takes').get(id); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); }; }); }); },
    del: function (id) { return IDB.db().then(function (db) { return new Promise(function (res) { var tx = db.transaction('takes', 'readwrite'); tx.objectStore('takes').delete(id); tx.oncomplete = function () { res(); }; }); }); }
  };

  function decodeWav(ab) {  // our own 16-bit mono WAVs -> {samples, sr}
    var v = new DataView(ab), p = 12, sr = 32000, data = null, ch = 1;
    while (p + 8 <= v.byteLength) {
      var id = String.fromCharCode(v.getUint8(p), v.getUint8(p + 1), v.getUint8(p + 2), v.getUint8(p + 3)), size = v.getUint32(p + 4, true);
      if (id === 'fmt ') { ch = v.getUint16(p + 10, true); sr = v.getUint32(p + 12, true); }
      if (id === 'data') { data = [p + 8, size]; break; }
      p += 8 + size + (size % 2);
    }
    if (!data) throw new Error('not a WAV');
    var n = Math.floor(data[1] / 2 / ch), out = new Float32Array(n);
    for (var i = 0; i < n; i++) out[i] = v.getInt16(data[0] + i * 2 * ch, true) / 32768;
    return { samples: out, sr: sr };
  }
  HB.decodeWav = decodeWav;

  var CRC = null;
  function crc32(u8) {
    if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    var x = 0xffffffff; for (var i = 0; i < u8.length; i++) x = CRC[(x ^ u8[i]) & 255] ^ (x >>> 8);
    return (x ^ 0xffffffff) >>> 0;
  }
  // files [{name, blob}] -> Promise(Blob application/zip); stored entries (WAV barely compresses, and this stays quick)
  HB.zip = function (files) {
    return Promise.all(files.map(function (f) { return f.blob.arrayBuffer(); })).then(function (bufs) {
      var parts = [], central = [], offset = 0, enc = new TextEncoder();
      bufs.forEach(function (ab, i) {
        var data = new Uint8Array(ab), name = enc.encode(files[i].name), crc = crc32(data);
        var lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
        lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
        parts.push(lh, name, data);
        var ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
        ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);
        central.push(ch, name);
        offset += 30 + name.length + data.length;
      });
      var size = central.reduce(function (a, p) { return a + p.byteLength; }, 0);
      var end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
      end.setUint32(12, size, true); end.setUint32(16, offset, true);
      return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
    });
  };

  function download(blob, name) {
    var a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }
  function safeName(s) { return String(s || 'humbeat-song').replace(/[^a-z0-9 _-]+/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'humbeat-song'; }

  // ------------------------------------------------------------------ the studio
  function Studio(opts) {
    var st = this;
    st.opts = opts || {};
    st.hooks = st.opts.hooks || {};
    st.doc = typeof st.opts.doc === 'string' ? JSON.parse(st.opts.doc) : st.opts.doc;
    st.normalize();
    st.editable = st.opts.editable !== false;
    st.sel = { track: (st.doc.tracks[0] || {}).id || null, clip: null, note: null, section: null };
    st.undo = []; st.redo = []; st.clip = null;
    st.pos = 0; st.zoom = 22; st.follow = true; st.metronome = false; st.countIn = true; st.prompterOn = false;
    st.latencyMs = Number(st.opts.latencyMs || 0);
    st.mode = 'idle'; st.takes = {}; st.processed = {}; st.views = [];
    st.status = '';
    st._raf = 0; st._saveT = 0; st._chT = 0; st._live = null;
    st.loadTakes();
    st._key = function (e) { st.onKey(e); };
    document.addEventListener('keydown', st._key);
    st.loop();
  }
  HB.Studio = Studio;
  var S = Studio.prototype;

  S.normalize = function () {
    var d = this.doc;
    d.tracks = d.tracks || []; d.clips = d.clips || []; d.patterns = d.patterns || {}; d.takes = d.takes || {}; d.lyrics = d.lyrics || {};
    d.sections = d.sections && d.sections.length ? d.sections : [{ id: 's1', kind: 'verse', name: 'Verse', bars: 8, trans: 'none' }];
    d.master = d.master || { vol: 0.85 }; d.meter = d.meter || 4; d.bpm = clamp(Number(d.bpm) || 100, 40, 220);
    d.tracks.forEach(function (t) { t.fx = Object.assign(HB.blankFx(t.role), t.fx || {}); if (t.kind === 'voice') t.voice = Object.assign({}, HB.VOICE_DEFAULT, t.voice || {}); });
  };

  // ---- change plumbing
  S.snapshot = function () { this.undo.push(JSON.stringify(this.doc)); if (this.undo.length > 80) this.undo.shift(); this.redo = []; };
  S.mutate = function (fn, liveKey) {
    if (!this.editable) return;
    var now = Date.now();
    if (!(liveKey && this._live && this._live.key === liveKey && now - this._live.t < 900)) this.snapshot();
    this._live = liveKey ? { key: liveKey, t: now } : null;
    var r = fn();
    this.changed(true);
    return r;
  };
  S.changed = function (docChanged) {
    var st = this;
    if (docChanged) {
      A.update(st.doc);
      clearTimeout(st._saveT);
      st._saveT = setTimeout(function () { st.save(); }, 1200);
    }
    st.draw();
    st.notify();
  };
  S.save = function () {
    clearTimeout(this._saveT); this._saveT = 0;
    if (this.editable && this.hooks.save) this.hooks.save(JSON.stringify(this.doc));
  };
  S.flush = function () { if (this._saveT) this.save(); };
  S.notify = function () {
    var st = this;
    if (st._chT) return;
    st._chT = setTimeout(function () { st._chT = 0; if (st.hooks.change) st.hooks.change(st.stateJson()); }, 60);
  };
  S.setStatus = function (text, kind) { this.status = text || ''; if (this.hooks.status) this.hooks.status(text || '', kind || ''); };

  S.track = function (id) { return this.doc.tracks.filter(function (t) { return t.id === id; })[0] || null; };
  S.clipById = function (id) { return this.doc.clips.filter(function (c) { return c.id === id; })[0] || null; };
  S.selTrack = function () { return this.track(this.sel.track); };
  S.selClip = function () { return this.clipById(this.sel.clip); };
  S.len = function () { return HB.Doc.lengthBeats(this.doc); };

  S.stateJson = function () {
    var st = this, d = st.doc, pos = st.position(), sec = HB.Doc.sectionAt(d, pos) || { s: d.sections[0], start: 0, index: 0 };
    var tr = st.selTrack(), cl = st.selClip(), g = HB.genre(d.genre);
    var linked = cl && cl.pat ? d.clips.filter(function (c) { return c.pat === cl.pat; }).length : 0;
    var anySolo = d.tracks.some(function (t) { return t.solo; });
    var selSec = st.sel.section ? d.sections.filter(function (s) { return s.id === st.sel.section; })[0] : null;
    var section = selSec || sec.s;
    return JSON.stringify({
      mode: st.mode, playing: A.playing() && st.mode !== 'idle', pos: pos, bar: Math.floor(pos / 4) + 1, beat: Math.floor(pos % 4) + 1,
      bpm: d.bpm, key: d.key, keyName: T.pcName(d.key), scale: d.scale, scaleName: (T.SCALES[d.scale] || T.SCALES.major).name, swing: d.swing || 0,
      title: d.title, genre: d.genre, genreName: g.name, editable: st.editable,
      canUndo: st.undo.length > 0, canRedo: st.redo.length > 0, metronome: st.metronome, countIn: st.countIn, prompter: st.prompterOn,
      follow: st.follow, zoom: st.zoom, loop: !!d.loop, master: d.master.vol, latency: st.latencyMs, status: st.status,
      lengthText: fmtTime(st.len() * 60 / d.bpm), bars: Math.round(st.len() / 4), hasClip: !!cl, clipboard: !!st.clip,
      tracks: d.tracks.map(function (t) {
        return { id: t.id, name: t.name, kind: t.kind, role: t.role || '', inst: t.inst, instName: t.kind === 'drums' ? HB.kit(t.inst).name : t.kind === 'voice' ? V.preset(t.voice.preset).name + ' voice' : HB.inst(t.inst).name,
          color: t.color || 0, vol: t.vol, pan: t.pan || 0, mute: !!t.mute, solo: !!t.solo, quiet: !!t.mute || (anySolo && !t.solo), sel: t.id === st.sel.track };
      }),
      sig: d.tracks.map(function (t) { return [t.id, t.name, t.inst, t.color, t.mute, t.solo, t.id === st.sel.track, t.kind === 'voice' ? t.voice.preset : ''].join(':'); }).join('|') + '#' + anySolo,
      track: tr ? { id: tr.id, name: tr.name, kind: tr.kind, inst: tr.inst, oct: tr.oct || 0, fx: tr.fx, voice: tr.voice || null, color: tr.color, vol: tr.vol, pan: tr.pan || 0 } : null,
      clip: cl ? { id: cl.id, start: cl.start, len: cl.len, kind: cl.take ? 'voice' : (d.patterns[cl.pat] || {}).kind, linked: linked,
        name: cl.take ? 'Recording' : ((d.patterns[cl.pat] || {}).name || 'Part'), bars: cl.len / 4, patLen: (d.patterns[cl.pat] || {}).len || 0, gain: cl.gain === undefined ? 1 : cl.gain } : null,
      section: { id: section.id, name: section.name, kind: section.kind, bars: section.bars, trans: section.trans || 'none',
        index: d.sections.indexOf(section), prog: HB.Doc.progression(d, section.kind) },
      sections: d.sections.map(function (s) { return { id: s.id, name: s.name, kind: s.kind, bars: s.bars, trans: s.trans || 'none', words: (d.lyrics[s.id] || '').length }; }),
      takes: Object.keys(d.takes).length
    });
  };

  // ---- transport
  S.position = function () { return (A.playing() && this.mode !== 'idle') ? A.position() : this.pos; };
  S.takeBuffer = function (track, takeId) {
    var key = takeId + '|' + this.voiceHash(track);
    var p = this.processed[key];
    return p ? p : null;
  };
  S.voiceHash = function (track) { var v = track.voice || {}; return [v.tune, v.speed, v.pitch, v.character, v.harmony, v.double, v.robot, this.doc.key, this.doc.scale].join(','); };
  // make sure every recording used by the song is processed with its track's voice settings (before playing)
  S.prepareVoices = function () {
    var st = this, d = st.doc, todo = [];
    d.clips.forEach(function (c) {
      if (!c.take) return;
      var tr = st.track(c.track); if (!tr || !st.takes[c.take] || !st.takes[c.take].samples) return;
      var key = c.take + '|' + st.voiceHash(tr);
      if (!st.processed[key] && todo.indexOf(key) < 0) todo.push(key);
    });
    if (!todo.length) return 0;
    var ctx = A.ctx(), t0 = Date.now();
    todo.forEach(function (key) {
      var parts = key.split('|'), take = st.takes[parts[0]];
      var tr = d.tracks.filter(function (t) { return t.kind === 'voice' && st.voiceHash(t) === parts[1]; })[0];
      var out = V.process(take.samples, take.sr, tr.voice, d.key, d.scale, take.an);
      take.an = out.an || take.an;
      var buf = ctx.createBuffer(2, out.left.length, take.sr);
      buf.copyToChannel(out.left, 0); buf.copyToChannel(out.right, 1);
      st.processed[key] = buf;
    });
    return Date.now() - t0;
  };
  S.play = function (from) {
    var st = this;
    A.unlock();
    st.prepareVoices();
    var start = from !== undefined ? from : st.pos;
    if (start >= st.len() - 0.01) start = 0;
    st.mode = 'play';
    A.play(st.doc, start, { metronome: st.metronome, takeBuffer: st.takeBuffer.bind(st), onEnd: function () { st.mode = 'idle'; st.pos = 0; st.changed(false); } });
    st.changed(false);
  };
  S.stop = function () {
    var st = this, wasRec = st.mode === 'rec' || st.mode === 'hum' || st.mode === 'beatbox';
    if (A.playing()) st.pos = Math.max(0, A.position());
    A.stop();
    if (wasRec) st.finishRecording();
    st.mode = 'idle';
    st.changed(false);
  };
  S.toggle = function () { if (this.mode !== 'idle') this.stop(); else this.play(); };
  S.seek = function (beat) {
    var st = this, was = st.mode === 'play';
    st.pos = clamp(beat, 0, st.len());
    if (was) { A.stop(); st.play(st.pos); } else st.changed(false);
  };

  // ---- recording a voice take
  S.voiceTrack = function () {
    var st = this, tr = st.selTrack();
    if (tr && tr.kind === 'voice') return tr;
    tr = st.doc.tracks.filter(function (t) { return t.kind === 'voice'; })[0];
    if (tr) return tr;
    return st.addTrack('voice', 'pop');
  };
  S.record = function () {
    var st = this;
    if (!st.editable) return Promise.resolve(false);
    if (st.mode !== 'idle') { st.stop(); return Promise.resolve(true); }
    A.unlock();
    st.setStatus('Asking for your microphone...');
    return V.openMic().then(function () {
      var tr = st.voiceTrack();
      st.sel.track = tr.id; st.sel.clip = null;
      st.prepareVoices();
      var from = Math.floor(st.pos / 4) * 4;
      st._rec = { kind: 'voice', track: tr.id, from: from };
      st.mode = 'rec';
      V.startRecording();
      A.play(st.doc, from, { countIn: st.countIn ? 4 : 0, metronome: st.metronome, takeBuffer: st.takeBuffer.bind(st), onEnd: function () { st.stop(); } });
      st._rec.beat0 = A.startTime();
      st.setStatus('Recording. Press Stop (or Space) when you are done.', 'rec');
      if (!st.prompterOn && Object.keys(st.doc.lyrics).length) st.showPrompter(true, true);
      st.changed(false);
      return true;
    }, function (e) {
      st.setStatus('No microphone: ' + (e && e.message ? e.message : 'permission was not given') + '.', 'error');
      st.mode = 'idle'; st.changed(false);
      return false;
    });
  };
  S.finishRecording = function () {
    var st = this, rec = st._rec; st._rec = null;
    if (!rec) return;
    var raw = V.stopRecording();
    if (st._autoPrompter) { st.showPrompter(false); st._autoPrompter = false; }
    if (rec.kind === 'hum' || rec.kind === 'beatbox') { st._hum = { kind: rec.kind, raw: raw, beat0: rec.beat0, from: rec.from, track: rec.track }; if (st.hooks.recorded) st.hooks.recorded(rec.kind); return; }
    var ctx = A.ctx(), lat = (ctx.outputLatency || 0) + (ctx.baseLatency || 0) + 0.012 + st.latencyMs / 1000;
    var store = V.toStorageRate(raw.samples, raw.sr);
    var offset = Math.max(0, rec.beat0 - raw.t0 + lat), dur = store.samples.length / store.sr - offset;
    if (dur < 0.3) { st.setStatus('That recording was too short to keep.', 'error'); return; }
    var id = HB.uid('k'), track = st.track(rec.track);
    st.takes[id] = { samples: store.samples, sr: store.sr };
    st.mutate(function () {
      st.doc.takes[id] = { sec: Math.round(store.samples.length / store.sr * 10) / 10, sr: store.sr, at: new Date().toISOString() };
      var beats = Math.ceil(dur * st.doc.bpm / 60 / 4) * 4, maxLen = st.len() - rec.from;
      var c = { id: HB.uid('c'), track: track.id, start: rec.from, len: Math.max(1, Math.min(beats, maxLen)), take: id, offset: Math.round(offset * 1000) / 1000 };
      st.doc.clips.push(c); st.sel.clip = c.id;
    });
    st.setStatus('Recorded ' + dur.toFixed(1) + ' s. Saving the take...', 'ok');
    st.storeTake(id, store.samples, store.sr);
  };
  S.storeTake = function (id, samples, sr) {
    var st = this, blob = A.wavMono(samples, sr), sec = samples.length / sr;
    var done = function (key) {
      if (key) st.doc.takes[id].key = key;
      else st.doc.takes[id].local = true;
      st.setStatus('Take saved.', 'ok');
      st.save();
    };
    if (st.opts.guest || !st.hooks.saveTake) { IDB.put(id, blob).then(function () { done(null); }, function () { st.setStatus('Could not keep the recording in this browser.', 'error'); }); return; }
    Promise.resolve(st.hooks.saveTake(id, blob, sec)).then(function (key) { if (key) done(String(key)); else st.setStatus('The take could not be saved. It plays until you leave the page.', 'error'); },
      function () { st.setStatus('The take could not be saved. It plays until you leave the page.', 'error'); });
  };
  S.loadTakes = function () {
    var st = this, ids = Object.keys(st.doc.takes).filter(function (id) { return !st.takes[id]; });
    if (!ids.length) return;
    st.setStatus('Loading ' + ids.length + (ids.length === 1 ? ' recording...' : ' recordings...'));
    var left = ids.length;
    ids.forEach(function (id) {
      var meta = st.doc.takes[id];
      var p = meta.key && st.opts.api ? fetch(st.opts.api.replace(/\/_\/api\/?$/, '') + '/_/api/take/' + meta.key).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        : IDB.get(id).then(function (b) { if (!b) throw new Error('missing'); return b.arrayBuffer(); });
      p.then(function (ab) { st.takes[id] = decodeWav(ab); }, function () { st.takes[id] = { missing: true }; })
        .then(function () { left--; if (!left) { var miss = ids.filter(function (k) { return st.takes[k].missing; }).length; st.setStatus(miss ? miss + ' recording(s) could not be loaded.' : '', miss ? 'error' : ''); st.draw(); } });
    });
  };

  // ---- hum and beatbox: record, then the dialog asks how to use it
  S.humStart = function (kind, withSong) {
    var st = this;
    A.unlock();
    return V.openMic().then(function () {
      var from = Math.floor(st.pos / 4) * 4;
      st._rec = { kind: kind, from: from, track: st.sel.track };
      st.mode = kind;
      V.startRecording();
      var doc = withSong ? st.doc : { bpm: st.doc.bpm, meter: 4, sections: [{ id: 'x', bars: 64, kind: 'verse' }], tracks: [], clips: [], patterns: {}, takes: {}, master: { vol: 0.8 } };
      A.play(doc, withSong ? from : 0, { countIn: 4, metronome: true, takeBuffer: st.takeBuffer.bind(st) });
      st._rec.beat0 = A.startTime();
      st.changed(false);
      return true;
    }, function (e) { st.setStatus('No microphone: ' + (e && e.message ? e.message : 'permission was not given') + '.', 'error'); return false; });
  };
  S.humStop = function () { this.stop(); return !!this._hum; };
  S.humResult = function (o) {  // o: {grid, snap, inst}
    var st = this, h = st._hum; if (!h) return JSON.stringify({ ok: false });
    var start = Math.max(0, h.beat0 - h.raw.t0);
    if (h.kind === 'beatbox') {
      var bb = V.beatboxToDrums(h.raw.samples, h.raw.sr, { bpm: st.doc.bpm, start: start, grid: o.grid || 0.25 });
      st._humOut = { kind: 'drums', len: Math.max(4, Math.min(32, bb.beats)), hits: bb.hits };
      return JSON.stringify({ ok: true, kind: 'beatbox', count: bb.hits.length, beats: st._humOut.len, kicks: bb.hits.filter(function (x) { return x.lane === 'kick'; }).length,
        snares: bb.hits.filter(function (x) { return x.lane === 'snare'; }).length, hats: bb.hits.filter(function (x) { return x.lane === 'hat'; }).length });
    }
    var inst = HB.inst(o.inst || 'piano');
    var hm = V.humToNotes(h.raw.samples, h.raw.sr, { bpm: st.doc.bpm, start: start, grid: o.grid || 0.25, snap: o.snap !== false, key: st.doc.key, scale: st.doc.scale, range: inst.range });
    var beats = Math.max(4, Math.ceil(hm.beats / 4) * 4);
    st._humOut = { kind: 'notes', len: Math.min(64, beats), notes: hm.notes.filter(function (n) { return n.t < 64; }) };
    return JSON.stringify({ ok: true, kind: 'hum', count: hm.notes.length, beats: st._humOut.len, keyName: hm.keyName, songKey: T.pcName(st.doc.key) + ' ' + st.doc.scale,
      names: hm.notes.slice(0, 12).map(function (n) { return T.name(n.p); }) });
  };
  S.humPreview = function (canvas, instId) {  // draw (and play) what was heard
    var p = this._humOut; if (!p) return;
    var w = canvas.clientWidth || 520, h = canvas.clientHeight || 120, c = dpr(canvas, w, h);
    c.clearRect(0, 0, w, h);
    c.fillStyle = css('--c-surface-2', '#f3f4f6'); c.fillRect(0, 0, w, h);
    var len = p.len || 4;
    c.strokeStyle = css('--c-line', '#ddd'); c.lineWidth = 1;
    for (var b = 0; b <= len; b++) { var x = b / len * w; c.globalAlpha = b % 4 === 0 ? 0.9 : 0.35; c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); c.stroke(); }
    c.globalAlpha = 1; c.fillStyle = css('--c-brand-fill', '#ff3e7f');
    if (p.kind === 'drums') {
      var lanes = ['hat', 'snare', 'kick'];
      p.hits.forEach(function (x) { var row = lanes.indexOf(x.lane); c.fillRect(x.t / len * w + 1, 8 + row * (h - 16) / 3, Math.max(4, w / len / 4 - 2), (h - 16) / 3 - 6); });
    } else {
      var ps = p.notes.map(function (n) { return n.p; }), lo = Math.min.apply(null, ps.concat([60])) - 2, hi = Math.max.apply(null, ps.concat([61])) + 2, rows = hi - lo;
      p.notes.forEach(function (n) { c.fillRect(n.t / len * w + 1, (hi - n.p) / rows * h, Math.max(3, n.d / len * w - 2), Math.max(4, h / rows - 1)); });
    }
    if (instId !== undefined) this.humListen(instId);
  };
  S.humListen = function (instId) {
    var p = this._humOut; if (!p) return;
    var ctx = A.ctx(), spb = 60 / this.doc.bpm, t0 = ctx.currentTime + 0.05, out = A._internals;
    var g = ctx.createGain(); g.gain.value = 0.8; g.connect(ctx.destination);
    if (p.kind === 'drums') p.hits.forEach(function (x) { out.playDrum(ctx, g, instId || 'acoustic', x.lane, t0 + x.t * spb, x.v); });
    else p.notes.forEach(function (n) { out.playNote(ctx, g, HB.inst(instId), n.p, t0 + n.t * spb, n.d * spb, n.v); });
  };
  S.humUse = function (o) {  // o: {inst, mode: 'new' | 'replace'}
    var st = this, p = st._humOut, h = st._hum; if (!p || !h) return false;
    st.mutate(function () {
      var tr = o.mode === 'replace' ? st.selTrack() : null;
      if (!tr || tr.kind !== (p.kind === 'drums' ? 'drums' : 'notes')) {
        tr = st.addTrack(p.kind === 'drums' ? 'drums' : 'notes', o.inst, true, p.kind === 'drums' ? 'Beatbox drums' : 'Hummed ' + HB.inst(o.inst).name.toLowerCase());
        tr.role = p.kind === 'drums' ? 'drums' : 'melody';
      } else tr.inst = o.inst || tr.inst;
      var pid = HB.uid('p'); st.doc.patterns[pid] = { kind: p.kind, len: p.len, notes: p.notes, hits: p.hits, name: p.kind === 'drums' ? 'Beatbox' : 'Hummed melody' };
      if (p.kind === 'drums') delete st.doc.patterns[pid].notes; else delete st.doc.patterns[pid].hits;
      if (o.mode === 'replace') st.doc.clips = st.doc.clips.filter(function (c) { return !(c.track === tr.id && c.start < h.from + p.len && c.start + c.len > h.from); });
      var c = { id: HB.uid('c'), track: tr.id, start: h.from, len: Math.min(p.len, st.len() - h.from), pat: pid };
      st.doc.clips.push(c); st.sel.track = tr.id; st.sel.clip = c.id;
    });
    st._hum = null; st._humOut = null;
    return true;
  };

  // ---- tracks
  var ROLE_FOR = { drums: 'drums', voice: 'voice' };
  S.addTrack = function (kind, inst, quiet, name) {
    var st = this, d = st.doc, used = {}; d.tracks.forEach(function (t) { used[t.color] = 1; });
    var color = 0; while (used[color] && color < 7) color++;
    if (used[color]) color = d.tracks.length % 8;
    var t = { id: HB.uid('t'), kind: kind, role: ROLE_FOR[kind] || 'melody', color: color, vol: 0.75, pan: 0, mute: false, solo: false, oct: 0 };
    if (kind === 'drums') { t.inst = HB.KITS[inst] ? inst : 'acoustic'; t.name = name || HB.kit(t.inst).name + ' drums'; }
    else if (kind === 'voice') { t.inst = 'voice'; t.name = name || 'Vocals ' + (d.tracks.filter(function (x) { return x.kind === 'voice'; }).length + 1); V.applyPreset(t, inst || 'natural'); t.vol = 0.9; }
    else { t.inst = HB.INSTRUMENTS.some(function (i) { return i.id === inst; }) ? inst : 'piano'; t.name = name || HB.inst(t.inst).name; }
    t.fx = t.fx || HB.blankFx(t.role);
    var add = function () { d.tracks.push(t); st.sel.track = t.id; st.sel.clip = null; };
    if (quiet) add(); else st.mutate(add);
    return t;
  };
  S.removeTrack = function (id) {
    var st = this; id = id || st.sel.track;
    st.mutate(function () {
      st.doc.tracks = st.doc.tracks.filter(function (t) { return t.id !== id; });
      st.doc.clips = st.doc.clips.filter(function (c) { return c.track !== id; });
      st.gcPatterns();
      st.sel.track = (st.doc.tracks[0] || {}).id || null; st.sel.clip = null;
    });
  };
  S.gcPatterns = function () {
    var used = {}, d = this.doc; d.clips.forEach(function (c) { if (c.pat) used[c.pat] = 1; });
    Object.keys(d.patterns).forEach(function (k) { if (!used[k]) delete d.patterns[k]; });
  };
  S.setInstrument = function (instId) {
    var st = this, tr = st.selTrack(); if (!tr || tr.kind === 'voice') return;
    st.mutate(function () {
      if (tr.kind === 'drums') { tr.inst = HB.KITS[instId] ? instId : tr.inst; if (/drums$|kit$/i.test(tr.name) || tr.name === 'Beatbox drums') tr.name = HB.kit(tr.inst).name + ' drums'; return; }
      var oldName = HB.inst(tr.inst).name;
      tr.inst = instId;
      // keep the part in the new instrument's range (a hummed melody turned into a bass drops an octave or two)
      var ps = []; st.doc.clips.forEach(function (c) { if (c.track === tr.id && st.doc.patterns[c.pat]) (st.doc.patterns[c.pat].notes || []).forEach(function (n) { ps.push(n.p); }); });
      if (ps.length) { ps.sort(function (a, b) { return a - b; }); var mid = ps[Math.floor(ps.length / 2)], r = HB.inst(instId).range, want = (r[0] + r[1]) / 2; tr.oct = clamp(Math.round((want - mid) / 12), -3, 3); }
      if (tr.name === oldName || /^Hummed /.test(tr.name)) tr.name = (/^Hummed /.test(tr.name) ? 'Hummed ' + HB.inst(instId).name.toLowerCase() : HB.inst(instId).name);
    });
  };

  // ---- clips
  S.selectClip = function (id) {
    var c = this.clipById(id); this.sel.clip = c ? c.id : null; if (c) this.sel.track = c.track; this.sel.note = null; this.changed(false);
  };
  S.newClip = function (trackId, beat) {
    var st = this, tr = st.track(trackId || st.sel.track); if (!tr || tr.kind === 'voice') return null;
    var start = Math.floor(clamp(beat !== undefined ? beat : st.pos, 0, st.len() - 1) / 4) * 4, len = Math.min(16, st.len() - start);
    var c;
    st.mutate(function () {
      var pid = HB.uid('p');
      st.doc.patterns[pid] = tr.kind === 'drums' ? { kind: 'drums', len: Math.min(8, len), hits: [], name: 'New beat' } : { kind: 'notes', len: Math.min(16, len), notes: [], name: 'New part' };
      c = { id: HB.uid('c'), track: tr.id, start: start, len: len, pat: pid };
      st.doc.clips.push(c); st.sel.clip = c.id; st.sel.track = tr.id;
    });
    return c;
  };
  S.deleteClip = function () {
    var st = this, c = st.selClip(); if (!c) return;
    st.mutate(function () { st.doc.clips = st.doc.clips.filter(function (x) { return x !== c; }); st.gcPatterns(); st.sel.clip = null; });
  };
  S.copyClip = function (cut) {
    var st = this, c = st.selClip(); if (!c) return;
    st.clip = { c: HB.clone(c), p: c.pat ? HB.clone(st.doc.patterns[c.pat]) : null };
    if (cut) st.deleteClip(); else st.changed(false);
  };
  S.pasteClip = function () {
    var st = this, cb = st.clip; if (!cb) return;
    st.mutate(function () {
      var tr = st.selTrack(), kind = cb.c.take ? 'voice' : cb.p.kind === 'drums' ? 'drums' : 'notes';
      if (!tr || tr.kind !== kind) tr = st.track(cb.c.track) || st.doc.tracks.filter(function (t) { return t.kind === kind; })[0];
      if (!tr) return;
      var c = HB.clone(cb.c); c.id = HB.uid('c'); c.track = tr.id; c.start = Math.floor(st.position() / 4) * 4;
      if (c.pat && !st.doc.patterns[c.pat]) { var pid = HB.uid('p'); st.doc.patterns[pid] = HB.clone(cb.p); c.pat = pid; }
      c.len = Math.min(c.len, st.len() - c.start);
      if (c.len > 0) { st.doc.clips.push(c); st.sel.clip = c.id; st.sel.track = tr.id; }
    });
  };
  S.duplicateClip = function () {
    var st = this, c = st.selClip(); if (!c) return;
    st.mutate(function () {
      var n = HB.clone(c); n.id = HB.uid('c'); n.start = c.start + c.len; n.len = Math.min(c.len, st.len() - n.start);
      if (n.len > 0) { st.doc.clips.push(n); st.sel.clip = n.id; }
    });
  };
  S.uniqueClip = function () {
    var st = this, c = st.selClip(); if (!c || !c.pat) return;
    st.mutate(function () { var pid = HB.uid('p'); st.doc.patterns[pid] = HB.clone(st.doc.patterns[c.pat]); st.doc.patterns[pid].name = (st.doc.patterns[pid].name || 'Part') + ' (own copy)'; c.pat = pid; });
  };
  S.patternOf = function (c) { return c && c.pat ? this.doc.patterns[c.pat] : null; };
  S.transpose = function (semi) {
    var st = this, p = st.patternOf(st.selClip()); if (!p || p.kind !== 'notes') return;
    st.mutate(function () { p.notes.forEach(function (n) { n.p = clamp(n.p + semi, 12, 108); }); }, 'tr');
  };
  S.quantize = function (grid) {
    var st = this, p = st.patternOf(st.selClip()); if (!p) return;
    grid = grid || 0.25;
    st.mutate(function () { (p.notes || p.hits).forEach(function (n) { n.t = Math.round(n.t / grid) * grid; if (n.d) n.d = Math.max(grid, Math.round(n.d / grid) * grid); }); });
  };
  S.snapToKey = function () {
    var st = this, p = st.patternOf(st.selClip()); if (!p || p.kind !== 'notes') return;
    st.mutate(function () { p.notes.forEach(function (n) { n.p = T.snap(n.p, st.doc.key, st.doc.scale); }); });
  };
  S.clearClip = function () {
    var st = this, p = st.patternOf(st.selClip()); if (!p) return;
    st.mutate(function () { if (p.notes) p.notes = []; if (p.hits) p.hits = []; });
  };
  S.patternLen = function (beats) {
    var st = this, p = st.patternOf(st.selClip()); if (!p) return;
    st.mutate(function () { p.len = clamp(beats, 1, 64); });
  };

  // ---- song-wide
  S.setTempo = function (bpm) { var st = this; st.mutate(function () { st.doc.bpm = clamp(Math.round(bpm), 40, 220); }, 'bpm'); if (st.mode === 'play') { var p = A.position(); A.stop(); st.play(p); } };
  S.tap = function () {
    var now = performance.now(), t = this._taps = (this._taps || []).filter(function (x) { return now - x < 2500; }); t.push(now);
    if (t.length >= 3) { var avg = (t[t.length - 1] - t[0]) / (t.length - 1); this.setTempo(60000 / avg); }
    return t.length;
  };
  S.setKey = function (key) {
    var st = this, d = st.doc, delta = ((key - d.key) % 12 + 12) % 12; if (delta > 6) delta -= 12;
    if (!delta) return;
    st.mutate(function () {
      Object.keys(d.patterns).forEach(function (k) { var p = d.patterns[k]; if (p.notes) p.notes.forEach(function (n) { n.p += delta; }); });
      d.tracks.forEach(function (t) { if (t.kind === 'voice' && Object.keys(d.takes).length) t.voice.pitch = clamp((t.voice.pitch || 0) + delta, -12, 12); });
      d.key = key;
    });
  };
  S.setScale = function (scale) {
    var st = this, d = st.doc; if (!T.SCALES[scale]) return;
    st.mutate(function () {
      Object.keys(d.patterns).forEach(function (k) { var p = d.patterns[k]; if (p.notes) p.notes.forEach(function (n) { if (!T.inScale(n.p, d.key, scale)) n.p = T.snap(n.p, d.key, scale); }); });
      d.scale = scale;
    });
  };
  S.restyle = function (genreId, keepTempo) {
    var st = this, d = st.doc;
    st.mutate(function () {
      var fresh = HB.Doc.fromRecipe(genreId, { key: d.key, title: d.title });
      var voices = d.tracks.filter(function (t) { return t.kind === 'voice'; }), vids = {};
      voices.forEach(function (t) { vids[t.id] = 1; });
      fresh.tracks = fresh.tracks.filter(function (t) { return t.kind !== 'voice' || !voices.length; }).concat(voices);
      fresh.clips = fresh.clips.concat(d.clips.filter(function (c) { return vids[c.track]; }));
      fresh.takes = d.takes; fresh.lyrics = {};
      if (keepTempo || Object.keys(d.takes).length) fresh.bpm = d.bpm;
      // keep the words: same kind of section, in order
      var old = {}; d.sections.forEach(function (s) { (old[s.kind] = old[s.kind] || []).push(d.lyrics[s.id] || ''); });
      fresh.sections.forEach(function (s) { var q = old[s.kind]; if (q && q.length) { var w = q.shift(); if (w) fresh.lyrics[s.id] = w; } });
      if (!Object.keys(fresh.lyrics).length) fresh.lyrics = HB.Doc.fromRecipe(genreId, { seed: 1 }).lyrics;
      Object.keys(fresh).forEach(function (k) { d[k] = fresh[k]; });
      st.sel.track = (d.tracks[0] || {}).id; st.sel.clip = null; st.sel.section = null;
    });
    st.pos = 0;
  };
  S.setProgression = function (kind, degrees, ext) { var st = this; st.mutate(function () { HB.Doc.setProgression(st.doc, kind, degrees, ext); }); };
  S.autoMix = function () {
    var st = this, VOL = { drums: 0.85, bass: 0.78, chords: 0.6, pad: 0.45, hook: 0.55, lead: 0.62, melody: 0.65, voice: 0.95 }, PAN = { hook: -0.22, lead: 0.18, pad: 0.12, chords: -0.08 };
    st.mutate(function () {
      st.doc.tracks.forEach(function (t) { var r = t.kind === 'voice' ? 'voice' : t.kind === 'drums' ? 'drums' : (t.role || 'melody'); t.vol = VOL[r] || 0.65; t.pan = PAN[r] || 0; t.mute = false; t.solo = false; });
      st.doc.master.vol = 0.85;
    });
  };

  // ---- sections
  S.sectionStart = function (id) { return HB.Doc.sectionStart(this.doc, id); };
  S.selectSection = function (id) { this.sel.section = id; this.seek(this.sectionStart(id)); };
  S.setSection = function (id, props) {
    var st = this, d = st.doc, s = d.sections.filter(function (x) { return x.id === id; })[0]; if (!s) return;
    st.mutate(function () {
      if (props.bars !== undefined && props.bars !== s.bars) {
        var start = st.sectionStart(id), oldEnd = start + s.bars * 4, nb = clamp(Math.round(props.bars), 1, 64), delta = (nb - s.bars) * 4;
        d.clips.forEach(function (c) {
          if (c.start >= oldEnd) c.start += delta;
          else if (c.start >= start && c.start + c.len >= oldEnd - 1e-9) c.len = Math.max(1, Math.min(c.len + delta, start + nb * 4 - c.start));
        });
        d.clips = d.clips.filter(function (c) { return c.start < start + nb * 4 || c.start >= oldEnd + delta; });
        s.bars = nb;
      }
      if (props.trans !== undefined) s.trans = props.trans;
      if (props.name !== undefined) s.name = String(props.name).slice(0, 30) || s.name;
      if (props.kind !== undefined && HB.SECTION_NAMES[props.kind]) s.kind = props.kind;
    }, props.bars !== undefined ? null : 'sec' + id);
  };
  S.addSection = function (kind, afterId) {
    var st = this, d = st.doc;
    st.mutate(function () {
      var idx = afterId ? d.sections.map(function (s) { return s.id; }).indexOf(afterId) : d.sections.length - 1;
      var at = 0; for (var i = 0; i <= idx; i++) at += d.sections[i].bars * 4;
      var model = null; d.sections.forEach(function (s) { if (s.kind === kind) model = s; });
      var bars = model ? model.bars : (kind === 'intro' || kind === 'outro' || kind === 'pre' ? 4 : 8);
      var n = d.sections.filter(function (s) { return s.kind === kind; }).length;
      var s = { id: HB.uid('s'), kind: kind, name: HB.SECTION_NAMES[kind] + (n ? ' ' + (n + 1) : ''), bars: bars, trans: 'none' };
      d.clips.forEach(function (c) { if (c.start >= at - 1e-9) c.start += bars * 4; });
      // fill the new section like the last section of the same kind (clips linked to the same parts)
      if (model) {
        var ms = HB.Doc.sectionStart(d, model.id);
        if (ms >= at) ms += bars * 4;
        d.clips.filter(function (c) { return c.start >= ms && c.start < ms + model.bars * 4 && c.pat; }).forEach(function (c) {
          var copy = HB.clone(c); copy.id = HB.uid('c'); copy.start = at + (c.start - ms); d.clips.push(copy);
        });
      }
      d.sections.splice(idx + 1, 0, s);
      st.sel.section = s.id;
    });
  };
  S.removeSection = function (id) {
    var st = this, d = st.doc; if (d.sections.length <= 1) return;
    st.mutate(function () {
      var start = st.sectionStart(id), s = d.sections.filter(function (x) { return x.id === id; })[0], L = s.bars * 4;
      d.clips = d.clips.filter(function (c) { return !(c.start >= start && c.start < start + L); });
      d.clips.forEach(function (c) { if (c.start >= start + L) c.start -= L; else if (c.start + c.len > start) c.len = Math.max(1, start - c.start); });
      d.sections = d.sections.filter(function (x) { return x.id !== id; });
      delete d.lyrics[id];
      st.gcPatterns(); st.sel.section = null;
    });
  };
  S.moveSection = function (id, dir) {
    var st = this, d = st.doc, i = d.sections.map(function (s) { return s.id; }).indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.sections.length) return;
    st.mutate(function () {
      var a = d.sections[Math.min(i, j)], b = d.sections[Math.max(i, j)], sa = st.sectionStart(a.id), sb = sa + a.bars * 4, eb = sb + b.bars * 4;
      d.clips.forEach(function (c) { if (c.start >= sa && c.start < sb) c.start += b.bars * 4; else if (c.start >= sb && c.start < eb) c.start -= a.bars * 4; });
      d.sections.splice(Math.min(i, j), 2, b, a);
    });
  };
  S.setLyrics = function (sid, text) { var st = this; st.mutate(function () { if (text) st.doc.lyrics[sid] = String(text).slice(0, 4000); else delete st.doc.lyrics[sid]; }, 'ly' + sid); };

  // ---- undo
  S.doUndo = function () { var st = this; if (!st.undo.length) return; st.redo.push(JSON.stringify(st.doc)); st.doc = JSON.parse(st.undo.pop()); st.afterHistory(); };
  S.doRedo = function () { var st = this; if (!st.redo.length) return; st.undo.push(JSON.stringify(st.doc)); st.doc = JSON.parse(st.redo.pop()); st.afterHistory(); };
  S.afterHistory = function () {
    var st = this; st._live = null;
    if (!st.track(st.sel.track)) st.sel.track = (st.doc.tracks[0] || {}).id || null;
    if (!st.clipById(st.sel.clip)) st.sel.clip = null;
    if (A.playing() && st.mode === 'play') { var p = A.position(); A.stop(); st.play(p); }
    st.changed(true);
  };

  // ---- export
  S.exportWav = function () {
    var st = this;
    st.setStatus('Mixing your song into a WAV file...');
    st.prepareVoices();
    return A.render(st.doc, { takeBuffer: st.takeBuffer.bind(st) }).then(function (buf) {
      download(A.wav(buf), safeName(st.doc.title) + '.wav');
      st.setStatus('Your WAV file is downloading (' + fmtTime(buf.duration) + ').', 'ok');
      return true;
    }, function (e) { st.setStatus('The export did not work: ' + e, 'error'); return false; });
  };
  // a guide melody for one section's words, on a "Melody guide" track (one clip per section; a new seed = another idea)
  S.melody = function (sid, seed, inst) {
    var st = this, d = st.doc, sec = d.sections.filter(function (s) { return s.id === sid; })[0];
    var tr = d.tracks.filter(function (t) { return t.role === 'guide'; })[0];
    var p = HB.melodyFromLyrics(d, sid, { seed: seed || 1 });
    if (!p || !p.notes.length) return { ok: false, error: sec ? 'Write some words for ' + sec.name + ' first (in the Lyrics pane).' : 'Pick a section.' };
    st.mutate(function () {
      if (!tr) { tr = st.addTrack('notes', inst || 'flute', true, 'Melody guide'); tr.role = 'guide'; tr.vol = 0.6; tr.fx.space = 0.3; }
      else if (inst) tr.inst = inst;
      var start = HB.Doc.sectionStart(d, sid), end = start + sec.bars * 4;
      d.clips = d.clips.filter(function (c) { return !(c.track === tr.id && c.start >= start && c.start < end); });
      var pid = HB.uid('p'); d.patterns[pid] = { kind: 'notes', len: p.len, notes: p.notes, name: p.name };
      var c = { id: HB.uid('c'), track: tr.id, start: start, len: Math.min(sec.bars * 4, p.len), pat: pid };
      d.clips.push(c); st.gcPatterns(); st.sel.track = tr.id; st.sel.clip = c.id; st.sel.section = sid;
    });
    return { ok: true, notes: p.notes.length, lines: p.lines, section: sec.name, first: p.notes.slice(0, 6).map(function (n) { return n.w + ' ' + T.name(n.p); }).join(', ') };
  };

  // stems: every track alone, the transition effects, and the full mix, as WAVs in one ZIP
  S.renderStems = function (opts) {
    var st = this, d = st.doc, o = opts || {}, jobs = [{ name: '00 Full mix', opts: {} }], i = 0;
    st.prepareVoices();
    d.tracks.forEach(function (t, k) { jobs.push({ name: (k + 1 < 10 ? '0' : '') + (k + 1) + ' ' + t.name, opts: { solo: t.id } }); });
    if (HB.audio._internals.transitionAt(d).length) jobs.push({ name: (jobs.length < 10 ? '0' : '') + jobs.length + ' Transitions and effects', opts: { fxOnly: true } });
    var out = [];
    function next() {
      if (i >= jobs.length) return Promise.resolve(out);
      var j = jobs[i++];
      st.setStatus('Rendering stem ' + i + ' of ' + jobs.length + ': ' + j.name.slice(3) + '...');
      return A.render(d, Object.assign({ takeBuffer: st.takeBuffer.bind(st), from: o.from, to: o.to }, j.opts)).then(function (buf) { out.push({ name: j.name, buffer: buf }); return next(); });
    }
    return next();
  };
  S.exportStems = function (opts) {
    var st = this;
    return st.renderStems(opts).then(function (stems) {
      var files = stems.map(function (s) { return { name: safeName(st.doc.title) + '/' + s.name.replace(/[\\/:*?"<>|]+/g, '') + '.wav', blob: A.wav(s.buffer) }; });
      return HB.zip(files).then(function (zip) {
        if (!(opts && opts.noDownload)) download(zip, safeName(st.doc.title) + '-stems.zip');
        st.setStatus('Stems ready: ' + stems.length + ' WAV files in one ZIP (' + Math.max(1, Math.round(zip.size / 1048576)) + ' MB). Drop them into any music app.', 'ok');
        return { files: files.map(function (f) { return f.name; }), size: zip.size, zip: zip, stems: stems };
      });
    }, function (e) { st.setStatus('The stems could not be made: ' + e, 'error'); throw e; });
  };

  S.exportMidi = function () { download(A.midi(this.doc), safeName(this.doc.title) + '.mid'); this.setStatus('MIDI file downloading: open it in any music app.', 'ok'); };

  // ---- the one command door for Python: st.cmd(name, jsonArgs) -> json
  S.cmd = function (name, arg) {
    var st = this, a = arg ? (typeof arg === 'string' ? JSON.parse(arg) : arg) : {}, tr;
    switch (name) {
      case 'play': st.toggle(); break;
      case 'stop': st.stop(); if (a.home) st.seek(0); break;
      case 'home': st.seek(0); break;
      case 'end': st.seek(Math.max(0, st.len() - 4)); break;
      case 'record': st.record(); break;
      case 'loop': st.mutate(function () { if (st.doc.loop) st.doc.loop = null; else { var sec = HB.Doc.sectionAt(st.doc, st.position()) || { start: 0, s: st.doc.sections[0] }; st.doc.loop = { a: sec.start, b: sec.start + sec.s.bars * 4 }; } }); break;
      case 'metronome': st.metronome = !st.metronome; st.changed(false); break;
      case 'countin': st.countIn = !st.countIn; st.changed(false); break;
      case 'prompter': st.showPrompter(!st.prompterOn); break;
      case 'follow': st.follow = !st.follow; st.changed(false); break;
      case 'zoom': st.zoom = clamp(st.zoom * (a.dir > 0 ? 1.3 : 1 / 1.3), 6, 80); st.changed(false); break;
      case 'latency': st.latencyMs = clamp(Number(a.ms) || 0, -200, 400); st.changed(false); break;
      case 'undo': st.doUndo(); break;
      case 'redo': st.doRedo(); break;
      case 'cut': st.copyClip(true); break;
      case 'copy': st.copyClip(false); break;
      case 'paste': st.pasteClip(); break;
      case 'duplicate': st.duplicateClip(); break;
      case 'delete': st.deleteClip(); break;
      case 'unique': st.uniqueClip(); break;
      case 'newclip': st.newClip(a.track, a.beat); break;
      case 'transpose': st.transpose(a.semi || 0); break;
      case 'quantize': st.quantize(a.grid); break;
      case 'snapkey': st.snapToKey(); break;
      case 'clear': st.clearClip(); break;
      case 'patlen': st.patternLen(a.beats); break;
      case 'clipgain': var cg = st.selClip(); if (cg) st.mutate(function () { cg.gain = clamp(a.value, 0, 2); }, 'cg'); break;
      case 'tempo': st.setTempo(a.bpm); break;
      case 'tempostep': st.setTempo(st.doc.bpm + (a.step || 0)); break;
      case 'tap': return JSON.stringify({ taps: st.tap() });
      case 'key': st.setKey(Number(a.key)); break;
      case 'scale': st.setScale(a.scale); break;
      case 'swing': st.mutate(function () { st.doc.swing = clamp(a.value, 0, 0.5); }, 'swing'); break;
      case 'title': st.mutate(function () { st.doc.title = String(a.title || '').slice(0, 80) || 'Untitled song'; }, 'title'); break;
      case 'restyle': st.restyle(a.genre, a.keepTempo); break;
      case 'progression': st.setProgression(a.kind, a.deg, a.ext || ''); break;
      case 'automix': st.autoMix(); break;
      case 'master': st.mutate(function () { st.doc.master.vol = clamp(a.value, 0, 1.2); }, 'master'); break;
      case 'addtrack': st.addTrack(a.kind, a.inst); break;
      case 'removetrack': st.removeTrack(a.id); break;
      case 'selecttrack': st.sel.track = a.id; st.sel.clip = null; st.changed(false); break;
      case 'movetrack':
        st.mutate(function () { var ts = st.doc.tracks, i = ts.map(function (t) { return t.id; }).indexOf(a.id), j = i + a.dir; if (i >= 0 && j >= 0 && j < ts.length) { var x = ts[i]; ts[i] = ts[j]; ts[j] = x; } });
        break;
      case 'track':  // {id, vol | pan | mute | solo | name | color}
        tr = st.track(a.id || st.sel.track); if (!tr) break;
        st.mutate(function () {
          ['vol', 'pan', 'color', 'oct'].forEach(function (k) { if (a[k] !== undefined) tr[k] = Number(a[k]); });
          if (a.mute !== undefined) tr.mute = !!a.mute;
          if (a.solo !== undefined) tr.solo = !!a.solo;
          if (a.name !== undefined) tr.name = String(a.name).slice(0, 40) || tr.name;
        }, (a.vol !== undefined || a.pan !== undefined) ? 'mix' + tr.id : null);
        break;
      case 'instrument': st.setInstrument(a.inst); break;
      case 'octave': tr = st.selTrack(); if (tr && tr.kind === 'notes') st.mutate(function () { tr.oct = clamp((tr.oct || 0) + a.dir, -3, 3); }); break;
      case 'fx': tr = st.track(a.id || st.sel.track); if (tr) st.mutate(function () { tr.fx[a.key] = Number(a.value); }, 'fx' + tr.id + a.key); break;
      case 'fxpreset': tr = st.selTrack(); if (tr) st.mutate(function () { tr.fx = Object.assign(HB.blankFx(tr.role), FX_PRESETS[a.preset] || {}); }); break;
      case 'voicepreset': tr = st.selTrack(); if (tr && tr.kind === 'voice') { st.mutate(function () { V.applyPreset(tr, a.preset); }); st.voiceChanged(); } break;
      case 'voice': tr = st.selTrack(); if (tr && tr.kind === 'voice') { st.mutate(function () { tr.voice[a.key] = a.key === 'harmony' ? String(a.value) : Number(a.value); tr.voice.preset = 'custom'; }, 'v' + tr.id + a.key); st.voiceChanged(); } break;
      case 'section': st.selectSection(a.id); break;
      case 'setsection': st.setSection(a.id, a); break;
      case 'addsection': st.addSection(a.kind, a.after); break;
      case 'removesection': st.removeSection(a.id); break;
      case 'movesection': st.moveSection(a.id, a.dir); break;
      case 'lyrics': st.setLyrics(a.id, a.text); break;
      case 'starter': tr = st.selTrack(); if (tr && tr.kind !== 'voice') st.mutate(function () { HB.Doc.starterPart(st.doc, tr, a.style); }); break;
      case 'wav': st.exportWav(); break;
      case 'stems': st.exportStems(); break;
      case 'melody': return JSON.stringify(st.melody(a.id, a.seed, a.inst));
      case 'midi': st.exportMidi(); break;
      case 'cleantakes': return JSON.stringify({ removed: st.cleanTakes() });
      case 'previewnote': A.previewNote(a.inst, a.midi || 60, 0.6); break;
      case 'previewchord':
        var ch = T.chord(st.doc.key, st.doc.scale, a.deg, a.ext || ''); A.previewChord('piano', T.voice(ch, 62)); break;
      case 'previewinst': if (HB.KITS[a.inst]) { A.previewDrum(a.inst, 'kick'); setTimeout(function () { A.previewDrum(a.inst, 'snare'); }, 260); setTimeout(function () { A.previewDrum(a.inst, 'hat'); }, 520); }
        else { var r = HB.inst(a.inst).range, base = T.snap(Math.round((r[0] + r[1]) / 2) - 5, st.doc.key, st.doc.scale); [0, 2, 4].forEach(function (k, i) { setTimeout(function () { A.previewNote(a.inst, T.degreeNote(st.doc.key, st.doc.scale, 1 + k, Math.floor(base / 12) - 1), 0.5); }, i * 220); }); }
        break;
      default: return JSON.stringify({ ok: false, error: 'unknown command ' + name });
    }
    return '';
  };
  var FX_PRESETS = HB.FX_PRESETS = {
    clean: {}, radio: { tone: 0.5, low: -0.8, high: -0.3, drive: 0.2, space: 0.05 }, underwater: { tone: 0.25, space: 0.5, wide: 0.3 },
    arena: { space: 0.85, echo: 0.25, wide: 0.35, punch: 0.5 }, tape: { lofi: 0.45, tone: 0.6, space: 0.2, low: 0.2 }, crunch: { drive: 0.6, punch: 0.6, high: 0.2 },
    dream: { space: 0.7, echo: 0.35, wide: 0.6, high: 0.2 }, tight: { space: 0.02, punch: 0.8 }
  };
  S.voiceChanged = function () {
    var st = this;
    clearTimeout(st._vT);
    st._vT = setTimeout(function () {
      if (!st.doc.clips.some(function (c) { return c.take; })) return;
      st.setStatus('Re-tuning the voice...');
      setTimeout(function () {
        var ms = st.prepareVoices();
        st.setStatus(ms ? 'Voice updated.' : '', 'ok');
        if (st.mode === 'play') { var p = A.position(); A.stop(); st.play(p); }
        st.draw();
      }, 30);
    }, 350);
  };
  S.cleanTakes = function () {
    var st = this, used = {}, n = 0; st.doc.clips.forEach(function (c) { if (c.take) used[c.take] = 1; });
    st.mutate(function () { Object.keys(st.doc.takes).forEach(function (k) { if (!used[k]) { delete st.doc.takes[k]; n++; } }); });
    return n;
  };

  // ---- keyboard
  S.onKey = function (e) {
    var st = this, t = e.target, tag = (t && t.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || (t && t.isContentEditable)) return;
    if (document.querySelector('.anvil-modal.in, .modal.in')) return;
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === ' ') { e.preventDefault(); st.toggle(); }
    else if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) st.doRedo(); else st.doUndo(); }
    else if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); st.doRedo(); }
    else if (mod && k === 'c') st.copyClip(false);
    else if (mod && k === 'x') st.copyClip(true);
    else if (mod && k === 'v') st.pasteClip();
    else if (mod && k === 'd') { e.preventDefault(); st.duplicateClip(); }
    else if (k === 'Delete' || k === 'Backspace') { if (st.sel.note !== null && st.editor) { st.editor.deleteNote(); } else if (st.sel.clip) { e.preventDefault(); st.deleteClip(); } }
    else if (k === 'Home') st.seek(0);
    else if (k === 'r' && !mod) st.record();
    else if (k === '+' || k === '=') st.cmd('zoom', { dir: 1 });
    else if (k === '-') st.cmd('zoom', { dir: -1 });
  };

  // ---- animation: playhead, time, meters
  S.loop = function () {
    var st = this;
    var frame = function () {
      st._raf = root.requestAnimationFrame(frame);
      var playing = st.mode !== 'idle' && A.playing();
      st.views.forEach(function (v) { if (v.tick) v.tick(playing); });
      if (playing) {
        var b = A.position();
        var sec = HB.Doc.sectionAt(st.doc, b);
        if (sec && sec.s.id !== st._lastSec) { st._lastSec = sec.s.id; st.notify(); }
      }
    };
    st._raf = root.requestAnimationFrame(frame);
    st._bgT = setInterval(function () { if (document.hidden && st.mode !== 'idle') st.views.forEach(function (v) { if (v.tick) v.tick(true); }); }, 500);
  };
  S.draw = function () { this.views.forEach(function (v) { if (v.draw) v.draw(); }); };
  S.destroy = function () {
    var st = this;
    st.flush();
    if (st.mode !== 'idle') { A.stop(); if (V.recording()) V.stopRecording(); }
    st.mode = 'idle';
    root.cancelAnimationFrame(st._raf); clearInterval(st._bgT);
    document.removeEventListener('keydown', st._key);
    st.views.forEach(function (v) { if (v.destroy) v.destroy(); });
    st.views = [];
    V.closeMic();
  };

  // ================================================================== views
  // ---- transport readout: time + bars + level meter (nodes owned by Python templates)
  S.mountReadout = function (timeEl, meterCanvas) {
    var st = this, last = '';
    var v = {
      tick: function () {
        var b = st.position(), secs = b * 60 / st.doc.bpm;
        var count = A.counting();
        var txt = count && st.mode !== 'idle' ? 'Count-in ' + count : (Math.floor(b / 4) + 1) + '.' + (Math.floor(b % 4) + 1) + '  ' + fmtTime(secs);
        if (txt !== last) { timeEl.textContent = txt; last = txt; }
        if (meterCanvas) {
          var w = meterCanvas.clientWidth || 90, h = meterCanvas.clientHeight || 10, c = meterCanvas._c || (meterCanvas._c = dpr(meterCanvas, w, h));
          var lv = st.mode === 'rec' || st.mode === 'hum' || st.mode === 'beatbox' ? V.micLevel() : (V.micReady() && st.mode === 'idle' ? V.micLevel() : A.level());
          c.clearRect(0, 0, w, h); c.fillStyle = css('--c-surface-2', '#eee'); c.fillRect(0, 0, w, h);
          c.fillStyle = lv > 0.95 ? css('--c-bad', '#c33') : css('--c-ink', '#111'); c.fillRect(0, 0, Math.min(1, lv) * w, h);
        }
      },
      draw: function () { last = ''; v.tick(); }
    };
    st.views.push(v); v.draw();
  };

  // ---- arranger
  S.mountArranger = function (host) {
    var st = this;
    host.innerHTML = '';
    var scroll = el('div', 'ar-scroll', host), inner = el('div', 'ar-inner', scroll);
    var secRow = el('div', 'ar-secs', inner), ruler = el('div', 'ar-ruler', inner), lanes = el('div', 'ar-lanes', inner);
    var loopBox = el('div', 'ar-loop', inner), ph = el('div', 'ar-ph', inner);
    scroll.setAttribute('tabindex', '0'); scroll.setAttribute('aria-label', 'Song timeline: sections, then one lane per track');
    var drag = null;
    function px(b) { return b * st.zoom; }
    function beatAt(ev) { var r = inner.getBoundingClientRect(); return Math.max(0, (ev.clientX - r.left) / st.zoom); }
    function drawClip(node, c, tr) {
      var cv = node.querySelector('canvas'), w = Math.max(4, px(c.len) - 4), h = LANE_H - 26;
      var ctx = dpr(cv, w, h), col = tkColor(tr.color), p = c.pat ? st.doc.patterns[c.pat] : null;
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = css('--c-clip-ink', 'rgba(17,17,17,.8)');
      if (p && p.kind === 'notes' && p.notes.length) {
        var ps = p.notes.map(function (n) { return n.p; }), lo = Math.min.apply(null, ps) - 1, hi = Math.max.apply(null, ps) + 1, rows = Math.max(6, hi - lo);
        for (var base = 0; base < c.len; base += p.len) p.notes.forEach(function (n) {
          var b = base + n.t; if (b >= c.len) return;
          ctx.fillRect(b * st.zoom, (hi - n.p) / rows * (h - 3), Math.max(1.5, Math.min(n.d, c.len - b) * st.zoom - 1), Math.max(2, (h - 3) / rows));
        });
      } else if (p && p.kind === 'drums') {
        var L = HB.LANES, rh = (h - 2) / L.length;
        for (var b0 = 0; b0 < c.len; b0 += p.len) p.hits.forEach(function (x) { var b = b0 + x.t; if (b < c.len) ctx.fillRect(b * st.zoom, L.indexOf(x.lane) * rh, Math.max(1.5, st.zoom / 5), Math.max(1.5, rh - 0.5)); });
      } else if (c.take) {
        var tk = st.takes[c.take];
        if (tk && tk.samples) {
          var sr = tk.sr, spb = 60 / st.doc.bpm, s0 = Math.floor((c.offset || 0) * sr), per = Math.max(1, Math.floor(spb * sr / st.zoom)), mid = h / 2;
          for (var x = 0; x < w; x++) {
            var a = s0 + x * per, pk = 0; for (var i = 0; i < per; i += 4) pk = Math.max(pk, Math.abs(tk.samples[a + i] || 0));
            var hh = Math.min(mid, pk * mid * 1.6 * (c.gain === undefined ? 1 : c.gain)); ctx.fillRect(x, mid - hh, 1, Math.max(1, hh * 2));
          }
        } else { ctx.font = '12px ' + css('--font-body', 'sans-serif'); ctx.fillText(tk && tk.missing ? 'Recording missing' : 'Loading...', 6, h / 2 + 4); }
      }
      node.style.setProperty('--clip', col);
    }
    var v = {
      draw: function () {
        var d = st.doc, len = st.len(), W = px(len) + 160;
        inner.style.width = W + 'px';
        inner.style.height = (HEAD_H + Math.max(1, d.tracks.length) * LANE_H) + 'px';
        // sections
        secRow.innerHTML = ''; var b = 0;
        d.sections.forEach(function (s) {
          var n = el('button', 'ar-sec ar-sec-' + s.kind + (st.sel.section === s.id ? ' on' : ''), secRow);
          n.type = 'button'; n.style.left = px(b) + 'px'; n.style.width = px(s.bars * 4) + 'px';
          n.textContent = s.name; n.title = s.name + ': ' + s.bars + ' bars' + (s.trans && s.trans !== 'none' ? ', then ' + s.trans : '');
          n.dataset.sec = s.id;
          if (s.trans && s.trans !== 'none') { var tg = el('span', 'ar-trans', n); tg.textContent = s.trans; }
          b += s.bars * 4;
        });
        // ruler
        ruler.innerHTML = '';
        var step = st.zoom < 10 ? 8 : st.zoom < 18 ? 4 : 1;
        for (var bar = 0; bar * 4 < len; bar += step) { var m = el('span', 'ar-bar', ruler); m.style.left = px(bar * 4) + 'px'; m.textContent = bar + 1; }
        // lanes + clips
        lanes.innerHTML = '';
        lanes.style.setProperty('--beat', st.zoom + 'px');
        d.tracks.forEach(function (tr, i) {
          var lane = el('div', 'ar-lane' + (tr.id === st.sel.track ? ' on' : '') + (tr.mute ? ' muted' : ''), lanes);
          lane.style.top = (i * LANE_H) + 'px'; lane.dataset.track = tr.id;
          lane.setAttribute('role', 'group'); lane.setAttribute('aria-label', tr.name + ' track');
          d.clips.forEach(function (c) {
            if (c.track !== tr.id) return;
            var node = el('div', 'ar-clip' + (c.id === st.sel.clip ? ' on' : '') + (c.take ? ' voice' : ''), lane);
            node.style.left = (px(c.start) + 1) + 'px'; node.style.width = Math.max(6, px(c.len) - 2) + 'px';
            node.dataset.clip = c.id;
            node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
            var p = c.pat ? d.patterns[c.pat] : null, nm = el('span', 'ar-clip-name', node);
            nm.textContent = c.take ? 'Recording ' + (d.takes[c.take] ? d.takes[c.take].sec + ' s' : '') : (p && p.name) || 'Part';
            node.setAttribute('aria-label', nm.textContent + ', bar ' + (Math.floor(c.start / 4) + 1));
            var linked = c.pat ? d.clips.filter(function (x) { return x.pat === c.pat; }).length : 0;
            if (linked > 1) { var lk = el('span', 'ar-clip-link', node); lk.textContent = '×' + linked; lk.title = 'Linked: editing changes ' + linked + ' clips'; }
            el('canvas', 'ar-clip-cv', node);
            el('span', 'ar-clip-r', node); if (c.take) el('span', 'ar-clip-l', node);
            drawClip(node, c, tr);
          });
        });
        if (!d.tracks.length) { var e = el('div', 'ar-empty', lanes); e.textContent = 'No tracks yet. Insert > Instrument track, or Record a voice.'; }
        var lp = d.loop;
        loopBox.style.display = lp ? 'block' : 'none';
        if (lp) { loopBox.style.left = px(lp.a) + 'px'; loopBox.style.width = px(lp.b - lp.a) + 'px'; }
        v.tick(false, true);
      },
      tick: function (playing, force) {
        var b = st.position(), x = px(b);
        ph.style.transform = 'translateX(' + x + 'px)';
        ph.classList.toggle('rec', st.mode === 'rec');
        if (playing && st.follow && !drag) {
          var left = scroll.scrollLeft, w = scroll.clientWidth;
          if (x > left + w * 0.8 || x < left) scroll.scrollLeft = Math.max(0, x - w * 0.2);
        }
      }
    };
    function down(ev) {
      if (ev.button > 0) return;
      var t = ev.target, clipEl = t.closest('.ar-clip'), secEl = t.closest('.ar-sec');
      if (secEl) { st.selectSection(secEl.dataset.sec); return; }
      if (t.closest('.ar-ruler')) { st.sel.section = null; st.seek(Math.round(beatAt(ev) * 4) / 4); return; }
      var laneEl = t.closest('.ar-lane');
      if (clipEl) {
        var c = st.clipById(clipEl.dataset.clip); if (!c) return;
        st.sel.clip = c.id; st.sel.track = c.track; st.sel.note = null;
        var mode = t.classList.contains('ar-clip-r') ? 'resize' : t.classList.contains('ar-clip-l') ? 'trim' : 'move';
        drag = { c: c, mode: mode, x0: ev.clientX, start: c.start, len: c.len, offset: c.offset || 0, moved: false };
        clipEl.setPointerCapture && clipEl.setPointerCapture(ev.pointerId);
        st.changed(false);
        ev.preventDefault();
        return;
      }
      if (laneEl) {
        st.sel.track = laneEl.dataset.track; st.sel.clip = null;
        st.pos = Math.floor(beatAt(ev) / 4) * 4;
        st.changed(false);
      }
    }
    function move(ev) {
      if (!drag || !st.editable) return;
      var db = (ev.clientX - drag.x0) / st.zoom, snap = ev.altKey ? 0.25 : (st.zoom > 30 ? 1 : 4);
      if (!drag.moved && Math.abs(ev.clientX - drag.x0) < 4) return;
      if (!drag.moved) { st.snapshot(); drag.moved = true; }
      var c = drag.c, len = st.len();
      if (drag.mode === 'move') c.start = clamp(Math.round((drag.start + db) / snap) * snap, 0, len - c.len);
      else if (drag.mode === 'resize') c.len = clamp(Math.round((drag.len + db) / snap) * snap, snap, len - c.start);
      else { var nd = clamp(Math.round(db / snap) * snap, -drag.offset * st.doc.bpm / 60, drag.len - snap); c.start = drag.start + nd; c.len = drag.len - nd; c.offset = Math.max(0, drag.offset + nd * 60 / st.doc.bpm); }
      v.draw();
    }
    function up() { if (drag && drag.moved) st.changed(true); drag = null; }
    function dbl(ev) {
      var laneEl = ev.target.closest('.ar-lane'); if (!laneEl || ev.target.closest('.ar-clip')) return;
      st.newClip(laneEl.dataset.track, beatAt(ev));
    }
    function keyClip(ev) { var c = ev.target.closest && ev.target.closest('.ar-clip'); if (c && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); ev.stopPropagation(); st.selectClip(c.dataset.clip); } }
    inner.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    inner.addEventListener('dblclick', dbl);
    inner.addEventListener('keydown', keyClip);
    v.destroy = function () { root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); };
    v.scrollTo = function (x) { scroll.scrollLeft = x; };
    st.arranger = v;
    st.views.push(v); v.draw();
  };

  // ---- clip editor: piano roll / drum grid / voice view
  S.mountEditor = function (host) {
    var st = this;
    host.innerHTML = '';
    var box = el('div', 'ed-box', host), empty = el('div', 'ed-empty', host);
    var scroll = el('div', 'ed-scroll', box), cv = el('canvas', 'ed-cv', scroll);
    cv.setAttribute('role', 'img');
    var KEYW = 56, ROW = 14, DRUM_ROW = 30, LO = 21, HI = 108, drag = null, lastLen = 0.5, shownKey = '';
    function current() { var c = st.selClip(); return c ? { c: c, p: c.pat ? st.doc.patterns[c.pat] : null, tr: st.track(c.track) } : null; }
    function geom(cur) {
      var w = Math.max(320, scroll.clientWidth || 640), len = cur.p ? cur.p.len : cur.c.len;
      var ppb = Math.max(18, (w - KEYW - 8) / len);
      return { w: KEYW + len * ppb + 8, ppb: ppb, len: len };
    }
    var v = { };
    v.draw = function () {
      var cur = current();
      box.style.display = cur ? '' : 'none'; empty.style.display = cur ? 'none' : ''; host.classList.toggle('is-empty', !cur);
      if (!cur) { empty.textContent = 'Select a clip in the timeline to edit it here. Double-click an empty lane to start a new part.'; return; }
      var col = tkColor(cur.tr ? cur.tr.color : 0), ink = css('--c-ink', '#111'), line = css('--c-line', '#ddd'), soft = css('--c-surface-2', '#f3f4f6'), surf = css('--c-surface', '#fff'), muted = css('--c-muted', '#555');
      var font = css('--font-body', 'sans-serif');
      if (cur.p && cur.p.kind === 'notes') {
        var g = geom(cur), H = (HI - LO + 1) * ROW, c = dpr(cv, g.w, H);
        cv.setAttribute('aria-label', 'Piano roll: ' + cur.p.notes.length + ' notes over ' + g.len + ' beats');
        c.fillStyle = surf; c.fillRect(0, 0, g.w, H);
        for (var m = HI; m >= LO; m--) {
          var y = (HI - m) * ROW, black = [1, 3, 6, 8, 10].indexOf(m % 12) >= 0, inKey = T.inScale(m, st.doc.key, st.doc.scale);
          c.fillStyle = inKey ? (black ? soft : surf) : soft; c.globalAlpha = inKey ? 1 : 0.55; c.fillRect(KEYW, y, g.w - KEYW, ROW); c.globalAlpha = 1;
          c.fillStyle = black ? ink : surf; c.fillRect(0, y, KEYW - 6, ROW);
          if (m % 12 === st.doc.key % 12) { c.fillStyle = col; c.fillRect(KEYW - 6, y, 6, ROW); }
          c.strokeStyle = line; c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(g.w, y + 0.5); c.stroke();
          if (m % 12 === 0 || m % 12 === st.doc.key % 12) { c.fillStyle = black ? surf : muted; c.font = '10px ' + font; c.fillText(T.name(m), 4, y + ROW - 3); }
        }
        for (var s16 = 0; s16 <= g.len * 4; s16++) {
          var x = KEYW + s16 / 4 * g.ppb; c.strokeStyle = line; c.globalAlpha = s16 % 16 === 0 ? 1 : s16 % 4 === 0 ? 0.7 : 0.25;
          c.lineWidth = s16 % 16 === 0 ? 2 : 1; c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke();
        }
        c.globalAlpha = 1; c.lineWidth = 1;
        cur.p.notes.forEach(function (n, i) {
          var nx = KEYW + n.t * g.ppb, ny = (HI - n.p) * ROW, nw = Math.max(4, n.d * g.ppb - 1);
          c.fillStyle = col; c.globalAlpha = 0.45 + 0.55 * (n.v || 0.8); c.fillRect(nx, ny + 1, nw, ROW - 2); c.globalAlpha = 1;
          c.strokeStyle = i === st.sel.note ? ink : 'rgba(0,0,0,.35)'; c.lineWidth = i === st.sel.note ? 2 : 1; c.strokeRect(nx + 0.5, ny + 1.5, nw - 1, ROW - 3); c.lineWidth = 1;
          if (n.w) { c.fillStyle = '#111111'; c.font = '600 10px ' + font; c.save(); c.beginPath(); c.rect(nx, ny, Math.max(nw, 40), ROW); c.clip(); c.fillText(n.w, nx + 3, ny + ROW - 3.5); c.restore(); }  // the syllable sung on it
        });
        v.g = g; v.kind = 'notes';
        var keyId = cur.c.id + ':' + cur.p.notes.length;
        if (shownKey !== cur.c.id) {  // scroll to the notes the first time this clip is shown
          shownKey = cur.c.id;
          var ps = cur.p.notes.map(function (n) { return n.p; }), mid = ps.length ? (Math.min.apply(null, ps) + Math.max.apply(null, ps)) / 2 : 64;
          scroll.scrollTop = Math.max(0, (HI - mid) * ROW - scroll.clientHeight / 2);
        }
        void keyId;
      } else if (cur.p && cur.p.kind === 'drums') {
        var gd = geom(cur), HD = HB.LANES.length * DRUM_ROW, cd = dpr(cv, gd.w, HD);
        cv.setAttribute('aria-label', 'Drum grid: ' + cur.p.hits.length + ' hits over ' + gd.len + ' beats');
        cd.fillStyle = surf; cd.fillRect(0, 0, gd.w, HD);
        HB.LANES.forEach(function (lane, li) {
          var y = li * DRUM_ROW;
          cd.fillStyle = li % 2 ? soft : surf; cd.fillRect(0, y, gd.w, DRUM_ROW);
          cd.fillStyle = ink; cd.font = '600 12px ' + font; cd.fillText(HB.LANE_NAMES[lane], 6, y + DRUM_ROW / 2 + 4);
        });
        for (var st16 = 0; st16 < gd.len * 4; st16++) {
          var xx = KEYW + st16 / 4 * gd.ppb;
          if (Math.floor(st16 / 4) % 2 === 0) { cd.fillStyle = 'rgba(0,0,0,.035)'; cd.fillRect(xx, 0, gd.ppb / 4, HD); }
          cd.strokeStyle = line; cd.globalAlpha = st16 % 16 === 0 ? 1 : st16 % 4 === 0 ? 0.6 : 0.25; cd.beginPath(); cd.moveTo(xx + 0.5, 0); cd.lineTo(xx + 0.5, HD); cd.stroke();
        }
        cd.globalAlpha = 1;
        cur.p.hits.forEach(function (h) {
          var li2 = HB.LANES.indexOf(h.lane); if (li2 < 0) return;
          var hx = KEYW + h.t * gd.ppb, hw = Math.max(5, gd.ppb / 4 - 3), hy = li2 * DRUM_ROW + 5;
          cd.fillStyle = col; cd.globalAlpha = 0.35 + 0.65 * h.v; cd.fillRect(hx + 1.5, hy, hw, DRUM_ROW - 10); cd.globalAlpha = 1;
          cd.strokeStyle = 'rgba(0,0,0,.35)'; cd.strokeRect(hx + 2, hy + 0.5, hw - 1, DRUM_ROW - 11);
        });
        v.g = gd; v.kind = 'drums'; shownKey = cur.c.id;
      } else if (cur.c.take) {
        var tk = st.takes[cur.c.take], w = Math.max(320, scroll.clientWidth || 640), Hv = 220, cvv = dpr(cv, w, Hv);
        cv.setAttribute('aria-label', 'Voice recording with its pitch: the thin line is what you sang, the thick line what you hear');
        cvv.fillStyle = surf; cvv.fillRect(0, 0, w, Hv);
        v.kind = 'voice'; shownKey = cur.c.id;
        if (!tk || !tk.samples) { cvv.fillStyle = muted; cvv.font = '14px ' + font; cvv.fillText(tk && tk.missing ? 'This recording could not be loaded.' : 'Loading the recording...', 16, 40); return; }
        var sr = tk.sr, spb = 60 / st.doc.bpm, s0 = Math.floor((cur.c.offset || 0) * sr), n = Math.min(tk.samples.length - s0, Math.floor(cur.c.len * spb * sr));
        var per = Math.max(1, Math.floor(n / w));
        cvv.fillStyle = soft;
        for (var px2 = 0; px2 < w; px2++) { var a0 = s0 + px2 * per, pk = 0; for (var q = 0; q < per; q += 3) pk = Math.max(pk, Math.abs(tk.samples[a0 + q] || 0)); var hh = pk * Hv * 0.45; cvv.fillRect(px2, Hv / 2 - hh, 1, hh * 2); }
        if (!tk.an) tk.an = V.analyse(tk.samples, sr);
        var an = tk.an, voice = cur.tr.voice, tg = V.targets(an, voice, st.doc.key, st.doc.scale);
        var vs = []; for (var f = 0; f < an.n; f++) if (tg.src[f]) vs.push(tg.src[f]);
        if (!vs.length) { cvv.fillStyle = muted; cvv.font = '14px ' + font; cvv.fillText('No sung pitch found (spoken words or beatbox are fine).', 16, 30); return; }
        vs.sort(function (p1, p2) { return p1 - p2; });
        var lo = Math.floor(vs[Math.floor(vs.length * 0.03)]) - 3, hi = Math.ceil(vs[Math.floor(vs.length * 0.97)]) + 3, rows = Math.max(8, hi - lo);
        cvv.font = '10px ' + font;
        for (var mm = lo; mm <= hi; mm++) if (T.inScale(mm, st.doc.key, st.doc.scale)) {
          var yy = (hi - mm) / rows * Hv; cvv.strokeStyle = line; cvv.globalAlpha = 0.8; cvv.beginPath(); cvv.moveTo(0, yy + 0.5); cvv.lineTo(w, yy + 0.5); cvv.stroke();
          cvv.globalAlpha = 1; cvv.fillStyle = muted; cvv.fillText(T.name(mm), 4, yy - 2);
        }
        var off = (cur.c.offset || 0), dur = n / sr, sh = voice.pitch || 0;
        [[tg.src, muted, 1.5, 0], [tg.out, col, 3, sh]].forEach(function (cfg) {
          cvv.strokeStyle = cfg[1]; cvv.lineWidth = cfg[2]; cvv.beginPath(); var on = false;
          for (var fr = 0; fr < an.n; fr++) {
            var tt = fr * an.hop + an.offset - off; if (tt < 0 || tt > dur) { on = false; continue; }
            var mv = cfg[0][fr]; if (!mv) { on = false; continue; }
            var X = tt / dur * w, Y = (hi - (mv + cfg[3])) / rows * Hv;
            if (on) cvv.lineTo(X, Y); else cvv.moveTo(X, Y); on = true;
          }
          cvv.stroke();
        });
        cvv.lineWidth = 1;
      }
      v.tick(st.mode !== 'idle');
    };
    var phEl = el('div', 'ed-ph', scroll);
    v.tick = function (playing) {
      var cur = current(); if (!cur || !playing) { phEl.style.display = 'none'; return; }
      var b = st.position() - cur.c.start;
      if (b < 0 || b >= cur.c.len) { phEl.style.display = 'none'; return; }
      phEl.style.display = 'block';
      if (v.kind === 'voice') phEl.style.transform = 'translateX(' + (b / cur.c.len * (scroll.clientWidth || 640)) + 'px)';
      else if (v.g) { var pl = cur.p ? cur.p.len : cur.c.len; phEl.style.transform = 'translateX(' + (KEYW + (b % pl) * v.g.ppb) + 'px)'; }
    };
    function hitAt(ev) {
      var r = cv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      return { x: x, y: y };
    }
    function noteAt(cur, x, y) {
      for (var i = cur.p.notes.length - 1; i >= 0; i--) {
        var n = cur.p.notes[i], nx = KEYW + n.t * v.g.ppb, ny = (HI - n.p) * ROW, nw = Math.max(4, n.d * v.g.ppb);
        if (x >= nx && x <= nx + nw && y >= ny && y <= ny + ROW) return { i: i, edge: x > nx + nw - 7 };
      }
      return null;
    }
    function down(ev) {
      var cur = current(); if (!cur || !cur.p || !st.editable) return;
      var h = hitAt(ev), snap = 0.25;
      if (v.kind === 'notes') {
        if (h.x < KEYW) { A.previewNote(cur.tr.inst, HI - Math.floor(h.y / ROW) + (cur.tr.oct || 0) * 12, 0.4); return; }
        var t = Math.floor((h.x - KEYW) / v.g.ppb / snap) * snap, p = HI - Math.floor(h.y / ROW);
        var hit = noteAt(cur, h.x, h.y);
        if (ev.button === 2 || (hit && ev.detail >= 2)) { if (hit) { st.mutate(function () { cur.p.notes.splice(hit.i, 1); st.sel.note = null; }); } ev.preventDefault(); return; }
        st.snapshot();
        if (hit) { st.sel.note = hit.i; var n = cur.p.notes[hit.i]; drag = { mode: hit.edge ? 'len' : 'move', n: n, x0: h.x, y0: h.y, t0: n.t, p0: n.p, d0: n.d }; }
        else {
          if (t < 0 || t >= v.g.len) return;
          var nn = { t: t, d: Math.min(lastLen, v.g.len - t), p: p, v: 0.8 };
          cur.p.notes.push(nn); st.sel.note = cur.p.notes.length - 1;
          drag = { mode: 'len', n: nn, x0: h.x, y0: h.y, t0: t, p0: p, d0: nn.d, fresh: true };
          A.previewNote(cur.tr.inst, p + (cur.tr.oct || 0) * 12, 0.3);
        }
        cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
        v.draw();
      } else if (v.kind === 'drums') {
        if (h.x < KEYW) { A.previewDrum(cur.tr.inst, HB.LANES[Math.floor(h.y / DRUM_ROW)]); return; }
        var lane = HB.LANES[Math.floor(h.y / DRUM_ROW)], ts = Math.floor((h.x - KEYW) / v.g.ppb * 4) / 4;
        if (!lane || ts < 0 || ts >= v.g.len) return;
        st.snapshot();
        var idx = -1; cur.p.hits.forEach(function (x, i) { if (x.lane === lane && Math.abs(x.t - ts) < 0.01) idx = i; });
        var adding = idx < 0;
        if (adding) { cur.p.hits.push({ t: ts, lane: lane, v: ev.shiftKey ? 0.5 : 0.9 }); A.previewDrum(cur.tr.inst, lane); } else cur.p.hits.splice(idx, 1);
        drag = { mode: 'paint', adding: adding, lane: lane, done: {} }; drag.done[ts] = 1;
        cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
        v.draw();
      }
    }
    function move(ev) {
      if (!drag) return;
      var cur = current(); if (!cur || !cur.p) return;
      var h = hitAt(ev), snap = ev.altKey ? 0.125 : 0.25;
      if (drag.mode === 'move') {
        var nt = clamp(Math.round((drag.t0 + (h.x - drag.x0) / v.g.ppb) / snap) * snap, 0, v.g.len - snap), np = clamp(drag.p0 - Math.round((h.y - drag.y0) / ROW), LO, HI);
        if (np !== drag.n.p) A.previewNote(cur.tr.inst, np + (cur.tr.oct || 0) * 12, 0.2);
        drag.n.t = nt; drag.n.p = np;
      } else if (drag.mode === 'len') {
        drag.n.d = clamp(Math.round((drag.d0 + (h.x - drag.x0) / v.g.ppb) / snap) * snap, snap, v.g.len - drag.n.t);
      } else if (drag.mode === 'paint') {
        var ts = Math.floor((h.x - KEYW) / v.g.ppb * 4) / 4;
        if (ts < 0 || ts >= v.g.len || drag.done[ts]) return;
        drag.done[ts] = 1;
        var idx = -1; cur.p.hits.forEach(function (x, i) { if (x.lane === drag.lane && Math.abs(x.t - ts) < 0.01) idx = i; });
        if (drag.adding && idx < 0) cur.p.hits.push({ t: ts, lane: drag.lane, v: ev.shiftKey ? 0.5 : 0.9 });
        if (!drag.adding && idx >= 0) cur.p.hits.splice(idx, 1);
      }
      v.draw();
    }
    function up() { if (drag) { if (drag.n) lastLen = drag.n.d; drag = null; st.changed(true); } }
    v.deleteNote = function () { var cur = current(); if (cur && cur.p && cur.p.notes && st.sel.note !== null && cur.p.notes[st.sel.note]) { st.mutate(function () { cur.p.notes.splice(st.sel.note, 1); st.sel.note = null; }); } };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    var ro = root.ResizeObserver ? new root.ResizeObserver(function () { v.draw(); }) : null; if (ro) ro.observe(host);
    v.destroy = function () { root.removeEventListener('pointermove', move); root.removeEventListener('pointerup', up); if (ro) ro.disconnect(); };
    st.editor = v;
    st.views.push(v); v.draw();
  };

  // ---- lyrics prompter
  S.showPrompter = function (on, auto) { this.prompterOn = !!on; if (auto) this._autoPrompter = !!on; if (this.prompter) this.prompter.draw(); this.changed(false); };
  S.mountPrompter = function (host) {
    var st = this, last = '';
    var v = {
      draw: function () { last = ''; host.style.display = st.prompterOn ? '' : 'none'; v.tick(true); },
      tick: function () {
        if (!st.prompterOn) return;
        var b = st.position(), sec = HB.Doc.sectionAt(st.doc, b) || { s: st.doc.sections[0], start: 0 };
        var text = (st.doc.lyrics[sec.s.id] || '').trim(), lines = text ? text.split('\n').filter(function (x) { return x.trim(); }) : [];
        var prog = (b - sec.start) / (sec.s.bars * 4), cur = lines.length ? Math.min(lines.length - 1, Math.floor(prog * lines.length)) : -1;
        var key = sec.s.id + ':' + cur + ':' + text.length;
        if (key === last) return; last = key;
        host.innerHTML = '';
        var hd = el('div', 'pr-sec', host); hd.textContent = sec.s.name;
        if (!lines.length) { var e = el('div', 'pr-line pr-none', host); e.textContent = 'No words for this section yet (Lyrics tab).'; return; }
        lines.forEach(function (ln, i) { var d = el('div', 'pr-line' + (i === cur ? ' on' : i < cur ? ' past' : ''), host); d.textContent = ln; });
      }
    };
    st.prompter = v; st.views.push(v); v.draw();
  };

  // ------------------------------------------------------------------ a listen-only player (share pages)
  HB.Player = function (doc, opts) {
    var p = this; opts = opts || {};
    p.st = new Studio({ doc: doc, editable: false, api: opts.api, guest: false, hooks: { change: opts.change || function () {}, status: opts.status || function () {} } });
  };
  HB.Player.prototype.toggle = function () { this.st.toggle(); return this.st.mode !== 'idle'; };
  HB.Player.prototype.destroy = function () { this.st.destroy(); };

  // ------------------------------------------------------------------ previews for genre cards (landing, Styles)
  var PV = { genre: null };
  HB.previewGenre = function (genreId, onChange) {
    if (PV.genre === genreId && A.playing()) { A.stop(); PV.genre = null; if (onChange) onChange(null); return false; }
    A.unlock();
    var doc = HB.Doc.preview(genreId, 'chorus');
    PV.genre = genreId;
    A.play(doc, doc.loop.a, { onEnd: function () { PV.genre = null; if (onChange) onChange(null); } });
    if (onChange) onChange(genreId);
    return true;
  };
  HB.stopPreview = function () { if (PV.genre) { A.stop(); PV.genre = null; } };
  HB.previewing = function () { return A.playing() ? PV.genre : null; };
})(window);
