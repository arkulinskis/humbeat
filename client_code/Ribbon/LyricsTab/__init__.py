import json

from anvil import *

from ._anvil_designer import LyricsTabTemplate
from ... import hb, rb, state


class LyricsTab(LyricsTabTemplate):
    """Lyrics: the words pane, the prompter, a rhyme finder and song starters for this style."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.words_panel.add_event_handler("x-word", self._copy)
        self.ideas_panel.add_event_handler("x-word", self._copy)
        self._genre = None
        self.words_note.text = "Type a word and press Rhymes. Press a rhyme to copy it."
        self.sound_drop.items = [("Soft flute", "flute"), ("Synth lead", "lead"), ("Piano", "piano"), ("Choir \"aah\"", "choir"), ("Bells", "bell")]
        self.seeds: dict = {}
        self._secsig = ""
        self.melody_note.text = "Turns a section's words into a tune to sing along with (a Melody guide track)."

    def sync(self, s):
        rb.toggle(self.pane_button, self.page.side_on, rb.BIG + ["ic-text"])
        rb.toggle(self.prompter_button, s.get("prompter"), rb.BIG + ["ic-mic"])
        secs = [x for x in s.get("sections") or [] if x.get("words")]
        sig = "|".join(x["id"] + x["name"] for x in secs)
        if sig != self._secsig:
            self._secsig = sig
            cur = self.sec_drop.selected_value
            self.sec_drop.items = [(x["name"], x["id"]) for x in secs] or [("No words yet", "")]
            ids = [x["id"] for x in secs]
            self.sec_drop.selected_value = cur if cur in ids else (ids[0] if ids else "")
        has = bool(secs) and bool(s.get("editable"))
        for c in (self.sec_drop, self.sound_drop, self.melody_button, self.again_button):
            c.enabled = has
        if s.get("genre") != self._genre:
            self._genre = s.get("genre")
            self.ideas_panel.items = [{"text": t} for t in hb.genre(self._genre).get("starters", [])]

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.word_box, "aria-label", "Word to rhyme")
        state.set_control_attr(self.sec_drop, "aria-label", "Section to make a melody for")
        state.set_control_attr(self.sound_drop, "aria-label", "Sound of the melody guide")

    def _find(self, kind):
        w = (self.word_box.text or "").strip().split(" ")[-1]
        if not w:
            self.words_note.text = "Type a word first."
            return
        found = hb.rhymes(w, kind)
        if found is None:
            self.words_panel.items = []
            self.words_note.text = "Rhymes need an internet connection (they come from Datamuse)."
            return
        self.words_panel.items = [{"text": x} for x in found[:24]]
        self.words_note.text = ("%s for \"%s\". Press one to copy it." % (state.plural(len(found[:24]), "word"), w)) if found else "No rhymes found for \"%s\". Try Near rhymes." % w

    @handle("word_box", "pressed_enter")
    def word_box_pressed_enter(self, **event_args):
        self._find("rel_rhy")

    @handle("rhyme_button", "click")
    def rhyme_button_click(self, **event_args):
        self._find("rel_rhy")

    @handle("near_button", "click")
    def near_button_click(self, **event_args):
        self._find("rel_nry")

    def _copy(self, text=None, **event_args):
        from anvil.js import window
        try:
            window.navigator.clipboard.writeText(str(text or ""))
            state.toast("Copied \"%s\"" % text, "ok")
        except Exception:
            state.toast(text)

    def _melody(self, step):
        sid = self.sec_drop.selected_value
        if not sid:
            return
        self.seeds[sid] = max(1, self.seeds.get(sid, 0) + step)  # "Another idea" moves to the next seed
        r = json.loads(self.page.cmd("melody", id=sid, seed=self.seeds[sid], inst=self.sound_drop.selected_value) or "{}")
        if r.get("ok"):
            self.melody_note.text = "%s: %s over %s lines, starting %s. Edit the notes in the piano roll; each one shows its syllable." % (
                r["section"], state.plural(r["notes"], "note"), r["lines"], r["first"])
        else:
            self.melody_note.text = r.get("error") or "No melody this time."

    @handle("melody_button", "click")
    def melody_button_click(self, **event_args):
        self._melody(0)

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        self._melody(1)

    @handle("pane_button", "click")
    def pane_button_click(self, **event_args):
        self.page.toggle_side()

    @handle("prompter_button", "click")
    def prompter_button_click(self, **event_args):
        self.page.cmd("prompter")
