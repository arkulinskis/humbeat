from anvil import *

from ._anvil_designer import SectionsTemplate
from ... import hb, state


class Sections(SectionsTemplate):
    """Edit the song's sections: rename, change kind, length and transition, reorder, remove, add.
    Clips move with their sections (the studio does that)."""

    def __init__(self, page, **properties):
        super().__init__(**properties)
        self.page = page
        self.kind_drop.items = hb.section_kinds()
        self.kind_drop.selected_value = "verse"
        self.rows_panel.add_event_handler("x-sec", self._sec)
        self._draw()

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.kind_drop, "aria-label", "Kind of section to add")

    def _draw(self):
        s = self.page.fresh()
        secs = s.get("sections") or []
        self.rows_panel.items = [dict(x, idx=i, count=len(secs)) for i, x in enumerate(secs)]
        self.len_label.text = "%s · %s" % (state.plural(s.get("bars") or 0, "bar"), s.get("lengthText") or "")

    def _sec(self, action=None, id=None, value=None, **event_args):
        key = state.focus_key()
        if action == "remove":
            if not confirm("Its clips are removed too (Undo brings them back).", title="Remove this section?",
                           buttons=[("Cancel", False), ("Remove", True)], role="app-dialog"):
                return
            self.page.cmd("removesection", id=id)
        elif action == "move":
            self.page.cmd("movesection", id=id, dir=value)
        else:
            args: dict = {"id": id}
            args[action] = value
            self.page.cmd("setsection", **args)
        self._draw()
        state.refocus(self.rows_panel, key)

    @handle("add_button", "click")
    def add_button_click(self, **event_args):
        self.page.cmd("addsection", kind=self.kind_drop.selected_value)
        self._draw()

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=True)
