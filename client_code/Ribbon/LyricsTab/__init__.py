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

    def sync(self, s):
        rb.toggle(self.pane_button, self.page.side_on, rb.BIG + ["ic-text"])
        rb.toggle(self.prompter_button, s.get("prompter"), rb.BIG + ["ic-mic"])
        if s.get("genre") != self._genre:
            self._genre = s.get("genre")
            self.ideas_panel.items = [{"text": t} for t in hb.genre(self._genre).get("starters", [])]

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.word_box, "aria-label", "Word to rhyme")

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

    @handle("pane_button", "click")
    def pane_button_click(self, **event_args):
        self.page.toggle_side()

    @handle("prompter_button", "click")
    def prompter_button_click(self, **event_args):
        self.page.cmd("prompter")
