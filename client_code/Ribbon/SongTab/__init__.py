import json

from anvil import *

from ._anvil_designer import SongTabTemplate
from ... import hb, rb, state


class SongTab(SongTabTemplate):
    """Song: style, structure, the selected section (length, transition, chords) and swing."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.style_drop.items = [(g["name"], g["id"]) for g in hb.genres()]
        self.trans_drop.items = [(t[1], t[0]) for t in hb.transitions()]
        self.trans_hint = {t[0]: t[2] for t in hb.transitions()}

    def sync(self, s):
        ed = bool(s.get("editable"))
        rb.drop(self.style_drop, s.get("genre") or "hopecore")
        sec = s.get("section") or {}
        self.sec_label.text = sec.get("name") or ""
        self.bars_label.text = state.plural(int(sec.get("bars") or 0), "bar")
        rb.drop(self.trans_drop, sec.get("trans") or "none")
        self.trans_drop.tooltip = self.trans_hint.get(sec.get("trans") or "none", "")
        self.swing_slider.set_quiet(s.get("swing") or 0)
        for c in (self.style_drop, self.restyle_button, self.structure_button, self.chords_button, self.less_button, self.more_button, self.trans_drop):
            c.enabled = ed

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.style_drop, "aria-label", "Style")
        state.set_control_attr(self.trans_drop, "aria-label", "Transition after this section")

    @handle("restyle_button", "click")
    def restyle_button_click(self, **event_args):
        g = hb.genre(self.style_drop.selected_value)
        if confirm("Drums, bass, chords and melodies are rebuilt as %s. Your recorded vocals and your words stay." % g["name"],
                   title="Restyle the song?", buttons=[("Cancel", False), ("Restyle", True)], role="app-dialog"):
            self.page.cmd("restyle", genre=g["id"])
            self.page.status("Restyled as %s. Undo (Ctrl+Z) brings the old version back." % g["name"])

    @handle("styles_button", "click")
    def styles_button_click(self, **event_args):
        from ... import router
        router.go("styles", self.style_drop.selected_value)

    @handle("structure_button", "click")
    def structure_button_click(self, **event_args):
        self.page.open_sections()

    @handle("chords_button", "click")
    def chords_button_click(self, **event_args):
        self.page.open_chords()

    def _bars(self, delta):
        sec = self.page.s.get("section") or {}
        if sec.get("id"):
            self.page.cmd("setsection", id=sec["id"], bars=max(1, min(64, int(sec.get("bars") or 4) + delta)))

    @handle("less_button", "click")
    def less_button_click(self, **event_args):
        self._bars(-4 if int((self.page.s.get("section") or {}).get("bars") or 0) > 4 else -1)

    @handle("more_button", "click")
    def more_button_click(self, **event_args):
        self._bars(4)

    @handle("trans_drop", "change")
    def trans_drop_change(self, **event_args):
        sec = self.page.s.get("section") or {}
        if sec.get("id"):
            self.page.cmd("setsection", id=sec["id"], trans=self.trans_drop.selected_value)

    @handle("swing_slider", "change")
    def swing_slider_change(self, value, final, **event_args):
        self.page.cmd("swing", value=value)
