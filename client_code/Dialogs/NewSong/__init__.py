from anvil import *

from ._anvil_designer import NewSongTemplate
from ... import hb, state


class NewSong(NewSongTemplate):
    """Pick a style (hear it first), a name, and full starter song or just a beat. Closes with
    {genre, title, empty} or None."""

    def __init__(self, genre="hopecore", **properties):
        super().__init__(**properties)
        self.genre = genre
        self.empty = False
        self.playing = None
        self.styles_panel.add_event_handler("x-pick", self._pick)
        self.styles_panel.add_event_handler("x-hear", self._hear)
        state.set_control_attr(self.title_box, "autocomplete", "off")
        self._draw()

    def _draw(self):
        g = hb.genre(self.genre)
        self.pick_label.text = g["blurb"]
        self.styles_panel.items = [{"id": x["id"], "name": x["name"], "era": x["era"], "bpm": x["bpm"], "i": i, "sel": x["id"] == self.genre,
                                    "playing": x["id"] == self.playing} for i, x in enumerate(hb.genres())]
        self.full_button.role = ["seg"] + ([] if self.empty else ["on"])
        self.beat_button.role = ["seg"] + (["on"] if self.empty else [])
        state.set_control_attr(self.full_button, "aria-pressed", "false" if self.empty else "true")
        state.set_control_attr(self.beat_button, "aria-pressed", "true" if self.empty else "false")

    def _pick(self, gid=None, **event_args):
        key = state.focus_key()
        self.genre = gid
        self._draw()
        state.refocus(self.styles_panel, key)

    def _hear(self, gid=None, **event_args):
        key = state.focus_key()
        self.genre = gid
        self.playing = gid if hb.preview_genre(gid, self._ended) else None
        self._draw()
        state.refocus(self.styles_panel, key)

    def _ended(self, gid=None, *a):
        if not gid and self.playing:
            self.playing = None
            self._draw()

    @handle("full_button", "click")
    def full_button_click(self, **event_args):
        self.empty = False
        self._draw()

    @handle("beat_button", "click")
    def beat_button_click(self, **event_args):
        self.empty = True
        self._draw()

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        hb.stop_preview()
        self.raise_event("x-close-alert", value=None)

    @handle("create_button", "click")
    def create_button_click(self, **event_args):
        hb.stop_preview()
        title = (self.title_box.text or "").strip() or ("My " + hb.genre(self.genre)["name"] + " song")
        self.raise_event("x-close-alert", value={"genre": self.genre, "title": title, "empty": self.empty})
