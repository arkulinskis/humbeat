/* The main journeys, run inside the real app (Anvil App Server) by tools/ui_test.py through tools/live/drive.mjs.
   The browser's microphone is a fake one playing tools/testing/hum.wav (a hummed C D E G A tune).
   Resolves to {ok, log}. Keep log lines ASCII (the Windows console). */
(async function () {
  const log = [], t0 = Date.now();
  const say = (m) => log.push(((Date.now() - t0) / 1000).toFixed(1) + 's ' + m);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function until(fn, what, ms) {
    const end = Date.now() + (ms || 20000);
    while (Date.now() < end) { try { const v = fn(); if (v) return v; } catch (e) {} await sleep(150); }
    throw new Error('timed out waiting for: ' + what);
  }
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const norm = (e) => e ? e.textContent.trim().replace(/\s+/g, ' ') : '';
  const shown = (e) => e && e.getBoundingClientRect().width > 0;
  const byText = (sel, text) => $$(sel).find((e) => norm(e) === text && shown(e));
  async function click(sel, text) {
    const el = await until(() => (text ? byText(sel, text) : $$(sel).find(shown)), sel + (text ? ' "' + text + '"' : ''));
    el.scrollIntoView({ block: 'center' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return el;
  }
  function type(input, value) {
    input.focus(); input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function blur(input) { input.dispatchEvent(new FocusEvent('blur')); input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); input.blur(); }
  async function page(hash, ready, what) {
    if (location.hash !== hash) window.UI_READY = false;
    location.hash = hash;
    await until(() => window.UI_READY && location.hash === hash && ready(), what || hash, 40000);
    await sleep(300);
  }
  const ok = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); say('ok   ' + msg); };
  const ST = () => window.HB_STUDIO;
  const S = () => JSON.parse(ST().stateJson());
  async function tab(name) { await click('.rb-tab', name); await until(() => $('.rb-tab.on') && norm($('.rb-tab.on')) === name, 'tab ' + name); await sleep(250); }
  async function ribbon(text) { return click('.rb-panel .anvil-role-rb > button, .rb-panel .anvil-role-rb-tile > button', text); }
  function pointer(el, type, x, y) {
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }
  function tap(el, x, y) { pointer(el, 'pointerdown', x, y); pointer(window, 'pointerup', x, y); }
  async function modal() { return until(() => $$('.anvil-modal').find(shown), 'dialog'); }
  async function modalGone() { await until(() => !$$('.anvil-modal').some(shown), 'dialog closed'); await sleep(300); }

  try {
    try { localStorage.removeItem('humbeat.guest.song'); localStorage.removeItem('humbeat.rbtab'); localStorage.removeItem('humbeat.side'); } catch (e) {}

    // ---- landing: the rolling cover hero plays a style
    await page('#landing', () => $('.lp-hero') && $$('.rl-card svg').length >= 10, 'landing with covers');
    ok($('.lp-hero a[href="#auth/signup"]'), 'landing: hero with a sign-up link');
    ok($$('.rl-card').length === 12 && $('.rl-card.on'), 'landing: 12 style covers in the stack, one in front');
    const name0 = norm($('.anvil-role-rl-name'));
    await click('.rl-bar .anvil-role-btn-icon button', 'Next style');
    await until(() => norm($('.anvil-role-rl-name')) !== name0, 'next style');
    ok(true, 'landing: Next rolls to ' + norm($('.anvil-role-rl-name')));
    await click('.anvil-role-rl-play button');
    await until(() => window.HB.previewing(), 'preview playing');
    await sleep(1500);
    ok(window.HB.audio.position() > 0.5, 'landing: Play plays the chorus of that style (beat ' + window.HB.audio.position().toFixed(1) + ')');
    await click('.anvil-role-rl-play button');
    await until(() => !window.HB.previewing(), 'preview stopped');

    // ---- the guest studio
    await page('#studio', () => ST() && $$('.th').length >= 4 && $$('.ar-clip').length > 5, 'guest studio');
    let s = S();
    ok(s.genre === 'hopecore' && s.tracks.length >= 5 && s.editable, 'studio: a visitor gets a ready hopecore song (' + s.tracks.length + ' tracks, ' + $$('.ar-clip').length + ' clips)');
    ok(/visitor/.test(norm($('.st-banner'))), 'studio: the visitor banner explains where the song is kept');
    ok($$('.rb-tab').length === 10, 'studio: ribbon with 10 tabs');
    await click('.anvil-role-st-play button');
    await until(() => S().mode === 'play' && window.HB.audio.position() > 0.5, 'playing');
    await sleep(800);
    ok(/^\d+\.\d/.test(norm($('.st-time'))), 'studio: Play plays and the time readout moves (' + norm($('.st-time')) + ')');
    await click('.anvil-role-st-play button');
    await until(() => S().mode === 'idle', 'stopped');
    for (const t of ['File', 'Home', 'Insert', 'Record', 'Voice', 'Instrument', 'Effects', 'Song', 'Lyrics', 'Mix']) {
      await tab(t);
      if (!$$('.rb-panel .rb-group').filter(shown).length) throw new Error('FAILED: ribbon tab ' + t + ' shows no groups');
    }
    ok(true, 'ribbon: all 10 tabs open with their groups');

    // ---- tempo from the Home tab
    await tab('Home');
    const bpm = $('input.anvil-role-rb-num') || $('.anvil-role-rb-num input');
    type(bpm, '96'); blur(bpm);
    await until(() => S().bpm === 96, 'tempo 96');
    ok(true, 'home tab: typing a tempo changes it (96 BPM)');

    // ---- drum grid: select a drum clip, add a hit, undo
    const drumLane = $$('.ar-lane').find((l) => ST().track(l.dataset.track).kind === 'drums');
    const dclip = drumLane.querySelector('.ar-clip'), r0 = dclip.getBoundingClientRect();
    tap(dclip, r0.left + 30, r0.top + 30);
    await until(() => S().clip && S().clip.kind === 'drums' && shown($('.ed-cv')), 'drum clip in the editor');
    const pat = ST().patternOf(ST().selClip()), hits0 = pat.hits.length;
    const cr = $('.ed-cv').getBoundingClientRect();
    tap($('.ed-cv'), cr.left + 56 + 3, cr.top + 30 * 5 + 15);
    await sleep(250);
    ok(Math.abs(pat.hits.length - hits0) === 1, 'drum grid: a click toggles a hit (' + hits0 + ' -> ' + pat.hits.length + ')');
    await click('.rb-panel .anvil-role-rb > button', 'Undo');
    await until(() => ST().patternOf(ST().selClip()) && ST().patternOf(ST().selClip()).hits.length === hits0, 'undo');
    ok(true, 'undo puts it back');

    // ---- piano roll: a chords clip, add a note, snap to key
    const chordLane = $$('.ar-lane').find((l) => ST().track(l.dataset.track).role === 'chords');
    const cclip = chordLane.querySelector('.ar-clip'), rc = cclip.getBoundingClientRect();
    tap(cclip, rc.left + 20, rc.top + 30);
    await until(() => S().clip && S().clip.kind === 'notes', 'notes clip in the editor');
    const np = ST().patternOf(ST().selClip()), n0 = np.notes.length;
    $('.ed-scroll').scrollTop = 0; await sleep(150);
    const r3 = $('.ed-cv').getBoundingClientRect();
    tap($('.ed-cv'), r3.left + 56 + 20, r3.top + (108 - 85) * 14 + 7);
    await sleep(250);
    ok(np.notes.length === n0 + 1 && np.notes[np.notes.length - 1].p === 85, 'piano roll: a click adds a note (C#6, out of the key)');
    ok(/linked/.test(norm($('.anvil-role-ed-info'))), 'editor: says the part is linked to other clips');
    await click('.st-ed-group .anvil-role-btn > button', 'Snap to key');
    await sleep(200);
    ok(ST().patternOf(ST().selClip()).notes.every((n) => window.HB.theory.inScale(n.p, S().key, S().scale)), 'editor: Snap to key moves it into the scale');

    // ---- record a voice take with the (fake) microphone
    await tab('Record');
    ST().countIn = false;
    await ribbon('Record voice');
    await until(() => S().mode === 'rec', 'recording', 15000);
    await sleep(3500);
    await ribbon('Stop recording');
    await until(() => S().mode === 'idle' && Object.keys(ST().doc.takes).length === 1, 'take kept', 15000);
    const vclip = ST().doc.clips.find((c) => c.take);
    const secs = ST().takes[vclip.take].samples.length / 32000;
    ok(vclip && secs > 2, 'record: a voice clip with a ' + secs.toFixed(1) + ' s take');
    await until(() => ST().doc.takes[vclip.take].local, 'take kept in the browser', 10000);
    ok(true, 'record: a visitor\'s take is kept in this browser (IndexedDB)');
    ok(S().clip && S().clip.kind === 'voice', 'editor: the voice view shows the new take');

    // ---- voice tab: hard tune
    await tab('Voice');
    await click('.rb-panel .anvil-role-rb-preset > button', 'Hard tune');
    await until(() => S().track && S().track.voice.preset === 'mumble' && S().track.voice.tune === 1 && S().track.voice.speed === 0, 'hard tune');
    ok(true, 'voice: Hard tune = auto-tune 100% at retune speed 0');
    await until(() => Object.keys(ST().processed).some((k) => k.indexOf('1,0,') > 0), 'voice re-tuned', 30000);
    ok(true, 'voice: the take is re-tuned with the new setting');

    // ---- hum to notes
    await tab('Insert');
    const tracksBefore = S().tracks.length;
    await ribbon('Hum a melody');
    await modal();
    const songBox = $('.hum input[type=checkbox]'); if (songBox.checked) songBox.click();
    await click('.hum .anvil-role-btn-primary button', 'Start listening');
    await until(() => /Listening/.test(norm($('.anvil-role-hum-big'))), 'hum listening', 15000);
    await sleep(6000);
    await click('.hum .anvil-role-btn-primary button', 'Stop');
    const heard = await until(() => $$('.anvil-role-hum-lead').map(norm).find((t) => /^Heard/.test(t)), 'hum result', 30000);
    ok(/Heard \d+ notes/.test(heard), 'hum: ' + heard.slice(0, 120));
    const sel = $$('.hum select').find(shown), names = Array.from(sel.options).map((o) => o.textContent);
    sel.selectedIndex = names.indexOf('Strings'); sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(800);
    await click('.hum .anvil-role-btn-primary button', 'Add it as a new track');
    await modalGone();
    s = S();
    ok(s.tracks.length === tracksBefore + 1 && /Hummed/.test(s.track.name) && s.track.inst === 'strings', 'hum: a new "' + s.track.name + '" track plays it on strings');
    const hp = ST().patternOf(ST().selClip());
    ok(hp.notes.length >= 4, 'hum: ' + hp.notes.length + ' notes: ' + hp.notes.slice(0, 8).map((n) => window.HB.theory.name(n.p)).join(' '));

    // ---- instrument tab: the hummed tune becomes a bass
    await tab('Instrument');
    await click('.rb-panel .anvil-role-chip > button', 'Bass');
    await click('.rb-panel .anvil-role-rb-tile > button', 'Bass guitar');
    await until(() => S().track.inst === 'bassguitar' && S().track.oct < 0, 'bass');
    ok(true, 'instrument: now a bass guitar part, ' + S().track.oct + ' octave(s) down');

    // ---- song structure + chords
    await tab('Song');
    const secs0 = S().sections.length;
    await ribbon('Sections');
    await modal();
    await click('.secd .anvil-role-btn button', 'Add at the end');
    await until(() => S().sections.length === secs0 + 1 && $$('.sr').length === secs0 + 1, 'section added');
    ok(true, 'sections: a section is added (' + (secs0 + 1) + ')');
    await click('.secd .anvil-role-btn-primary button', 'Done');
    await modalGone();
    await ribbon('Chords');
    await modal();
    await until(() => $$('.anvil-role-pc > button').length > 10, 'progressions');
    $$('.anvil-role-pc > button')[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await until(() => ST().doc.progs && Object.keys(ST().doc.progs).length >= 1, 'progression applied');
    ok(true, 'chords: a new progression rebuilds the parts ' + JSON.stringify(ST().doc.progs));
    await click('.chd .anvil-role-btn-primary button', 'Done');
    await modalGone();

    // ---- mix down offline (8 beats), and MIDI
    const buf = await window.HB.audio.render(ST().doc, { from: 0, to: 8, takeBuffer: ST().takeBuffer.bind(ST()) });
    let peak = 0; const ch0 = buf.getChannelData(0); for (let i = 0; i < ch0.length; i += 7) peak = Math.max(peak, Math.abs(ch0[i]));
    ok(buf.duration > 4 && peak > 0.01 && peak <= 1.01, 'export: the mix renders offline (' + buf.duration.toFixed(1) + ' s, peak ' + peak.toFixed(2) + ')');
    const midi = await window.HB.audio.midi(ST().doc).arrayBuffer();
    ok(new TextDecoder().decode(midi.slice(0, 4)) === 'MThd', 'export: a MIDI file (' + midi.byteLength + ' bytes)');

    // ---- lyrics pane
    const box = $$('.ly textarea')[1] || $('.ly textarea');
    type(box, 'City lights are calling out my name\nEvery step I take I feel the same'); blur(box);
    await until(() => Object.values(ST().doc.lyrics).some((t) => /City lights/.test(t)), 'lyrics kept');
    const syl = norm(box.closest('.ly').querySelector('.anvil-role-ly-syll')).replace(/[^ -~]/g, '/');
    ok(/Syllables: \d+ \/ \d+/.test(syl), 'lyrics: words are kept and syllables counted (' + syl + ')');
    ST().flush();
    await sleep(300);
    const guest = JSON.parse(localStorage.getItem('humbeat.guest.song'));
    ok(guest && guest.tracks.length === S().tracks.length, 'a visitor\'s song is saved in this browser');

    // ---- sign up: the visitor's song moves into the account, recording included
    await page('#auth/signup', () => $$('.au-card input').length >= 3, 'sign-up');
    const inputs = $$('.au-card input[type=text], .au-card input[type=email], .au-card input[type=password]').filter((i) => i.offsetParent);
    type(inputs[0], 'Flow Tester'); type(inputs[1], 'flow' + Date.now() + '@example.com'); type(inputs[2], 'Hb-' + Math.random().toString(36).slice(2) + '-Kq7');
    const tick = $('.au-card input[type=checkbox]'); if (tick && !tick.checked) tick.click();
    await click('.anvil-role-btn-block button', 'Create account');
    await until(() => location.hash === '#home' && window.UI_READY && shown($('.hm-import')), 'home with the import offer', 40000);
    ok(true, 'home: offers to move the visitor song in');
    await click('.hm-import .anvil-role-btn-primary button', 'Move it into my songs');
    await until(() => /^#studio\/./.test(location.hash) && ST() && S().tracks.length >= 6, 'studio with the imported song', 60000);
    const sid = decodeURIComponent(location.hash.split('/')[1]);
    const take = Object.keys(ST().doc.takes)[0];
    ok(take && ST().doc.takes[take].key && !ST().doc.takes[take].local, 'import: the take was uploaded (it has a server key)');

    // ---- reload: the song and its recording come back from the server
    await page('#home', () => $$('.sc').length >= 1, 'home');
    await page('#studio/' + encodeURIComponent(sid), () => ST() && ST().takes[take] && (ST().takes[take].samples || ST().takes[take].missing), 'studio reloaded', 40000);
    ok(ST().takes[take].samples && ST().takes[take].samples.length > 32000, 'reload: the recording streams back from /_/api/take/<key>');
    ok(Object.values(ST().doc.lyrics).some((t) => /City lights/.test(t)) && S().bpm === 96, 'reload: the words and the tempo were saved');

    // ---- share and listen
    await tab('File');
    await ribbon('Share link');
    await modal();
    $('.shd input[type=checkbox]').click();
    const linkBox = await until(() => $$('.shd input').find((i) => i.type !== 'checkbox' && /#listen\//.test(i.value)), 'share link', 20000);
    const link = linkBox.value;
    ok(true, 'share: a listen link (' + link.split('#')[1].slice(0, 22) + '...)');
    await click('.shd .anvil-role-btn button', 'Done');
    await modalGone();
    await page('#' + link.split('#')[1], () => ST() && shown($('.ls-grid')), 'listen page', 40000);
    ok(/Flow Tester/.test(norm($('.anvil-role-ls-by'))), 'listen: shows the song and who made it');
    await click('.ls-actions .anvil-role-btn-primary button');
    await until(() => S().mode === 'play', 'listen plays', 20000);
    await sleep(1200);
    ok($('.st-prompter .pr-sec'), 'listen: plays, with the words of each section');
    await click('.ls-actions .anvil-role-btn-primary button');

    // ---- a new song from a style, the songs page
    await page('#home', () => $$('.sc').length >= 1, 'home with songs');
    ok($$('.anvil-role-sc-spot .sc').length >= 5, 'home: your song and the spotlight of shared songs');
    await click('.ui-page-head .anvil-role-btn-primary button', 'New song');
    await modal();
    const metal = $$('.anvil-role-stt-pick > button').find((b) => /Heavy Metal/.test(b.textContent));
    metal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await until(() => $$('.stt.on').length === 1 && /Heavy Metal/.test($('.stt.on').textContent), 'metal picked');
    type($('.ns input'), 'Iron Test');
    await click('.ns .anvil-role-btn-primary button', 'Start the song');
    await until(() => /^#studio\/./.test(location.hash) && ST() && S().genre === 'metal' && S().title === 'Iron Test', 'metal song', 40000);
    ok(S().tracks.some((t) => t.inst === 'distguitar'), 'new song: a metal song with distorted guitars');

    // ---- styles and learn
    await page('#styles/drill', () => /Drill/.test(norm($('.anvil-role-page-title'))), 'styles drill');
    ok($$('.sty').length === 18 && /808/.test(norm($('.sy-ing'))), 'styles: what makes drill, and all 18 styles');
    await page('#learn', () => $('#lr-pitch'), 'learn');
    ok(/PSOLA/.test($('#lr-pitch').textContent), 'learn: the guide explains auto-tune');

    // ---- sign out
    await page('#profile', () => $('.pf-grid'), 'profile');
    await click('.anvil-role-avatar button');
    await click('.ui-menu button', 'Sign out');
    await until(() => location.hash === '#landing' && window.UI_READY, 'signed out');
    ok(true, 'sign out: back to the landing page');

    say('PASSED');
    return { ok: true, log: log };
  } catch (e) {
    say(String(e && e.message || e));
    try { say('state: ' + (window.HB_STUDIO ? window.HB_STUDIO.stateJson().slice(0, 300) : 'no studio')); } catch (x) {}
    say('at ' + location.hash + ': ' + document.body.innerText.replace(/\s+/g, ' ').slice(0, 400).replace(/[^ -~]/g, '?'));
    return { ok: false, log: log };
  }
})();
