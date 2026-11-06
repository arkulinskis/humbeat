from anvil import *

from ._anvil_designer import StyleTileTemplate
from ... import state


class StyleTile(StyleTileTemplate):
    """One style in the New song picker. item = {id, name, bpm, era, sel, playing}. Raises x-pick / x-hear."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.pick_button.text = "%s\n%s · %d BPM" % (it["name"], it["era"], it["bpm"])
        self.box.classes["on"] = bool(it.get("sel"))
        state.set_control_attr(self.pick_button, "aria-pressed", "true" if it.get("sel") else "false")
        state.set_control_attr(self.pick_button, "data-key", it["id"])
        state.set_control_attr(self.hear_button, "aria-label", ("Stop " if it.get("playing") else "Hear ") + it["name"])
        self.hear_button.role = ["btn", "btn-icon", "btn-sm", "ic-stop" if it.get("playing") else "ic-play", "stt-hear"]
        self.box.style["--tile"] = "var(--tk-%d)" % (it.get("i", 0) % 8)

    @handle("pick_button", "click")
    def pick_button_click(self, **event_args):
        self.parent.raise_event("x-pick", gid=self.item["id"])

    @handle("hear_button", "click")
    def hear_button_click(self, **event_args):
        self.parent.raise_event("x-hear", gid=self.item["id"])
