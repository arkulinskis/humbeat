from anvil import *

from ._anvil_designer import PickInstrumentTemplate
from ... import hb, state

CATS = ["Keys", "Guitars", "Strings", "Synths", "Bass", "Mallets", "Winds", "Voices"]


class PickInstrument(PickInstrumentTemplate):
    """Choose the sound of a new track: an instrument (kind "notes") or a drum kit (kind "drums"). Closes with its id."""

    def __init__(self, kind="notes", **properties):
        super().__init__(**properties)
        self.kind = kind
        self.cat = "Keys"
        self.choice = "piano" if kind == "notes" else "acoustic"
        self.title_label.text = "Add an instrument track" if kind == "notes" else "Add a drum track"
        state.heading(self.title_label, 2)
        self.cats_box.visible = kind == "notes"
        self.cats_panel.add_event_handler("x-word", self._cat)
        self.inst_panel.add_event_handler("x-inst", self._inst)
        self._draw()

    def _draw(self):
        if self.kind == "drums":
            self.inst_panel.items = [{"id": k["id"], "name": k["name"], "cat": "Drums", "on": k["id"] == self.choice} for k in hb.kits()]
            return
        self.cats_panel.items = [{"text": c} for c in CATS]
        for comp in self.cats_panel.get_components():
            getattr(comp, "button").role = ["chip"] + (["on"] if getattr(comp, "item")["text"] == self.cat else [])
        self.inst_panel.items = [dict(i, on=i["id"] == self.choice) for i in hb.instruments() if i["cat"] == self.cat]

    def _cat(self, text=None, **event_args):
        self.cat = text
        self._draw()

    def _inst(self, inst=None, **event_args):
        key = state.focus_key()
        self.choice = inst
        hb.preview_inst(inst)
        self._draw()
        state.refocus(self.inst_panel, key)

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=self.choice)
