import json

from anvil import *

from ._anvil_designer import FileTabTemplate
from ... import hb, rb, state


class FileTab(FileTabTemplate):
    """File: new, your songs, a copy, share, export, clean up, delete."""

    def __init__(self, page=None, **properties):
        self.page = page if page is not None else hb.NULL
        super().__init__(**properties)

    def sync(self, s):
        member = bool(state.me())
        own = bool(self.page.can_edit and member)
        self.songs_button.visible = member
        self.share_button.enabled = own
        self.delete_button.enabled = own
        self.clean_button.enabled = bool(s.get("editable")) and s.get("takes", 0) > 0
        self.copy_button.text = "Save a copy" if own else ("Make it mine" if member else "Sign up to keep it")

    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        self.page.new_song()

    @handle("songs_button", "click")
    def songs_button_click(self, **event_args):
        from ... import router
        router.go("home")

    @handle("copy_button", "click")
    def copy_button_click(self, **event_args):
        self.page.save_copy()

    @handle("share_button", "click")
    def share_button_click(self, **event_args):
        self.page.share()

    @handle("wav_button", "click")
    def wav_button_click(self, **event_args):
        self.page.cmd("wav")

    @handle("midi_button", "click")
    def midi_button_click(self, **event_args):
        self.page.cmd("midi")

    @handle("clean_button", "click")
    def clean_button_click(self, **event_args):
        r = json.loads(self.page.cmd("cleantakes") or "{}")
        state.toast("Removed %s that no clip uses." % state.plural(r.get("removed", 0), "recording"), "ok")

    @handle("delete_button", "click")
    def delete_button_click(self, **event_args):
        self.page.delete_song()
