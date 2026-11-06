---
name: humbeat
description: Context, workflow and recipes for Humbeat (folder humbeat), the user's Anvil app built as native Anvil Forms (Python + HTML templates, a layout, custom components, RepeatingPanels). A browser music studio: songs from 18 genre recipes, voice recording with auto-tune and a voice menu, hum-to-notes, beatbox-to-drums, a Word-style ribbon, WAV/MIDI export, share links. Load this before any feature request, bug fix, restyle, content change or deploy for this app.
---

# Humbeat: working on the app

**What it is:** a music studio for people who don't know music production. Core loop: pick a style -> a full
arrangement plays -> record your voice (auto-tune, presets) / hum a melody that becomes notes / beatbox drums -> shape it
in the ribbon -> share a listen link or export WAV / MIDI. Visitors get one song kept in the browser; members keep many on
the server. Areas: Landing, Songs (#home), Studio, Styles, Learn (production guide), Listen (#listen/<key>), Admin.

**Where it lives:**
- Folder `C:\Users\arkvi\Documents\CLAUDE\humbeat\` = the git clone of **github.com/arkulinskis/humbeat**, branch `master`.
  "git" layout: the folder *is* the Anvil app. Anvil pulls master; pushing is the deploy. Live: https://humbeat.anvil.app (published 2026-11-06).
- Made from `C:\Users\arkvi\Documents\CLAUDE\APP_MAKER\template-forms` (native Anvil Forms, Nov 2026). Anvil's own agent
  skills describe the same model: `client-forms`, `data-models`, `server-code`, `client-modules`, `anvil-yaml`
  (github.com/anvil-works/anvil-agent-references; see APP_MAKER/ANVIL_NOTES.md, "Native Anvil Forms").
- **README.md** lists every feature. Keep it up to date.

**What the user wants:** "make any kind of song in a very simple ribbon style UI on top like Microsoft Word"; styles from
millennial hopecore, mumble rap and heavy metal to MJ / Britney / Taylor-era pop; record the voice (no generation), a voice
modification menu like auto-tune; sing / hum notes that become MIDI for any instrument. Design direction they chose:
**Riso Poster** (white stock, black type, riso pink #ff3e7f fills with black text, riso blue #2449f5, yellow #ffc21a;
Darker Grotesque 700-900 for display, Instrument Sans body, JetBrains Mono only for tempo / bars / time; 4-6 px radii,
2 px black rules, flat colour, halftone dots on covers only). Style names never use artists' names. Claude assumes
details and builds; Claude deploys. Mobile-first: every page must fit 390 px. Light and dark.

## Workflow for any change

1. `git pull --ff-only` (Anvil commits "Edited ..." when the user changes something in the IDE; read those commits).
2. Edit: a page's template and Python side by side (`client_code/Pages/X/form_template.html` + `__init__.py`).
3. `python tools/check.py` (no -I) -> **ALL CHECKS PASSED**: Anvil's validator (`anvil validate`, type-checks every
   template and Python file against Anvil's API), JS syntax, asset hashes (`tools/assets.py`), server tests.
   Needs the Anvil CLI once: `npm install -g @anvil-works/anvil-cli`.
4. `python -I tools/ui_test.py` (Docker Desktop running) -> **ALL UI TESTS PASSED**: the folder runs as-is in the
   open-source Anvil App Server (container `humbeat-dev`) and headless Chrome walks tools/ui/flow.js, phone.js
   (true 390 px, no sideways scroll), admin.js and a11y.js (axe-core WCAG 2.2 AA on every page, light + dark, plus
   keyboard checks). Client edits show on reload; server edits need `--restart`. `--only a11y.js` runs one script.
   `--shots DIR` = screenshots of every page, desktop + phone, light + dark, guest + member: Read them.
5. Commit only your files as arkulinskis with the Co-Authored-By line; `git push origin master`.
   New tables/columns: tell the user to accept the **Schema Mismatch** alert ("The schema of the source code is correct").

## Architecture

```
anvil.yaml                 startup: module `startup`; db_schema; services; head_html (fonts, Prepsto, theme assets with ?v=)
client_code/
  startup.py               get_me, Privacy & Terms kit, router.start()
  router.py                PAGES (who may open each page), NAV (main menu), _form (page -> Form), go/href/replace
  state.py                 me(), call() (expected {"ok": False} -> toast + None), toast(), store, set_attr, dates
  auth.py                  sign in / up / reset / Continue with Google / sign out
  legal.py                 Privacy & Terms (installed from APP_MAKER/legal-kit; don't edit here)
  Layouts/Shell            header + account menu + footer + phone tab bar; slot "content"; refresh(page)
  Pages/                   Landing, Auth, Home (EXAMPLE), Profile, Admin (overview, feedback, users, demo data)
  Components/              custom components (Initials = the example); wrap any JS engine here
  Items/                   RepeatingPanel item templates: NavLink, ItemCard (EXAMPLE), FeedbackRow, UserRow
  Dialogs/                 dialog Forms for alert(): AddItem (EXAMPLE)
server_code/               common.py (C.*), Accounts, Admin, DemoData, Feedback, ExampleItems (EXAMPLE), SchemaCheck
theme/assets/              app.css (tokens + pages + the role layer), icons.css (generated), app-kit.js, theme.css
                           (loading spinner), icon.svg + PNGs (tools/make_icons.py)
tools/                     check.py, assets.py, build_icons.py, make_icons.py, ui_test.py + ui/, live/drive.mjs, testing/
```

## How things are done here

- **Page** = `client_code/Pages/X/` with `<anvil-form layout="Humbeat.Layouts.Shell"><anvil-block slot="content">`
  and `class X(XTemplate)` taking `args=()` (the URL parts after `#x/`). Register it in router.py: `PAGES`, `_form`,
  and `NAV` if it belongs in the menu (max 4). Add its address to tools/ui/phone.js and its journey to flow.js.
- **The layout is reused between pages** (open_form keeps the Shell when the layout matches): anything in the Shell
  that depends on the user or the page goes in `Shell.refresh(page)`.
- **Navigation** = plain `<a href="#page">`; in code `router.go("page", arg)`; build links with `router.href`.
- **Static copy** = plain HTML in the template. **Text that changes** = a `Label` (role for the look).
- **Actions** = Anvil `Button` + `@handle("name", "click")`, roles `["btn", "btn-primary", "ic-plus"]`. Button roles
  are aliases of `.ui-btn` in app.css: `btn-primary`, `btn-ghost`, `btn-danger` + `btn-solid`, `btn-sm`, `btn-lg`,
  `btn-icon`, `btn-block`. Icons: role `ic-<name>` on Buttons/Links, `<i class="ic ic-<name>">` in HTML
  (names in app-kit.js `UI.ICONS`; add one there and run tools/build_icons.py).
- **Inputs** = TextBox / TextArea / DropDown / CheckBox (styled by app.css through `.ui input`, `.ui textarea`).
  Read `.text` / `.selected_value` / `.checked`; `pressed_enter` for Enter.
- **Plain HTML that changes** = `anvil:name="x"`, then `self.x.visible`, `self.x.classes["on"] = ...`,
  `self.x.style[...]`; attributes with `state.set_attr(self.x, "href", ...)`. Native clicks:
  `anvil:on-dom:click="self.x_click"` + `def x_click(self, event)`.
- **Lists** = `RepeatingPanel` + an `Items/` Form; never build repeated HTML strings. Bind fields in the item template
  (`bind:text="self.item['title']"`). Grid/flex CSS goes on the panel's items container: `.anvil-role-<role> > div`.
  Item -> page: `self.parent.raise_event("x-something", ...)` + `panel.add_event_handler("x-something", ...)`.
  Role `contents` lets a panel's items join the surrounding grid.
- **Dialogs** = a Form in `Dialogs/`, `alert(Form(...), buttons=[], role="app-dialog")`; it closes itself with
  `self.raise_event("x-close-alert", value=...)`. Yes/no: `confirm(text, title=..., buttons=[("Cancel", False), ("Delete", True)])`.
- **Toasts** = `state.toast(msg, "ok" | "error")` (Anvil Notification with roles).
- **Server calls** = `state.call("fn", ...)` for normal flows (expected `{"ok": False, "error"}` -> toast, returns None);
  a page that shows a friendly state instead (not found, private) calls `anvil.server.call` and checks `ok` itself.
  Server functions: `@anvil.server.callable(require_user=True)`, `C.require_user()` / `C.require_admin()`, ownership
  checks, return plain dicts (`C.ok(...)` / `C.fail("...")`), never other people's emails. Tables are `client: none`.
- **JavaScript** only for engines Python is too slow for (canvas, SVG drawing, WebGL, audio, maps, PDF): put it in
  `theme/assets/<name>.js`, load it in head_html (then `python tools/assets.py`), wrap it in one Python module
  (`from anvil.js import window`) and/or a `Components/` custom component. Little Hero Books is the worked example.

- **Accessibility (WCAG 2.2 AA, the legal bar; 2026-11-04)**: tools/ui/a11y.js runs axe-core on every page (light +
  dark, guest + member) and fails on serious problems; add new pages to its PUBLIC/MEMBER lists. The rules:
  - Text colours reach 4.5:1 on every surface: check new tokens (`--c-faint`, `--c-accent` used as text, status
    colours on their `-soft` fills). Text on good/bad/warn fills is `var(--c-on-status)` (white light, ink dark).
  - Every field has a name: wrap it in `<label class="ui-field"><span>Caption</span>...</label>`, or
    `state.set_control_attr(box, "aria-label", "...")` when the caption isn't a label (set it AFTER `.items` on a
    DropDown: Anvil rebuilds the select). Name/email/phone/password get `autocomplete` (set_control_attr).
  - The page's title Label is a heading: `state.heading(label, 1)` (one per page; Labels render as divs).
  - Toggle buttons say they're on: `.ui-seg` buttons get aria-pressed from the "on" class automatically (app-kit.js);
    elsewhere `state.set_control_attr(btn, "aria-pressed", ...)`. Never `role="tablist"` without real tabs.
  - Messages that appear are read out: roles msg-error/msg-note get role alert/status automatically; other changing
    Labels: `state.live(label)`. Hidden text just for screen readers: Label role `sr`.
  - When a click redraws a RepeatingPanel, keep the keyboard's place: give the item's button a `data-key` and call
    `state.refocus(panel, key)` after the event (PlanPlate's Items/Chip). Buttons have no `.focus()`: `state.focus(btn)`.
  - Images: content images get real alt text (photos: their caption); decorative ones `alt=""`; a Button icon image
    is set to alt="" automatically. Hidden anti-spam fields: `tabindex=-1`, `autocomplete=off`.

- **Design kit (2026-11-05)**: `APP_MAKER/design/README.md` is the bar for every visual change (craft floor, the
  "AI-made" tells, motion rules, worst-case data). app.css carries its CSS between `design-kit:start/end` (easing and
  duration tokens, browser surfaces, text wrapping, press feedback, gentle reduced motion): every transition uses
  `--ease-*` / `--dur-*`, no `ease-in`, no `transition: all`, no eyebrow labels, no gradient text. Checks:
  `python -I APP_MAKER/tools/design_check.py humbeat` (source; check.py prints its summary) and tools/ui/design.js
  (rendered, desktop + phone, inside ui_test.py; add new pages to its PUBLIC/MEMBER). Deliberate exceptions:
  `design-ok: <rule>` comment on the line.

## Humbeat specifics

**Engines (theme/assets, plain JS on window.HB; tested in Node by tools/testing/*_test.js, run by check.py):**
- `hb-music.js`: theory (scales, chords, voicing, snap, key detection), `HB.GROOVES` (drum strings: x hit, o ghost,
  r 32nd roll, t triplet), `HB.GENRES` (the 18 recipes: prog per section kind, parts `[role, name, inst, style, octave]`,
  form `[kind, bars, transition]`, levels = which roles play where), `HB.Doc.fromRecipe(genre, {seed, title, empty, key})`,
  `setProgression`, `starterPart`. Same seed = same song (demo songs are `{from_recipe, seed}` and are built here).
  `HB.syllables(word)` (vowel groups, digraphs kept, a stress guess) and `HB.melodyFromLyrics(doc, sectionId, {seed})`
  -> a notes pattern whose notes carry `w` (the syllable; the piano roll draws it).
- `hb-audio.js`: `HB.INSTRUMENTS` (26: kinds sub / fm / piano / organ / ks / b808 / choir), `HB.KITS` (10), per-track
  chain + buses, `scheduleRange` (patterns loop inside clips; swing moves odd 16ths; transitions generated at section ends),
  `HB.audio.play/stop/position/render/wav/wavMono/midi/previewNote/previewDrum`.
- `hb-voice.js`: `analyse` (YIN at 16 kHz, 10 ms hop, `an.offset` = half a window: always use it for frame times),
  `psola`, `targets` (auto-tune: retune speed -> smoothing tau), `process` (pitch, character via resample + PSOLA,
  harmonies, double), `humToNotes`, `beatboxToDrums`, mic (`openMic`, ScriptProcessor raw capture, `stopRecording`).
- `hb-studio.js`: `HB.Studio` owns the doc, selection, undo (JSON snapshots; `mutate(fn, liveKey)` coalesces slider
  drags), clipboard, takes (`st.takes[id] = {samples, sr}`; processed buffers cached by voice settings), the views
  (`mountArranger/Editor/Prompter/Readout`), hum/beatbox flow (`humStart/humStop/humResult/humPreview/humUse`), export.
  `st.melody(sectionId, seed, inst)` keeps one "Melody guide" track (role `guide`, one clip per section).
  `st.renderStems({from, to})` / `st.exportStems()`: `HB.audio.render(doc, {solo: trackId})` per track (fx bus off),
  `{fxOnly: true}` for transitions, plus the mix, zipped by `HB.zip` (stored, CRC32). flow.js checks the stems add up.
  Python talks through `st.cmd(name, json)` (the big switch) and hears `hooks.change(stateJson)` (60 ms throttle),
  `hooks.save(docJson)` (1.2 s after the last change), `hooks.saveTake(id, blob, sec) -> key`, `hooks.status`.
  Guests' takes go to IndexedDB (`HB.store`). `HB.Player` = a listen-only studio; `HB.previewGenre` plays a chorus.
- `hb-art.js`: `HB.art.cover({genre, seed, title, label})` -> SVG (motif per genre), `HB.art.Roller` (landing stack).

**Song document** (songs.doc): `{v, title, genre, seed, bpm, key (0-11), scale, swing, meter, sections[{id, kind, name,
bars, trans}], tracks[{id, name, role, kind: drums|notes|voice, inst, color 0-7, vol, pan, mute, solo, oct, fx{space, echo,
drive, low, high, punch, tone, wide, lofi}, voice{preset, tune, speed, pitch, character, harmony, double, robot}}],
clips[{id, track, start, len (beats), pat | take, offset (s), gain}], patterns{id: {kind, len, notes[{t,d,p,v,g}] |
hits[{t, lane, v}], name}}, takes{id: {sec, key | local}}, lyrics{sectionId: text}, progs{kind: {deg, ext}}, master, loop}`.

**Tables:** `songs` (owner, title, genre, doc, bpm, key_name, bars, seconds, tracks, cover_seed, share_key, shared,
featured, plays, created, updated, is_demo), `takes` (song, owner, take_id, audio WAV, seconds, key, created, is_demo).
Server: Songs.py (list/get/create/save/rename/delete/duplicate/share, get_shared, record_play, get_spotlight; others'
shared/featured/demo songs are readable but `can_edit` False = sandbox), Takes.py (save_take WAV only <= 13 MB, endpoint
`/_/api/take/<key>` with ranges, ETag, no-cache), Admin.py (admin_songs / admin_feature / admin_unshare).

**Python side:** `hb.py` = the only door to window.HB; `songs.py` = where songs live (guest doc in localStorage read with
json.loads, import_guest uploads IndexedDB takes); the Studio page lazily creates one Ribbon Form per tab
(`Ribbon/*Tab(page=self)`, each with `sync(state)`), redraws track headers only when `state.sig` changes, the lyrics pane
only when the section list changes. Dialogs read fresh state with `page.fresh()` (the change hook is throttled).

**Tests:** check.py runs voice_test.js (synthetic singing: YIN, hum, auto-tune within 0.02 semitone, pitch, character,
harmony, robot, beatbox) and engine_test.js (every genre builds a valid song, MIDI/WAV writers). ui_test.py's browser
has a fake microphone playing tools/testing/hum.wav (C D E G A G E D), so flow.js records a real take, hard-tunes it,
hums a melody into strings, uploads it on sign-up and streams it back. `window.HB_STUDIO` is the studio in tests.

**Gotchas found building it:**
- Absolutely positioned bits inside a horizontal scroller (an icon button's hidden label) escape it unless the scroller
  is `position: relative`: the phone page was 823 px wide. All scrollers here are positioned.
- A value from `UI.store` is a JS object proxy, not a dict: `isinstance(x, dict)` is False. Read JSON yourself.
- In phone emulation a too-wide page widens `innerWidth`: phone.js compares with `screen.width`.
- `.ar-lane` needs a role before an aria-label (axe); range inputs need 24 px height (target size).
- Riso covers: heavy capitals are ~0.66 em wide; long lines get `textLength` so titles never run off the cover.
- Recording latency: the take's offset = beat-0 time - first sample time + output/base latency + 12 ms + Timing fix.
  Not verified on real hardware yet: if takes land late, raise the default.
- Not tested on a real iPhone (Web Audio + ScriptProcessor + getUserMedia should work on Safari 17+).

## Recipes

- **New table or column:** `db_schema` in anvil.yaml (same shape as the existing tables, `client: none`), then add it
  to server tests. Deploy, then the Schema Mismatch step. Personal data -> the legal kit (below).
- **New server function:** in a server module + tests in tools/testing/test_server.py (happy path, bad input,
  someone not allowed; public ones in `PUBLIC`).
- **Demo content:** DemoData.py (`is_demo=True`, `DEMO_TABLES`, children first).
- **Restyle:** tokens at the top of app.css (light and dark blocks), fonts in head_html, the spinner in theme.css
  (`python -I APP_MAKER/tools/loaders.py apply humbeat <preset>`), `LEGAL_THEME` in startup.py.
- **Icon:** edit theme/assets/icon.svg, `python -I tools/make_icons.py`, then `python tools/assets.py`.

## Gotchas

- The local App Server (1.18) lags hosted Anvil: no `HtmlComponent.attrs` (use state.set_attr), `Notification(role=)`
  raises (state.toast falls back), notifications are `.anvil-alert[data-notify]`, components are wrapped in
  `<anvil-dropzone>` (app.css: `display: contents`). app.css styles both. Test on hosted Anvil too for big changes.
- Anvil's alert() without `large=True` is a 300 px modal: our role `app-dialog` widens it.
- Headless Chrome: Anvil's service worker breaks reused profiles (drive.mjs bypasses it); phone width needs device
  emulation (`MOBILE=390,844`), windows can't go below ~500 px.
- `require_secure_passwords` rejects leaked passwords: tests use random ones.
- Heredocs in the Bash tool mangle quotes: write files with the Write tool.
- A script's `el.focus()` doesn't always match `:focus-visible`, so tests check focus rings through the CSS rules,
  not computed styles. Never put `outline: none` on `input:focus` without `:not([type=checkbox]):not([type=radio])`.
- Never write Anvil's theme-colour token pattern (percent, `color:`, name, percent) in theme.css.

## Privacy & Terms (legal kit)

From `C:/Users/arkvi/Documents/CLAUDE/APP_MAKER/legal-kit`: change `apps/humbeat.json`, then there
`python -I build.py humbeat && python -I install.py humbeat` (writes theme/assets/legal-kit.js,
client_code/legal.py, server_code/legal_server.py and the head_html tag), then `python tools/assets.py` and deploy.
Sign-up keeps the tick box (`legal.consent_field()` in Pages/Auth). Feedback = Prepsto only ("Submit feedback").
- Client and server modules share ONE Python package: a server module can't have the same name as a client
  package or module (server `Items.py` + client `Items/` = "Cannot resolve imported module"). The template's example
  server module is `ExampleItems.py` for that reason.
