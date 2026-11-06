import json

from anvil import *

from ._anvil_designer import InsertTabTemplate
from ... import hb, rb, state


class InsertTab(InsertTabTemplate):
    """Insert: new tracks, starter parts, empty clips, sections, and parts made from your voice."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.kind_drop.items = hb.section_kinds()
        self.kind_drop.selected_value = "chorus"

    def sync(self, s):
        ed = bool(s.get("editable"))
        tr = s.get("track") or {}
        for b in (self.inst_button, self.drums_button, self.voice_button, self.section_button, self.hum_button, self.beatbox_button,
                  self.kind_drop, self.structure_button):
            b.enabled = ed
        self.starter_button.enabled = ed and tr.get("kind") in ("notes", "drums")
        self.clip_button.enabled = ed and tr.get("kind") in ("notes", "drums")
        self.unique_button.enabled = ed and (s.get("clip") or {}).get("linked", 0) > 1

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.kind_drop, "aria-label", "Kind of section to add")

    @handle("inst_button", "click")
    def inst_button_click(self, **event_args):
        self.page.pick_instrument("notes")

    @handle("drums_button", "click")
    def drums_button_click(self, **event_args):
        self.page.pick_instrument("drums")

    @handle("voice_button", "click")
    def voice_button_click(self, **event_args):
        self.page.cmd("addtrack", kind="voice", inst="pop")
        self.page.status("Voice track added. Press Record (or R) to sing into it.")

    @handle("starter_button", "click")
    def starter_button_click(self, **event_args):
        self.page.cmd("starter")
        self.page.status("A starter part in this song's style, all the way through. Edit it in the piano roll below.")

    @handle("clip_button", "click")
    def clip_button_click(self, **event_args):
        self.page.cmd("newclip")

    @handle("unique_button", "click")
    def unique_button_click(self, **event_args):
        self.page.cmd("unique")

    @handle("section_button", "click")
    def section_button_click(self, **event_args):
        sec = self.page.s.get("section") or {}
        self.page.cmd("addsection", kind=self.kind_drop.selected_value, after=sec.get("id"))

    @handle("structure_button", "click")
    def structure_button_click(self, **event_args):
        self.page.open_sections()

    @handle("hum_button", "click")
    def hum_button_click(self, **event_args):
        self.page.open_hum("hum")

    @handle("beatbox_button", "click")
    def beatbox_button_click(self, **event_args):
        self.page.open_hum("beatbox")
