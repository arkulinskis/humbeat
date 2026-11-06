from anvil import *

from ._anvil_designer import SongCardTemplate
from ... import router, state

STYLE_NAMES = {}


def _len(sec):
    sec = int(sec or 0)
    return "%d:%02d" % (sec // 60, sec % 60)


class SongCard(SongCardTemplate):
    """One song: your own (open, share, copy, delete) or a spotlight song (listen). item = a song summary dict plus
    "_spot": True for the spotlight. Actions go to the page as x-song events."""

    def __init__(self, **properties):
        super().__init__(**properties)
        it = self.item
        spot = bool(it.get("_spot"))
        style = it.get("_style") or it.get("genre") or ""
        if spot:
            target = router.href("listen", it.get("share_key") or "") if it.get("share_key") else router.href("studio", it["id"])
            plays = it.get("plays") or 0
            self.meta_label.text = "%s · by %s · %s" % (style, it.get("by") or "someone", state.plural(plays, "play"))
        else:
            target = router.href("studio", it["id"])
            bits = [style, "%s BPM" % int(it.get("bpm") or 0), _len(it.get("seconds"))]
            if it.get("shared"):
                bits.append("shared")
            self.meta_label.text = " · ".join(bits) + " · " + (state.ago(it.get("updated")) or "")
        for a in (self.art_link, self.title_link):
            state.set_attr(a, "href", target)
        self.actions.visible = not spot
        self.share_button.text = "Sharing" if it.get("shared") else "Share"

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        self.parent.raise_event("x-song", action="share", song=self.item)

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        self.parent.raise_event("x-song", action="copy", song=self.item)

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.parent.raise_event("x-song", action="delete", song=self.item)
