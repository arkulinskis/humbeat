import json

from anvil import *

from ._anvil_designer import MixTabTemplate
from ... import hb, rb, state


class MixTab(MixTabTemplate):
    """Mix: auto-mix, the master level, the selected track's volume and pan, mute and solo, export."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)

    def sync(self, s):
        ed = bool(s.get("editable"))
        tr = s.get("track") or {}
        self.vol_slider.set_quiet(tr.get("vol") if tr.get("vol") is not None else 0.8)
        self.pan_slider.set_quiet(tr.get("pan") or 0)
        self.vol_slider.label = "Volume: " + (tr.get("name") or "no track")
        self.master_slider.set_quiet(s.get("master") or 0.85)
        for c in (self.auto_button, self.unmute_button, self.unsolo_button):
            c.enabled = ed

    @handle("auto_button", "click")
    def auto_button_click(self, **event_args):
        self.page.cmd("automix")
        self.page.status("Levels set for each part (drums and voice in front, pads behind). Fine-tune with the track sliders.")

    @handle("unmute_button", "click")
    def unmute_button_click(self, **event_args):
        for t in self.page.s.get("tracks") or []:
            if t.get("mute"):
                self.page.cmd("track", id=t["id"], mute=False)

    @handle("unsolo_button", "click")
    def unsolo_button_click(self, **event_args):
        for t in self.page.s.get("tracks") or []:
            if t.get("solo"):
                self.page.cmd("track", id=t["id"], solo=False)

    @handle("vol_slider", "change")
    def vol_slider_change(self, value, final, **event_args):
        tr = self.page.s.get("track") or {}
        if tr.get("id"):
            self.page.cmd("track", id=tr["id"], vol=value)

    @handle("pan_slider", "change")
    def pan_slider_change(self, value, final, **event_args):
        tr = self.page.s.get("track") or {}
        if tr.get("id"):
            self.page.cmd("track", id=tr["id"], pan=value)

    @handle("master_slider", "change")
    def master_slider_change(self, value, final, **event_args):
        self.page.cmd("master", value=value)

    @handle("wav_button", "click")
    def wav_button_click(self, **event_args):
        self.page.cmd("wav")

    @handle("stems_button", "click")
    def stems_button_click(self, **event_args):
        self.page.cmd("stems")

    @handle("midi_button", "click")
    def midi_button_click(self, **event_args):
        self.page.cmd("midi")
