import json

from anvil import *

from ._anvil_designer import RecordTabTemplate
from ... import hb, rb, state


class RecordTab(RecordTabTemplate):
    """Record: your voice over the song, a hummed melody, a beatboxed beat; count-in, click, lyrics prompter, timing fix."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)

    def sync(self, s):
        ed = bool(s.get("editable"))
        rb.toggle(self.rec_button, s.get("mode") == "rec", rb.BIG + ["rb-rec", "ic-rec"])
        self.rec_button.text = "Stop recording" if s.get("mode") == "rec" else "Record voice"
        for b in (self.rec_button, self.hum_button, self.beatbox_button):
            b.enabled = ed
        rb.toggle(self.count_button, s.get("countIn"), rb.SMALL + ["ic-metronome"])
        rb.toggle(self.click_button, s.get("metronome"), rb.SMALL + ["ic-metronome"])
        rb.toggle(self.prompter_button, s.get("prompter"), rb.SMALL + ["ic-text"])
        self.latency_slider.set_quiet(s.get("latency") or 0)

    @handle("rec_button", "click")
    def rec_button_click(self, **event_args):
        self.page.cmd("record")

    @handle("hum_button", "click")
    def hum_button_click(self, **event_args):
        self.page.open_hum("hum")

    @handle("beatbox_button", "click")
    def beatbox_button_click(self, **event_args):
        self.page.open_hum("beatbox")

    @handle("count_button", "click")
    def count_button_click(self, **event_args):
        self.page.cmd("countin")

    @handle("click_button", "click")
    def click_button_click(self, **event_args):
        self.page.cmd("metronome")

    @handle("prompter_button", "click")
    def prompter_button_click(self, **event_args):
        self.page.cmd("prompter")

    @handle("mic_button", "click")
    def mic_button_click(self, **event_args):
        self.page.test_mic()

    @handle("latency_slider", "change")
    def latency_slider_change(self, value, final, **event_args):
        self.page.cmd("latency", ms=value)
        if final:
            state.store_set("latency", value)
