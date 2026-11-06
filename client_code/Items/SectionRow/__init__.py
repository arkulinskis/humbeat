from anvil import *

from ._anvil_designer import SectionRowTemplate
from ... import hb, state


class SectionRow(SectionRowTemplate):
    """One section in the Song structure dialog: name, kind, length, the transition into the next one, order.
    item = {id, name, kind, bars, trans, idx, count}. Raises x-sec(action, id, value)."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.kind_drop.items = hb.section_kinds()
        self.kind_drop.selected_value = it["kind"]
        self.trans_drop.items = [("Then: " + t[1], t[0]) for t in hb.transitions()]
        self.trans_drop.selected_value = it.get("trans") or "none"
        self.bars_label.text = state.plural(int(it["bars"]), "bar")
        nm = it.get("name") or "section"
        for comp, label in ((self.name_box, "Name of section %d" % (it["idx"] + 1)), (self.kind_drop, "Kind of " + nm),
                            (self.trans_drop, "Transition after " + nm)):
            state.set_control_attr(comp, "aria-label", label)
        for comp, key in ((self.less_button, "less"), (self.more_button, "more"), (self.up_button, "up"), (self.down_button, "down")):
            state.set_control_attr(comp, "data-key", key + "-" + it["id"])
        self.up_button.enabled = it["idx"] > 0
        self.down_button.enabled = it["idx"] < it["count"] - 1
        self.remove_button.enabled = it["count"] > 1
        self.less_button.enabled = it["bars"] > 1

    def _raise(self, action, value=None):
        self.parent.raise_event("x-sec", action=action, id=self.item["id"], value=value)

    @handle("name_box", "lost_focus")
    def name_box_lost_focus(self, **event_args):
        if (self.name_box.text or "").strip() and self.name_box.text != self.item["name"]:
            self._raise("name", self.name_box.text.strip())

    @handle("name_box", "pressed_enter")
    def name_box_pressed_enter(self, **event_args):
        self.name_box_lost_focus()

    @handle("kind_drop", "change")
    def kind_drop_change(self, **event_args):
        self._raise("kind", self.kind_drop.selected_value)

    @handle("trans_drop", "change")
    def trans_drop_change(self, **event_args):
        self._raise("trans", self.trans_drop.selected_value)

    @handle("less_button", "click")
    def less_button_click(self, **event_args):
        self._raise("bars", max(1, int(self.item["bars"]) - (4 if self.item["bars"] > 4 else 1)))

    @handle("more_button", "click")
    def more_button_click(self, **event_args):
        self._raise("bars", min(64, int(self.item["bars"]) + 4))

    @handle("up_button", "click")
    def up_button_click(self, **event_args):
        self._raise("move", -1)

    @handle("down_button", "click")
    def down_button_click(self, **event_args):
        self._raise("move", 1)

    @handle("remove_button", "click")
    def remove_button_click(self, **event_args):
        self._raise("remove")
