import json

from anvil import *

from ._anvil_designer import HomeTabTemplate
from ... import hb, rb, state


class HomeTab(HomeTabTemplate):
    """Home: play and record, clipboard, undo, tempo / key / scale, view."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.key_drop.items = [(n, i) for i, n in enumerate(hb.note_names())]
        self.scale_drop.items = hb.scales()

    def sync(self, s):
        playing = s.get("mode") in ("play", "rec")
        rb.roles(self.play_button, rb.BIG + ["ic-stop" if playing else "ic-play"])
        self.play_button.text = "Stop" if playing else "Play"
        rb.toggle(self.rec_button, s.get("mode") == "rec", rb.BIG + ["rb-rec", "ic-rec"])
        self.rec_button.text = "Stop recording" if s.get("mode") == "rec" else "Record"
        rb.toggle(self.loop_button, s.get("loop"), rb.SMALL + ["ic-loop"])
        rb.toggle(self.click_button, s.get("metronome"), rb.SMALL + ["ic-metronome"])
        rb.toggle(self.follow_button, s.get("follow"), rb.SMALL + ["ic-arrow"])
        rb.toggle(self.lyrics_button, self.page.side_on, rb.BIG + ["ic-text"])
        ed = bool(s.get("editable"))
        has = bool(s.get("hasClip"))
        for b in (self.cut_button, self.copy_button, self.dup_button, self.delete_button):
            b.enabled = has and (ed or b is self.copy_button)
        self.paste_button.enabled = ed and bool(s.get("clipboard"))
        self.undo_button.enabled = bool(s.get("canUndo"))
        self.redo_button.enabled = bool(s.get("canRedo"))
        self.rec_button.enabled = ed
        rb.text_if_idle(self.bpm_box, str(int(s.get("bpm") or 100)))
        rb.drop(self.key_drop, int(s.get("key") or 0))
        rb.drop(self.scale_drop, s.get("scale") or "major")
        for c in (self.bpm_box, self.key_drop, self.scale_drop, self.slower_button, self.faster_button, self.tap_button):
            c.enabled = ed

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.bpm_box, "aria-label", "Tempo in beats per minute")
        state.set_control_attr(self.key_drop, "aria-label", "Key")
        state.set_control_attr(self.scale_drop, "aria-label", "Scale")

    @handle("play_button", "click")
    def play_button_click(self, **event_args):
        self.page.cmd("play")

    @handle("rec_button", "click")
    def rec_button_click(self, **event_args):
        self.page.cmd("record")

    @handle("start_button", "click")
    def start_button_click(self, **event_args):
        self.page.cmd("home")

    @handle("loop_button", "click")
    def loop_button_click(self, **event_args):
        self.page.cmd("loop")

    @handle("click_button", "click")
    def click_button_click(self, **event_args):
        self.page.cmd("metronome")

    @handle("paste_button", "click")
    def paste_button_click(self, **event_args):
        self.page.cmd("paste")

    @handle("cut_button", "click")
    def cut_button_click(self, **event_args):
        self.page.cmd("cut")

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        self.page.cmd("copy")

    @handle("dup_button", "click")
    def dup_button_click(self, **event_args):
        self.page.cmd("duplicate")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.page.cmd("delete")

    @handle("undo_button", "click")
    def undo_button_click(self, **event_args):
        self.page.cmd("undo")

    @handle("redo_button", "click")
    def redo_button_click(self, **event_args):
        self.page.cmd("redo")

    @handle("slower_button", "click")
    def slower_button_click(self, **event_args):
        self.page.cmd("tempostep", step=-2)

    @handle("faster_button", "click")
    def faster_button_click(self, **event_args):
        self.page.cmd("tempostep", step=2)

    @handle("tap_button", "click")
    def tap_button_click(self, **event_args):
        r = json.loads(self.page.cmd("tap") or "{}")
        if r.get("taps", 0) < 3:
            self.page.status("Keep tapping on the beat (3 taps or more).")

    @handle("bpm_box", "pressed_enter")
    def bpm_box_pressed_enter(self, **event_args):
        self.bpm_box_lost_focus()

    @handle("bpm_box", "lost_focus")
    def bpm_box_lost_focus(self, **event_args):
        try:
            v = float(self.bpm_box.text)
        except (TypeError, ValueError):
            return
        if int(v) != int(self.page.s.get("bpm") or 0):
            self.page.cmd("tempo", bpm=v)

    @handle("key_drop", "change")
    def key_drop_change(self, **event_args):
        self.page.cmd("key", key=self.key_drop.selected_value)

    @handle("scale_drop", "change")
    def scale_drop_change(self, **event_args):
        self.page.cmd("scale", scale=self.scale_drop.selected_value)

    @handle("zoomin_button", "click")
    def zoomin_button_click(self, **event_args):
        self.page.cmd("zoom", dir=1)

    @handle("zoomout_button", "click")
    def zoomout_button_click(self, **event_args):
        self.page.cmd("zoom", dir=-1)

    @handle("follow_button", "click")
    def follow_button_click(self, **event_args):
        self.page.cmd("follow")

    @handle("lyrics_button", "click")
    def lyrics_button_click(self, **event_args):
        self.page.toggle_side()
