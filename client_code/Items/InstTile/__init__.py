from anvil import *

from ._anvil_designer import InstTileTemplate
from ... import state

ICON = {"Keys": "piano", "Guitars": "guitar", "Strings": "harmony", "Synths": "wave", "Bass": "eq", "Mallets": "sparkles",
        "Winds": "hum", "Voices": "mic", "Drums": "drum"}


class InstTile(InstTileTemplate):
    """An instrument or drum kit to pick. item = {id, name, cat, on}. Raises x-inst."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.button.text = it["name"]
        self.button.role = ["rb-tile", "ic-" + ICON.get(it.get("cat") or "Keys", "music")] + (["on"] if it.get("on") else [])
        state.set_control_attr(self.button, "aria-pressed", "true" if it.get("on") else "false")
        state.set_control_attr(self.button, "data-key", it["id"])

    @handle("button", "click")
    def button_click(self, **event_args):
        self.parent.raise_event("x-inst", inst=self.item["id"])
