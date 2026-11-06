from anvil import *

from ._anvil_designer import AdminSongRowTemplate
from ... import router, state


class AdminSongRow(AdminSongRowTemplate):
    """A shared song in Admin -> Songs: put it in the spotlight, listen, or take it off its public link."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        self.meta_label.text = "%s · by %s%s · %s" % (it["genre"], it["by"], " · demo" if it.get("demo") else "", state.short_date(it.get("updated")))
        state.set_attr(self.listen_link, "href", router.href("listen", it.get("share_key") or ""))
        state.set_control_attr(self.featured_box, "aria-label", "Show %s in the spotlight" % it["title"])

    @handle("featured_box", "change")
    def featured_box_change(self, **event_args):
        if state.call("admin_feature", self.item["id"], self.featured_box.checked) is None:
            self.featured_box.checked = not self.featured_box.checked

    @handle("unshare_button", "click")
    def unshare_button_click(self, **event_args):
        if confirm("Its public link stops working. The owner can share it again (with a new link).", title="Stop sharing this song?",
                   buttons=[("Cancel", False), ("Stop sharing", True)], role="app-dialog"):
            if state.call("admin_unshare", self.item["id"]) is not None:
                self.parent.raise_event("x-changed")
