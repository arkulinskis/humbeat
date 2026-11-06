import json

from anvil import *

from ._anvil_designer import EffectsTabTemplate
from ... import hb, rb, state


class EffectsTab(EffectsTabTemplate):
    """Effects: the selected track's sound shaping (reverb, echo, drive, EQ, punch, tone, width, lo-fi) and presets."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.sliders = {"space": self.space_slider, "echo": self.echo_slider, "drive": self.drive_slider, "low": self.low_slider,
                        "high": self.high_slider, "punch": self.punch_slider, "tone": self.tone_slider, "wide": self.wide_slider, "lofi": self.lofi_slider}
        for key, sl in self.sliders.items():
            sl.add_event_handler("change", self._make(key))
        self.presets = {"clean": self.p_clean, "radio": self.p_radio, "tape": self.p_tape, "arena": self.p_arena, "dream": self.p_dream,
                        "crunch": self.p_crunch, "underwater": self.p_underwater, "tight": self.p_tight}
        for key, b in self.presets.items():
            b.add_event_handler("click", self._preset_handler(key))

    def _make(self, key):
        def changed(value=0, final=False, **event_args):
            self.page.cmd("fx", key=key, value=value)
        return changed

    def _preset_handler(self, key):
        def clicked(**event_args):
            self.page.cmd("fxpreset", preset=key)
        return clicked

    def sync(self, s):
        tr = s.get("track") or {}
        ok = bool(tr) and bool(s.get("editable"))
        self.none_label.visible = not tr
        fx = tr.get("fx") or {}
        for key, sl in self.sliders.items():
            sl.set_quiet(fx.get(key) if fx.get(key) is not None else (1 if key == "tone" else 0))
        for b in self.presets.values():
            b.enabled = ok
