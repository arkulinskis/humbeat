# Humbeat

Make any song in your browser. Pick a style (millennial hopecore, mumble rap, heavy metal, 80s dance pop, Y2K teen pop,
storyteller pop and 12 more) and a full arrangement plays straight away; record your own voice with auto-tune and a voice
menu; hum a melody and it becomes notes for any instrument; beatbox and it becomes a drum part; shape it all with a
ribbon like a word processor's (File, Home, Insert, Record, Voice, Instrument, Effects, Song, Lyrics, Mix). Built on
[Anvil](https://anvil.works) as native Anvil Forms; every sound is synthesised in the browser (no samples).

- **App repo:** github.com/arkulinskis/humbeat (branch `master`). Anvil pulls `master`.
- **Live:** not published yet (planned https://humbeat.anvil.app)

## What it does

**Styles (18 genre recipes, `theme/assets/hb-music.js`)**: Millennial Hopecore, Mumble Rap, Heavy Metal, 80s Dance Pop,
Y2K Teen Pop, Storyteller Pop, Lo-fi Hip Hop, House, Synthwave, Reggaeton, Pop Punk, Drill, Afrobeats, Piano Ballad, Future
Bass, Hyperpop, Disco Funk, Boom Bap. Each has a tempo, key and scale, swing, a drum groove at three intensities, chord
progressions per section, bass / chord / hook styles, instruments, a vocal preset, a song form with transitions, which
parts play in which section, starter lyrics, song-starter ideas, and a plain-words "what makes this style" sheet.

**The studio (`#studio`)**
- Timeline: a sections bar (click to jump), a bar ruler (click to seek), one lane per track with clips (drag to move,
  right edge to resize, left edge trims a recording, double-click an empty lane for a new part), playhead, loop.
- Track headers: colour, name, instrument, Mute, Solo, volume.
- Clip editor: piano roll (click to add, drag to move / lengthen, double- or right-click to delete, key notes shaded,
  preview sounds), drum grid (8 lanes, click / drag to paint, Shift for ghost notes), voice view (waveform + the pitch you
  sang + the corrected pitch you hear). Transpose, octave, quantize, snap to key, part length, make unique, clear.
- Linked parts: every chorus can share one part; editing it changes all of them (× N on the clip).
- Ribbon: **File** (new, your songs, save a copy / make it mine, share link, WAV, MIDI, clean up recordings, delete),
  **Home** (play, record, to start, loop section, click, clipboard, undo / redo, tempo + tap, key, scale, zoom, follow,
  lyrics pane), **Insert** (instrument / drum / voice tracks, starter part in the song's style, empty clip, sections,
  hum a melody, beatbox a beat), **Record** (record voice, hum, beatbox, count-in, click, lyrics prompter, mic test,
  timing fix), **Voice** (19 presets, auto-tune amount + retune speed, pitch, character, harmony, double, reverb, echo),
  **Instrument** (26 synthesised instruments in 8 families, 10 drum kits, octave, hear it), **Effects** (reverb, echo,
  drive, warmth, air, punch, tone, wide, lo-fi + 8 presets), **Song** (style + restyle, sections dialog, chords dialog,
  section length + transition, swing), **Lyrics** (pane, prompter, Datamuse rhymes / near rhymes, song starters),
  **Mix** (auto-mix, track volume / pan, master, unmute / clear solo, export).
- Keyboard: Space, R, Ctrl+Z / Shift+Z / Y, Ctrl+C / X / V / D, Delete, + / -, Home.
- Lyrics pane: words per section with a syllable count per line; the prompter shows the current line while you record.
- Export: WAV (offline render of the whole mix) and MIDI (every instrument part, General MIDI drums).

**Voice (`theme/assets/hb-voice.js`)**: raw-sample recorder (aligned to the beat, stored as 32 kHz WAV), YIN pitch
tracking, TD-PSOLA pitch shifting: auto-tune with retune speed (0 = the hard trap snap), robot monotone, pitch,
character (formants), harmonies a third / fifth / sixth / octave in the scale or a 3-voice choir, doubling.
**Hum to notes**: notes, timing on a grid, key snapping, folding into the instrument's range, key detection.
**Beatbox to drums**: onsets classified into kick / snare / hat.

**Sound (`theme/assets/hb-audio.js`)**: subtractive, FM, additive piano / organ, Karplus-Strong guitars and bass, 808 with
glides, choir formants; drum kits (acoustic, rock, metal, 808 trap, 909 house, gated 80s, pop, lo-fi, brushes, afro);
per-track chain (drive, tone, EQ, compressor, chorus, crusher, pan, volume, sends) + reverb and tempo-synced echo buses +
limiter; transitions between sections (drum fill, snare build, riser, filter sweep, reverse cymbal, beat drop, impact).

**Songs (`#home`)**: your songs as riso-print covers (open, share, copy, delete), New song (pick and hear a style, full
starter song or just a beat), moving a visitor's song (with its recordings) into the account, the spotlight of shared songs.

**Visitors** use the studio without an account: one song kept in the browser (localStorage + IndexedDB for recordings).

**Sharing (`#listen/<key>`)**: a public listen page that plays the song live with its recordings and the words of each
section; plays are counted. Others can open it in the studio as a sandbox and keep a copy.

**Styles (`#styles/<id>`)** and **Learn (`#learn`)**: the ingredients of every style with its chorus to hear, and a
production guide (tracks, tempo / key / scale, chords, drums, bass, hooks, recording, auto-tune, effects, structure and
transitions, lyrics, mixing, shortcuts).

**Admin**: overview (people, songs, shared songs, recordings), Songs (spotlight on/off, stop sharing = moderation),
users, demo data (10 fictional shared songs built from recipes), older feedback. Feedback goes to Prepsto (`hyng2w2`).

## Setting it up in Anvil (once)

1. Anvil editor: **Create app → Clone from GitHub**, paste `https://github.com/arkulinskis/humbeat`.
2. Check the **Users** service (email + password, Continue with Google, sign-up on).
3. Accept the **Schema Mismatch** alert with **"The schema of the source code is correct"** (tables songs, takes).
4. Run it, sign up with the admin email first, then **Publish**.

<!-- libraries:start -->
## Libraries and outside services

What this project uses besides its own code. Generated by `APP_MAKER/tools/libraries.py`; to change it, edit `APP_MAKER/libraries/catalog.py` and re-run the script.

| Name | How it gets in | Used here for |
|---|---|---|
| [Google Fonts](https://fonts.google.com) | Loaded from a CDN | Darker Grotesque, Instrument Sans, JetBrains Mono |

**Built into the browser:** Canvas 2D, Web Audio API, Camera, microphone and screen, localStorage, Clipboard, File downloads (Blob), IndexedDB.

**Anvil platform:** Anvil, Anvil Data Tables, Anvil JS bridge (anvil.js), Anvil Users, Anvil Google service.

**Build and test tools (not shipped):** axe-core, Node.js, PyYAML, Headless Chrome (DevTools Protocol).

<!-- libraries:end -->

## Working on it

See `.claude/skills/humbeat/SKILL.md`. In short:

```
python tools/check.py                    # validator, JS syntax, engine tests (voice + songs), asset hashes, server tests
python -I tools/ui_test.py               # the real app in the Anvil App Server (Docker) driven by headless Chrome
python -I tools/ui_test.py --shots DIR   # + screenshots of every page (desktop/phone, light/dark, guest/member)
git push origin master                   # deploy
```

## Project layout

```
client_code/    startup, router, state, auth, legal, hb (the engines' Python face), songs (where songs live), rb (ribbon helpers)
                Layouts/Shell; Pages/ Landing Auth Home Studio Styles Learn Listen Profile Admin
                Ribbon/ FileTab HomeTab InsertTab RecordTab VoiceTab InstrumentTab EffectsTab SongTab LyricsTab MixTab
                Components/ Cover CoverRoll Slider;  Dialogs/ NewSong PickInstrument Hum Sections Chords Share
                Items/ SongCard StyleTile StyleCard TrackHead LyricBlock InstTile PresetTile WordChip ProgChip SectionRow AdminSongRow ...
server_code/    Songs.py, Takes.py (recordings + /_/api/take/<key>), DemoData.py, Admin.py, Accounts.py, Feedback.py, common.py, ...
theme/assets/   hb-music.js (theory, genres), hb-audio.js (synths, scheduler, export), hb-voice.js (recording, pitch, hum),
                hb-studio.js (the studio + its views), hb-art.js (covers, hero), app.css, app-kit.js, theme.css, icons
tools/          check.py, ui_test.py + ui/*.js, testing/ (test_server.py, voice_test.js, engine_test.js, hum.wav), live/drive.mjs
```
