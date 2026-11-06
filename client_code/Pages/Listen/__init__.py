import json

import anvil.js
import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import ListenTemplate
from ... import hb, router, state


class Listen(ListenTemplate):
    """#listen/<share key>: a shared song for anyone. The song plays live in the browser (HB.Player, listen-only),
    with the words of each section scrolling by. One play is counted per visit."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.key = args[0] if args else ""
        self.player = hb.NULL
        self.counted = False
        self.doc: dict = {}
        if not self.key:
            self.player_box.visible = False
            self.missing_label.text = "No song was named in the link."
            return
        r = anvil.server.call("get_shared", self.key)
        self.player_box.visible = bool(r.get("ok"))
        self.missing.visible = not r.get("ok")
        if not r.get("ok"):
            self.missing_label.text = r.get("error") or ""
            return
        s: dict = r["song"]
        state.heading(self.title_label, 1)
        self.title_label.text = s["title"]
        self.by_label.text = "by " + (s.get("by") or "someone")
        self.meta_label.text = "%s · %d BPM · %s" % (hb.genre(s["genre"])["name"], int(s.get("bpm") or 0), state.plural(s.get("plays") or 0, "play"))
        self.cover.genre, self.cover.seed, self.cover.title = s["genre"], s.get("cover_seed") or 1, s["title"]
        state.set_attr(self.studio_link, "href", router.href("studio", s["id"]))
        doc = hb.doc_from(s.get("doc"))
        doc["takes"] = dict(doc.get("takes") or {})
        for tid, t in (s.get("takes") or {}).items():
            doc["takes"][tid] = dict(doc["takes"].get(tid) or {}, key=t["key"], sec=t["sec"])
        self.doc = doc
        window.document.title = s["title"] + " · Humbeat"

    @handle("", "show")
    def form_show(self, **event_args):
        if self.doc and self.player is None:
            opts = {"api": anvil.server.get_api_origin(), "change": anvil.js.report_exceptions(self._changed),
                    "status": anvil.js.report_exceptions(self._status)}
            self.player = anvil.js.new(hb.HB.Player, hb.js(self.doc), opts)
            st = self.player.st
            st.prompterOn = True
            st.mountPrompter(self.dom_nodes["prompter_node"])
            st.mountReadout(self.dom_nodes["time_node"], hb.NULL)
            window.HB_STUDIO = st

    def leave(self):
        if self.player is not None:
            self.player.destroy()
            self.player = hb.NULL
            window.HB_STUDIO = None

    def _changed(self, text, *a):
        s = json.loads(text)
        on = s.get("mode") == "play"
        self.play_button.text = "Stop" if on else "Play"
        self.play_button.role = ["btn", "btn-primary", "btn-lg", "ic-stop" if on else "ic-play"]

    def _status(self, text, kind="", *a):
        self.status_label.text = text or ""

    @handle("play_button", "click")
    def play_button_click(self, **event_args):
        if self.player is None:
            return
        self.player.toggle()
        if not self.counted:
            self.counted = True
            anvil.server.call_s("record_play", self.key)
