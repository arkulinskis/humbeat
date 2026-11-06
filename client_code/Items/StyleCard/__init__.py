from anvil import *

from ._anvil_designer import StyleCardTemplate
from ... import router, state


class StyleCard(StyleCardTemplate):
    """One style on the Styles page: its cover and tempo, a link to its page. item = {id, name, era, bpm, seed, on}."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.meta_label.text = "%s · %d BPM" % (it["era"], it["bpm"])
        state.set_attr(self.link, "href", router.href("styles", it["id"]))
        state.set_attr(self.link, "aria-label", "%s, %s, %d BPM" % (it["name"], it["era"], it["bpm"]))
        if it.get("on"):
            state.set_attr(self.link, "aria-current", "true")
        self.link.classes["on"] = bool(it.get("on"))
