import anvil.js
from anvil import *
from anvil.js import window

from ._anvil_designer import LearnTemplate


class Learn(LearnTemplate):
    """#learn (Read): the production guide. The table of contents scrolls to each section (the address stays #learn,
    since the router owns the hash)."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        anvil.js.get_dom_node(self).addEventListener("click", anvil.js.report_exceptions(self._toc))

    def _toc(self, event):
        a = event.target.closest("[data-to]") if getattr(event.target, "closest", None) else None
        if a is None:
            return
        event.preventDefault()
        event.stopPropagation()
        target = window.document.getElementById(a.getAttribute("data-to"))
        if target:
            target.scrollIntoView({"behavior": "smooth", "block": "start"})
            target.setAttribute("tabindex", "-1")
            getattr(target, "focus")({"preventScroll": True})
