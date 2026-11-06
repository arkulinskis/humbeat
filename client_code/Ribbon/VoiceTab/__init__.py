import json

from anvil import *

from ._anvil_designer import VoiceTabTemplate
from ... import hb, rb, state


class VoiceTab(VoiceTabTemplate):
    """Voice: how the selected voice track sounds. Presets, auto-tune, pitch, character, harmony, doubling, space."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.harmony_drop.items = hb.harmonies()
        self.presets = hb.voice_presets()
        self.presets_panel.add_event_handler("x-preset", self._preset)
        self._shown = None

    def sync(self, s):
        tr = s.get("track") or {}
        on = bool(tr.get("kind") == "voice" and s.get("editable"))
        self.none_label.visible = not on
        for c in (self.tune_slider, self.speed_slider, self.char_slider, self.double_slider, self.space_slider, self.echo_slider,
                  self.harmony_drop, self.up_button, self.down_button):
            c.enabled = on
        v = tr.get("voice") or {}
        fx = tr.get("fx") or {}
        key = (tr.get("id"), v.get("preset"))
        if key != self._shown:
            self._shown = key
            self.presets_panel.items = [dict(p, on=p["id"] == v.get("preset")) for p in self.presets]
        self.tune_slider.set_quiet(v.get("tune") or 0)
        self.speed_slider.set_quiet(v.get("speed") if v.get("speed") is not None else 0.5)
        self.char_slider.set_quiet(v.get("character") or 0)
        self.double_slider.set_quiet(v.get("double") or 0)
        self.space_slider.set_quiet(fx.get("space") or 0)
        self.echo_slider.set_quiet(fx.get("echo") or 0)
        p = int(v.get("pitch") or 0)
        self.pitch_label.text = ("%+d" % p) if p else "0"
        rb.drop(self.harmony_drop, v.get("harmony") or "none")

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.harmony_drop, "aria-label", "Harmony voices")

    def _preset(self, preset=None, **event_args):
        key = state.focus_key()
        self.page.cmd("voicepreset", preset=preset)
        state.refocus(self.presets_panel, key)

    def _v(self, key, value):
        self.page.cmd("voice", key=key, value=value)

    @handle("tune_slider", "change")
    def tune_slider_change(self, value, final, **event_args):
        if final:
            self._v("tune", value)

    @handle("speed_slider", "change")
    def speed_slider_change(self, value, final, **event_args):
        if final:
            self._v("speed", value)

    @handle("char_slider", "change")
    def char_slider_change(self, value, final, **event_args):
        if final:
            self._v("character", value)

    @handle("double_slider", "change")
    def double_slider_change(self, value, final, **event_args):
        if final:
            self._v("double", value)

    @handle("harmony_drop", "change")
    def harmony_drop_change(self, **event_args):
        self._v("harmony", self.harmony_drop.selected_value)

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self._v("pitch", min(12, int((self.page.s.get("track") or {}).get("voice", {}).get("pitch") or 0) + 1))

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self._v("pitch", max(-12, int((self.page.s.get("track") or {}).get("voice", {}).get("pitch") or 0) - 1))

    @handle("space_slider", "change")
    def space_slider_change(self, value, final, **event_args):
        self.page.cmd("fx", key="space", value=value)

    @handle("echo_slider", "change")
    def echo_slider_change(self, value, final, **event_args):
        self.page.cmd("fx", key="echo", value=value)
