from anvil import *

from ._anvil_designer import ProgChipTemplate
from ... import state


class ProgChip(ProgChipTemplate):
    """A chord progression to choose. item = {id, name, chords, on}. Raises x-prog."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.button.text = "%s\n%s" % (it["chords"], it["name"])
        self.button.role = ["pc"] + (["on"] if it.get("on") else [])
        state.set_control_attr(self.button, "aria-pressed", "true" if it.get("on") else "false")
        state.set_control_attr(self.button, "data-key", it["id"])

    @handle("button", "click")
    def button_click(self, **event_args):
        self.parent.raise_event("x-prog", pid=self.item["id"])
