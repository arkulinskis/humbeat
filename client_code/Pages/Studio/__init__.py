import json

import anvil.js
import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import StudioTemplate
from ... import hb, router, songs, state

TABS = ["file", "home", "insert", "record", "voice", "instrument", "effects", "song", "lyrics", "mix"]
LENS = [("Part: 1 bar", 4), ("Part: 2 bars", 8), ("Part: 4 bars", 16), ("Part: 8 bars", 32), ("Part: 16 bars", 64)]


def _tab_form(name):
    if name == "file":
        from ...Ribbon.FileTab import FileTab
        return FileTab
    if name == "insert":
        from ...Ribbon.InsertTab import InsertTab
        return InsertTab
    if name == "record":
        from ...Ribbon.RecordTab import RecordTab
        return RecordTab
    if name == "voice":
        from ...Ribbon.VoiceTab import VoiceTab
        return VoiceTab
    if name == "instrument":
        from ...Ribbon.InstrumentTab import InstrumentTab
        return InstrumentTab
    if name == "effects":
        from ...Ribbon.EffectsTab import EffectsTab
        return EffectsTab
    if name == "song":
        from ...Ribbon.SongTab import SongTab
        return SongTab
    if name == "lyrics":
        from ...Ribbon.LyricsTab import LyricsTab
        return LyricsTab
    if name == "mix":
        from ...Ribbon.MixTab import MixTab
        return MixTab
    from ...Ribbon.HomeTab import HomeTab
    return HomeTab


class Studio(StudioTemplate):
    """#studio/<song id> (members), #studio (a visitor's song in this browser), #studio/new/<style>.

    The song lives in the JS studio (hb-studio.js): it draws the timeline and the clip editor and makes every sound.
    This page is the Word-style ribbon (one Form per tab, made the first time it is opened), the track headers
    (a RepeatingPanel), the clip editor's toolbar, the lyrics pane, and saving: the studio calls save(doc) 1.2 s after
    the last change; members' songs go to the server, a visitor's to this browser. Someone else's shared or demo song
    opens as a sandbox: everything works, nothing is saved, "Make it mine" keeps a copy."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.args = list(args)
        self.st = hb.NULL
        self.s: dict = {}
        self.song: dict = {}
        self.doc: dict = {}
        self.song_id = None
        self.can_edit = False
        self.guest = not state.me()
        self.side_on = bool(state.store_get("side", True))
        self.tabs: dict = {}
        self.tab = state.store_get("rbtab", "home")
        if self.tab not in TABS:
            self.tab = "home"
        self._sig = ""
        self._lysig = ""
        self._edsig = ""
        self._mounted = False
        self.heads_panel.add_event_handler("x-track", self._track)
        self.lyrics_panel.add_event_handler("x-lyrics", self._lyrics)
        self.lyrics_panel.add_event_handler("x-melody", self._melody)
        self.mel_seeds: dict = {}
        self.len_drop.items = LENS
        self.studio_box.visible = False
        self.missing.visible = False
        self.banner.visible = False
        self.status_label.visible = False
        self._flush = anvil.js.report_exceptions(self._pagehide)
        self._load()

    # ------------------------------------------------------------ loading
    def _load(self):
        a = self.args
        if a and a[0] == "new":
            gid = a[1] if len(a) > 1 else "hopecore"
            if self.guest and songs.guest_doc() and not confirm(
                    "Visitors keep one song in this browser. Start a new %s song instead? (Sign up to keep as many as you like.)" % hb.genre(gid)["name"],
                    title="Replace your song?", buttons=[("Keep my song", False), ("Start a new one", True)], role="app-dialog"):
                router.replace("studio")
                return self._open_guest()
            addr = songs.new_song(gid, None)
            if not addr:
                return self._missing("The song couldn't be made.")
            router.replace(*addr)
            if len(addr) > 1:
                return self._open_member(addr[1])
            return self._open_guest()
        if a:
            return self._open_member(a[0])
        if self.guest:
            return self._open_guest()
        d = anvil.server.call("list_songs")
        if d["songs"]:
            router.replace("studio", d["songs"][0]["id"])
            return self._open_member(d["songs"][0]["id"])
        addr = songs.new_song("hopecore", "My first song")
        if addr and len(addr) > 1:
            router.replace(*addr)
            return self._open_member(addr[1])
        return self._missing("The song couldn't be made.")

    def _open_guest(self):
        doc = songs.guest_doc()
        if not doc:
            doc = hb.new_doc("hopecore", "My first song")
            songs.save_guest(json.dumps(doc))
        self.can_edit = True
        self.song = {"title": doc.get("title"), "genre": doc.get("genre")}
        self._ready(doc)

    def _open_member(self, sid):
        r = anvil.server.call("get_song", sid)
        if not r.get("ok"):
            return self._missing(r.get("error") or "")
        song = r["song"]
        self.song = song
        self.song_id = song["id"]
        self.can_edit = bool(song.get("can_edit"))
        doc = hb.doc_from(song.get("doc"))
        doc["takes"] = dict(doc.get("takes") or {})
        for tid, t in (song.get("takes") or {}).items():
            doc["takes"][tid] = dict(doc["takes"].get(tid) or {}, key=t["key"], sec=t["sec"])
        self._ready(doc)

    def _missing(self, why):
        self.missing.visible = True
        self.studio_box.visible = False
        self.missing_label.text = why or "It may have been deleted, or it's private."

    def _ready(self, doc):
        self.doc = doc
        self.studio_box.visible = True
        self.side.visible = self.side_on
        self.work.classes["no-side"] = not self.side_on
        self.title_box.text = doc.get("title") or ""
        if self.guest:
            self._banner("You're working as a visitor: this song is kept in this browser only. Create a free account to keep it safe, share it and make more.",
                         "Create a free account")
        elif not self.can_edit:
            self._banner('You\'re trying out "%s" by %s. Play with it freely; changes aren\'t saved.' % (self.song.get("title"), self.song.get("by") or "someone"),
                         "Make it mine")
        self.save_label.text = "Saved" if not self.guest and self.can_edit else ("Kept in this browser" if self.guest else "Not saved")

    def _banner(self, text, button):
        self.banner.visible = True
        self.banner_label.text = text
        self.banner_button.text = button

    @handle("", "show")
    def form_show(self, **event_args):
        if self.doc and not self._mounted:
            self._mounted = True
            hooks = {"change": self._changed, "save": self._save, "saveTake": self._save_take, "status": self._status, "recorded": self._recorded}
            api = anvil.server.get_api_origin()
            self.st = hb.studio(self.doc, True, self.guest, api, hooks)
            self.st.mountReadout(self.dom_nodes["time_node"], self.dom_nodes["meter_node"])
            self.st.mountArranger(self.dom_nodes["arr_node"])
            self.st.mountEditor(self.dom_nodes["ed_node"])
            self.st.mountPrompter(self.dom_nodes["prompter_node"])
            window.addEventListener("pagehide", self._flush)
            self.show_tab(self.tab)
            self._changed(self.st.stateJson())
            window.HB_STUDIO = self.st  # tests reach the studio here

    def leave(self):
        """The router calls this before another page opens: save now, let go of the microphone and the sound."""
        if self.st is not None:
            window.removeEventListener("pagehide", self._flush)
            self.st.destroy()
            self.st = hb.NULL
            window.HB_STUDIO = None

    def _pagehide(self, event=None):
        if self.st is not None:
            self.st.flush()

    # ------------------------------------------------------------ hooks from the studio
    def _changed(self, text, *a):
        self.s = json.loads(text)
        self.sync()

    def fresh(self):
        """The studio's state right now (dialogs that change things and redraw at once)."""
        if self.st is not None:
            self.s = json.loads(self.st.stateJson())
        return self.s

    def _save(self, doc_json, *a):
        if self.guest:
            songs.save_guest(doc_json)
            self.save_label.text = "Kept in this browser"
            return
        if not self.can_edit or not self.song_id:
            return
        self.save_label.text = "Saving..."
        r = anvil.server.call_s("save_song", self.song_id, doc_json)
        if isinstance(r, dict) and r.get("ok"):
            self.save_label.text = "Saved"
        else:
            self.save_label.text = "Not saved"
            state.toast((r or {}).get("error") or "The song couldn't be saved.", "error")

    def _save_take(self, take_id, blob, seconds, *a):
        if self.guest or not self.can_edit or not self.song_id:
            return None
        return songs.upload_take(self.song_id, take_id, blob, seconds)

    def _status(self, text, kind="", *a):
        self.status_label.text = text or ""
        self.status_label.visible = bool(text)
        self.status_label.role = ["st-status"] + (["st-status-" + kind] if kind else [])

    def _recorded(self, kind, *a):
        pass

    # ------------------------------------------------------------ for the ribbon tabs and dialogs
    def cmd(self, name, **args):
        if self.st is None:
            return ""
        return self.st.cmd(name, json.dumps(args)) or ""

    def status(self, text):
        self._status(text, "")

    def sync(self):
        s = self.s
        playing = s.get("mode") in ("play", "rec")
        self.play_button.text = "Stop" if playing else "Play"
        self.play_button.role = ["btn", "btn-primary", "ic-stop" if playing else "ic-play", "st-play"]
        rec = s.get("mode") == "rec"
        self.rec_button.text = "Stop recording" if rec else "Record"
        self.rec_button.role = ["btn", "ic-rec", "st-rec"] + (["on"] if rec else [])
        state.set_control_attr(self.rec_button, "aria-pressed", "true" if rec else "false")
        self.studio_box.classes["is-rec"] = rec
        self.studio_box.classes["is-playing"] = playing
        if s.get("title") is not None:
            try:
                typing_now = window.document.activeElement == state.control(self.title_box)
            except Exception:
                typing_now = False
            if not typing_now and self.title_box.text != s["title"]:
                self.title_box.text = s["title"]
        tab = self.tabs.get(self.tab)
        if tab is not None:
            tab.sync(s)
        if s.get("sig") != self._sig:
            key = state.focus_key()
            self._sig = s.get("sig")
            self.heads_panel.items = s.get("tracks") or []
            state.refocus(self.heads_panel, key)
        self._sync_editor(s)
        self._sync_lyrics(s)

    def _sync_editor(self, s):
        c = s.get("clip")
        kind = (c or {}).get("kind")
        sig = json.dumps([c, s.get("editable")])
        if sig == self._edsig:
            return
        self._edsig = sig
        self.ed_tools.visible = bool(c)
        self.ed_help.visible = kind in ("notes", "drums")
        if not c:
            self.ed_name.text = "Clip editor"
            self.ed_info.text = "Select a clip in the timeline"
            return
        tr = s.get("track") or {}
        self.ed_name.text = "%s · %s" % (tr.get("name") or "Track", c.get("name") or "Part")
        bits = ["bar %d" % (int(c["start"] // 4) + 1), state.plural(int(round(c["bars"])) if c["bars"] >= 1 else 1, "bar")]
        if c.get("linked", 0) > 1:
            bits.append("linked to %d clips: edits change all of them" % c["linked"])
        self.ed_info.text = " · ".join(bits)
        self.notes_tools.visible = kind == "notes"
        self.part_tools.visible = kind in ("notes", "drums")
        self.voice_tools.visible = kind == "voice"
        self.unique_button.visible = c.get("linked", 0) > 1
        self.gain_slider.set_quiet(c.get("gain") if c.get("gain") is not None else 1)
        lens = [v for _, v in LENS]
        pl = int(c.get("patLen") or 0)
        if pl and pl not in lens:
            self.len_drop.items = LENS + [("Part: %s" % state.plural(max(1, pl // 4), "bar"), pl)]
        else:
            self.len_drop.items = LENS
        if pl:
            self.len_drop.selected_value = pl
        if kind == "voice":
            self.ed_info.text = " · ".join(bits[:2]) + " · the thin line is what you sang, the thick line what you hear"
        if kind == "drums":
            self.ed_help_text = True
        ed = bool(s.get("editable"))
        for b in (self.semi_down, self.semi_up, self.oct_down, self.oct_up, self.snap_button, self.quant_button, self.unique_button,
                  self.clear_button, self.del_button, self.len_drop):
            b.enabled = ed

    def _sync_lyrics(self, s):
        sig = json.dumps([[x["id"], x["name"], x["bars"]] for x in s.get("sections") or []])
        if sig == self._lysig or self.st is None:
            return
        self._lysig = sig
        words = hb.py(self.st.doc.lyrics) or {}
        self.lyrics_panel.items = [{"id": x["id"], "name": x["name"], "bars": x["bars"], "text": words.get(x["id"], "")} for x in s.get("sections") or []]

    # ------------------------------------------------------------ ribbon tabs
    def tab_click(self, event):
        self.show_tab(event.currentTarget.getAttribute("data-tab"))

    def show_tab(self, name):
        if name not in TABS:
            name = "home"
        self.tab = name
        state.store_set("rbtab", name)
        if name not in self.tabs:
            form = _tab_form(name)(page=self)
            self.tabs[name] = form
            self.ribbon_host.add_component(form)
        for key, form in self.tabs.items():
            form.visible = key == name
        for key in TABS:
            node = getattr(self, "tab_" + key)
            node.classes["on"] = key == name
            state.set_attr(node, "aria-selected", "true" if key == name else "false")
            state.set_attr(node, "tabindex", "0" if key == name else "-1")
        state.set_attr(self.panel_box, "aria-labelledby", "rbt-" + name)
        if self.s:
            self.tabs[name].sync(self.s)

    def toggle_side(self):
        self.side_on = not self.side_on
        state.store_set("side", self.side_on)
        self.side.visible = self.side_on
        self.work.classes["no-side"] = not self.side_on
        self.sync()

    # ------------------------------------------------------------ actions
    @handle("title_box", "lost_focus")
    def title_box_lost_focus(self, **event_args):
        t = (self.title_box.text or "").strip()
        if t and t != self.s.get("title"):
            self.cmd("title", title=t)

    @handle("title_box", "pressed_enter")
    def title_box_pressed_enter(self, **event_args):
        self.title_box_lost_focus()

    @handle("play_button", "click")
    def play_button_click(self, **event_args):
        self.cmd("play")

    @handle("rec_button", "click")
    def rec_button_click(self, **event_args):
        self.cmd("record")

    @handle("banner_button", "click")
    def banner_button_click(self, **event_args):
        if self.guest:
            if self.st is not None:
                self.st.flush()
            router.remember_after("#home")
            router.go("auth", "signup")
        else:
            self.save_copy()

    @handle("add_track_button", "click")
    def add_track_button_click(self, **event_args):
        self.pick_instrument("notes")

    @handle("side_close", "click")
    def side_close_click(self, **event_args):
        self.toggle_side()

    def _track(self, action=None, id=None, value=None, **event_args):
        key = state.focus_key()
        if action == "select":
            self.cmd("selecttrack", id=id)
        elif action == "mute":
            self.cmd("track", id=id, mute=value)
        elif action == "solo":
            self.cmd("track", id=id, solo=value)
        elif action == "vol":
            self.cmd("track", id=id, vol=value)
            return
        self.fresh()
        self.sync()
        state.refocus(self.heads_panel, key)

    def _lyrics(self, id=None, text="", **event_args):
        self.cmd("lyrics", id=id, text=text)

    def _melody(self, id=None, **event_args):
        self.mel_seeds[id] = self.mel_seeds.get(id, 0) + 1
        r = json.loads(self.cmd("melody", id=id, seed=self.mel_seeds[id]) or "{}")
        if r.get("ok"):
            self.status("A melody for %s: %s over %s lines. Press it again for another idea; edit it in the piano roll." % (r["section"], state.plural(r["notes"], "note"), r["lines"]))
        else:
            state.toast(r.get("error") or "No melody this time.", "error")

    # clip editor bar
    @handle("semi_down", "click")
    def semi_down_click(self, **event_args):
        self.cmd("transpose", semi=-1)

    @handle("semi_up", "click")
    def semi_up_click(self, **event_args):
        self.cmd("transpose", semi=1)

    @handle("oct_down", "click")
    def oct_down_click(self, **event_args):
        self.cmd("transpose", semi=-12)

    @handle("oct_up", "click")
    def oct_up_click(self, **event_args):
        self.cmd("transpose", semi=12)

    @handle("snap_button", "click")
    def snap_button_click(self, **event_args):
        self.cmd("snapkey")

    @handle("quant_button", "click")
    def quant_button_click(self, **event_args):
        self.cmd("quantize", grid=0.25)

    @handle("len_drop", "change")
    def len_drop_change(self, **event_args):
        self.cmd("patlen", beats=self.len_drop.selected_value)

    @handle("unique_button", "click")
    def unique_button_click(self, **event_args):
        self.cmd("unique")

    @handle("clear_button", "click")
    def clear_button_click(self, **event_args):
        self.cmd("clear")

    @handle("del_button", "click")
    def del_button_click(self, **event_args):
        self.cmd("delete")

    @handle("gain_slider", "change")
    def gain_slider_change(self, value, final, **event_args):
        self.cmd("clipgain", value=value)

    # dialogs and song-level actions
    def pick_instrument(self, kind):
        from ...Dialogs.PickInstrument import PickInstrument
        inst = alert(PickInstrument(kind=kind), buttons=[], large=True, role="app-dialog")
        if inst:
            self.cmd("addtrack", kind=kind, inst=inst)
            self.status("Track added. Insert > Starter part fills it in this song's style, or double-click its lane to draw your own part.")

    def open_hum(self, kind):
        from ...Dialogs.Hum import Hum
        if self.st is None:
            return
        if self.s.get("mode") != "idle":
            self.cmd("stop")
        alert(Hum(page=self, kind=kind), buttons=[], large=True, role="app-dialog")
        self.fresh()
        self.sync()

    def open_sections(self):
        from ...Dialogs.Sections import Sections
        alert(Sections(page=self), buttons=[], large=True, role="app-dialog")
        self.fresh()
        self.sync()

    def open_chords(self):
        from ...Dialogs.Chords import Chords
        alert(Chords(page=self), buttons=[], large=True, role="app-dialog")
        self.fresh()
        self.sync()

    def share(self):
        if self.guest or not self.can_edit or not self.song_id:
            state.toast("Sign up (free) to share your songs with a link.", "error")
            return
        from ...Dialogs.Share import Share
        if self.st is not None:
            self.st.flush()
        alert(Share(song_id=self.song_id), buttons=[], role="app-dialog")

    def new_song(self):
        from ...Dialogs.NewSong import NewSong
        r = alert(NewSong(), buttons=[], large=True, role="app-dialog")
        if not r:
            return
        if self.guest and not confirm("Visitors keep one song in this browser: the new one replaces this one. Sign up to keep both.",
                                      title="Replace your song?", buttons=[("Cancel", False), ("Replace it", True)], role="app-dialog"):
            return
        if self.st is not None:
            self.st.flush()
        addr = songs.new_song(r["genre"], r["title"], r["empty"])
        if addr:
            router.go(*addr)

    def save_copy(self):
        if self.guest:
            if self.st is not None:
                self.st.flush()
            router.remember_after("#home")
            state.toast("Create a free account: this song moves into it.")
            router.go("auth", "signup")
            return
        if self.st is None or not self.song_id:
            return
        r = state.call("duplicate_song", self.song_id, str(window.JSON.stringify(self.st.doc)))
        if r:
            state.toast("Saved as \"%s\" in your songs." % r["song"]["title"], "ok")
            router.go("studio", r["song"]["id"])

    def delete_song(self):
        if not self.can_edit or not self.song_id:
            return
        if confirm("The song and its recordings are deleted for good.", title="Delete this song?",
                   buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
            if state.call("delete_song", self.song_id) is not None:
                if self.st is not None:
                    self.st.destroy()
                    self.st = hb.NULL
                state.toast("Deleted.", "ok")
                router.go("home")

    def test_mic(self):
        try:
            hb.HB.voice.openMic()
            self.status("Microphone on. Sing a little and watch the meter next to the time (top right).")
        except Exception as e:
            state.toast("No microphone: %s" % e, "error")
