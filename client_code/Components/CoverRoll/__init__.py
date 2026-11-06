import anvil.js
from anvil import *
from anvil.js import window

from ._anvil_designer import CoverRollTemplate
from ... import hb, router, state

ORDER = ["hopecore", "mumble", "metal", "pop80", "teenpop", "storypop", "lofi", "synthwave", "afrobeats", "drill", "poppunk", "house"]


class CoverRoll(CoverRollTemplate):
    """Wraps HB.art.Roller (theme/assets/hb-art.js). The stack and its entrance are drawn by the engine; the
    buttons and words are Anvil components that follow the cover in front."""

    def __init__(self, **properties):
        self.roller = hb.NULL
        super().__init__(**properties)
        by = {g["id"]: g for g in hb.genres()}
        self.items = [by[i] for i in ORDER if i in by]
        self._show(self.items[0])

    @handle("", "show")
    def form_show(self, **event_args):
        opts = {"onChange": anvil.js.report_exceptions(self._changed), "onPlay": anvil.js.report_exceptions(self._played)}
        self.roller = anvil.js.new(hb.HB.art.Roller, self.dom_nodes["stack"], hb.js(self.items), opts)

    @handle("", "hide")
    def form_hide(self, **event_args):
        if self.roller is not None:
            self.roller.destroy()
            self.roller = hb.NULL

    def _changed(self, item=None, *a):
        if item is not None:
            self._show(hb.py(item))

    def _played(self, gid=None, *a):
        on = bool(gid)
        self.play_button.text = "Stop" if on else "Play this style"
        self.play_button.role = ["btn", "btn-primary", "ic-stop" if on else "ic-play", "rl-play"]

    def _show(self, g):
        self.name_label.text = g["name"]
        self.blurb_label.text = g["blurb"]
        state.set_attr(self.start_link, "href", router.href("studio", "new", g["id"]))
        self.current = g

    @handle("prev_button", "click")
    def prev_button_click(self, **event_args):
        if self.roller is not None:
            self.roller.go(-1)

    @handle("next_button", "click")
    def next_button_click(self, **event_args):
        if self.roller is not None:
            self.roller.go(1)

    @handle("play_button", "click")
    def play_button_click(self, **event_args):
        if self.roller is not None:
            self._played(self.current["id"] if self.roller.play() else None)
