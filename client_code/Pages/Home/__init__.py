import anvil.server
from anvil import *

from ._anvil_designer import HomeTemplate
from ... import hb, router, songs, state


class Home(HomeTemplate):
    """#home: your songs (open, share, copy, delete), New song, moving a visitor's song into the account, and the
    spotlight of shared songs."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.songs_panel.add_event_handler("x-song", self._song)
        state.heading(self.title_label, 1)
        self.styles = {g["id"]: g["name"] for g in hb.genres()}
        g = songs.guest_doc()
        self.import_box.visible = bool(g)
        if g:
            self.import_label.text = '"%s" is kept in this browser. Move it (recordings included) into your account to keep it safe.' % (g.get("title") or "Your song")
        self._load()
        sp = anvil.server.call("get_spotlight")["songs"]
        self.spot_panel.items = [dict(x, _spot=True, _style=self.styles.get(x["genre"], x["genre"])) for x in sp]
        self.spot_box.visible = bool(sp)

    def _load(self):
        d = state.call("list_songs")
        items = [dict(x, _style=self.styles.get(x["genre"], x["genre"])) for x in d["songs"]]
        self.songs_panel.items = items
        self.empty.visible = not items
        self.count_label.text = state.plural(d["total"], "song") if items else "Make your first one from a style."

    def _new(self):
        from ...Dialogs.NewSong import NewSong
        r = alert(NewSong(), buttons=[], large=True, role="app-dialog")
        if r:
            addr = songs.new_song(r["genre"], r["title"], r["empty"])
            if addr:
                router.go(*addr)

    @handle("new_button", "click")
    def new_button_click(self, **event_args):
        self._new()

    @handle("empty_button", "click")
    def empty_button_click(self, **event_args):
        self._new()

    @handle("import_button", "click")
    def import_button_click(self, **event_args):
        self.import_button.enabled = False
        try:
            sid = songs.import_guest()
        finally:
            self.import_button.enabled = True
        if sid:
            state.toast("Moved into your songs.", "ok")
            router.go("studio", sid)

    def _song(self, action=None, song=None, **event_args):
        if song is None:
            return
        if action == "delete":
            if confirm('"%s" and its recordings are deleted for good.' % song["title"], title="Delete this song?",
                       buttons=[("Cancel", False), ("Delete", True)], role="app-dialog"):
                if state.call("delete_song", song["id"]) is not None:
                    state.toast("Deleted.", "ok")
                    self._load()
        elif action == "copy":
            r = state.call("duplicate_song", song["id"], None)
            if r:
                state.toast('Copied as "%s".' % r["song"]["title"], "ok")
                self._load()
        elif action == "share":
            from ...Dialogs.Share import Share
            alert(Share(song_id=song["id"]), buttons=[], role="app-dialog")
            self._load()
