import json

from anvil import *

from ._anvil_designer import InstrumentTabTemplate
from ... import hb, rb, state


class InstrumentTab(InstrumentTabTemplate):
    """Instrument: what the selected track plays. Any part (a hummed melody too) can become any instrument."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)
        self.hb = hb
        self.cat = "Keys"
        self._shown = None
        self.cats_panel.add_event_handler("x-word", self._cat)
        self.inst_panel.add_event_handler("x-inst", self._inst)

    def sync(self, s):
        tr = s.get("track") or {}
        kind = tr.get("kind")
        ok = kind in ("notes", "drums") and bool(s.get("editable"))
        self.none_label.visible = not ok
        for c in (self.up_button, self.down_button):
            c.enabled = ok and kind == "notes"
        self.hear_button.enabled = kind in ("notes", "drums")
        self.cats.visible = kind == "notes"
        o = int(tr.get("oct") or 0)
        self.oct_label.text = ("Octave %+d" % o) if o else "Octave 0"
        self.oct_label.visible = kind == "notes"
        key = (tr.get("id"), tr.get("inst"), kind, self.cat)
        if key == self._shown:
            return
        self._shown = key
        if kind == "drums":
            self.inst_panel.items = [{"id": k["id"], "name": k["name"], "cat": "Drums", "on": k["id"] == tr.get("inst")} for k in self.hb.kits()]
        elif kind == "notes":
            cur = [i for i in self.hb.instruments() if i["id"] == tr.get("inst")]
            if cur and key[0] != (self._last or (None,))[0]:
                self.cat = cur[0]["cat"]
            self.cats_panel.items = [{"text": c} for c in ["Keys", "Guitars", "Strings", "Synths", "Bass", "Mallets", "Winds", "Voices"]]
            for comp in self.cats_panel.get_components():
                getattr(comp, "button").role = ["chip"] + (["on"] if getattr(comp, "item")["text"] == self.cat else [])
            self.inst_panel.items = [dict(i, on=i["id"] == tr.get("inst")) for i in self.hb.instruments() if i["cat"] == self.cat]
        else:
            self.inst_panel.items = []
        self._last = key

    _last = None

    def _cat(self, text=None, **event_args):
        self.cat = text
        self._shown = None
        self.sync(self.page.s)

    def _inst(self, inst=None, **event_args):
        key = state.focus_key()
        self.page.cmd("instrument", inst=inst)
        self.page.cmd("previewinst", inst=inst)
        state.refocus(self.inst_panel, key)

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self.page.cmd("octave", dir=1)

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self.page.cmd("octave", dir=-1)

    @handle("hear_button", "click")
    def hear_button_click(self, **event_args):
        tr = self.page.s.get("track") or {}
        self.page.cmd("previewinst", inst=tr.get("inst"))
