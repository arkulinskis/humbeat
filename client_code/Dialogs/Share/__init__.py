import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import ShareTemplate
from ... import router, state


class Share(ShareTemplate):
    """Turn a song's public listen link on or off and copy it."""

    def __init__(self, song_id, **properties):
        super().__init__(**properties)
        self.song_id = song_id
        r = anvil.server.call("get_song", song_id)
        song = r.get("song") or {}
        self._show(song.get("share_key"))

    def _show(self, key):
        self.on_box.checked = bool(key)
        self.link_box.visible = bool(key)
        if key:
            url = window.location.href.split("#")[0].split("?")[0] + router.href("listen", key)
            self.link_text.text = url
            state.set_attr(self.open_link, "href", router.href("listen", key))
        state.set_control_attr(self.link_text, "readonly", "readonly")

    @handle("on_box", "change")
    def on_box_change(self, **event_args):
        r = state.call("share_song", self.song_id, bool(self.on_box.checked))
        if r:
            self._show(r["song"].get("share_key"))
        else:
            self.on_box.checked = not self.on_box.checked

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        try:
            window.navigator.clipboard.writeText(self.link_text.text or "")
            state.toast("Link copied.", "ok")
        except Exception:
            state.toast("Select the link and copy it (Ctrl+C).")

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=True)
