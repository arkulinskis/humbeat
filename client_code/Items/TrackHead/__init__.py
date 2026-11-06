import anvil.js
from anvil import *
from anvil.js import window

from ._anvil_designer import TrackHeadTemplate
from ... import state


class TrackHead(TrackHeadTemplate):
    """The left end of one track lane: colour, name (press to select), instrument, Mute, Solo, volume.
    item = a track dict from the studio state. Raises x-track(action, id, value) on the panel."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.chip.style["background"] = "var(--tk-%d)" % (int(it.get("color") or 0) % 8)
        self.box.classes["on"] = bool(it.get("sel"))
        self.box.classes["quiet"] = bool(it.get("quiet"))
        self.box.classes["kind-" + (it.get("kind") or "notes")] = True
        self.mute_button.role = ["th-btn", "th-mute"] + (["on"] if it.get("mute") else [])
        self.solo_button.role = ["th-btn", "th-solo"] + (["on"] if it.get("solo") else [])
        nm = it.get("name") or "Track"
        state.set_control_attr(self.name_button, "aria-pressed", "true" if it.get("sel") else "false")
        state.set_control_attr(self.name_button, "data-key", "sel-" + it["id"])
        state.set_control_attr(self.mute_button, "aria-pressed", "true" if it.get("mute") else "false")
        state.set_control_attr(self.mute_button, "aria-label", "Mute " + nm)
        state.set_control_attr(self.mute_button, "data-key", "mute-" + it["id"])
        state.set_control_attr(self.solo_button, "aria-pressed", "true" if it.get("solo") else "false")
        state.set_control_attr(self.solo_button, "aria-label", "Solo " + nm)
        state.set_control_attr(self.solo_button, "data-key", "solo-" + it["id"])
        vol = self.dom_nodes["vol"]
        vol.setAttribute("aria-label", "Volume of " + nm)
        window.Object.assign(vol, {"value": str(it.get("vol") if it.get("vol") is not None else 0.8)})
        vol.addEventListener("input", anvil.js.report_exceptions(self._vol))

    def _vol(self, event):
        try:
            v = float(getattr(self.dom_nodes["vol"], "value"))
        except Exception:
            return
        self.parent.raise_event("x-track", action="vol", id=self.item["id"], value=v)

    @handle("name_button", "click")
    def name_button_click(self, **event_args):
        self.parent.raise_event("x-track", action="select", id=self.item["id"], value=None)

    @handle("mute_button", "click")
    def mute_button_click(self, **event_args):
        self.parent.raise_event("x-track", action="mute", id=self.item["id"], value=not self.item.get("mute"))

    @handle("solo_button", "click")
    def solo_button_click(self, **event_args):
        self.parent.raise_event("x-track", action="solo", id=self.item["id"], value=not self.item.get("solo"))
