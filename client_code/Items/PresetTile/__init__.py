from anvil import *

from ._anvil_designer import PresetTileTemplate
from ... import state


class PresetTile(PresetTileTemplate):
    """A voice or effects preset. item = {id, name, hint, on}. Raises x-preset."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.button.text = it["name"]
        self.button.tooltip = it.get("hint") or ""
        self.button.role = ["rb-tile", "rb-preset"] + (["on"] if it.get("on") else [])
        state.set_control_attr(self.button, "aria-pressed", "true" if it.get("on") else "false")
        state.set_control_attr(self.button, "data-key", it["id"])
        if it.get("hint"):
            state.set_control_attr(self.button, "aria-description", it["hint"])

    @handle("button", "click")
    def button_click(self, **event_args):
        self.parent.raise_event("x-preset", preset=self.item["id"])
