import json

import anvil.js
import anvil.server
from anvil import *
from anvil.js import window

from ._anvil_designer import ListenTemplate
from ... import hb, router, state

KINDS = ["fire", "love", "laugh", "chills"]
BUCKET = 2.0   # seconds per marker (server_code/Reactions.py BUCKET)


def _clock(sec):
    sec = int(sec or 0)
    return "%d:%02d" % (sec // 60, sec % 60)


class Listen(ListenTemplate):
    """#listen/<share key>: a shared song for anyone. The song plays live in the browser (HB.Player, listen-only),
    with the words of each section scrolling by. One play is counted per visit. Listeners react to a moment
    (Fire / Love / Laugh / Chills: markers on the strip, Reactions.py), and "Made by a person" lists what the
    owner recorded, wrote and arranged."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        self.key = args[0] if args else ""
        self.player = hb.NULL
        self.counted = False
        self.doc: dict = {}
        self.marks: list = []
        self.total = 0
        self.seconds = 0.0
        for k in KINDS:
            getattr(self, "r_" + k).enabled = False
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
        self.seconds = float(s.get("seconds") or 0) or 180.0
        rx = r.get("reactions") or {}
        self.marks = list(rx.get("marks") or [])
        self.total = int(rx.get("total") or 0)
        self._react_text()
        self._made(s.get("made"))
        window.document.title = s["title"] + " · Humbeat"

    # ------------------------------------------------------------ made by a person
    def _made(self, m):
        self.made_box.visible = bool(m)
        if not m:
            return
        who = m.get("by") or "The maker"
        did = []
        if m.get("takes"):
            did.append("sang %s (%s of singing)" % (state.plural(m["takes"], "voice take"), _clock(m.get("sung"))))
        if m.get("hummed"):
            did.append("hummed or beatboxed %s" % state.plural(m["hummed"], "part"))
        if m.get("words"):
            did.append("wrote %s" % state.plural(m["words"], "word"))
        did.append("arranged %s" % state.plural(m.get("tracks") or 0, "track"))
        text = who + " " + (", ".join(did[:-1]) + " and " + did[-1] if len(did) > 1 else did[0]) + "."
        if m.get("started"):
            text += " Started %s" % m["started"]
            text += (", last changed %s." % m["updated"]) if m.get("updated") and m.get("updated") != m.get("started") else "."
        self.made_label.text = text

    # ------------------------------------------------------------ reactions
    def _react_text(self):
        if not self.total:
            self.react_label.text = "Press Play, then tap when a moment hits you. Nobody has reacted yet: be the first."
            return
        slots: dict = {}
        for m in self.marks:
            slot = int(float(m.get("t") or 0) // 4) * 4
            slots[slot] = slots.get(slot, 0) + int(m.get("n") or 1)
        best = max(slots, key=lambda k: (slots[k], -k)) if slots else 0
        self.react_label.text = "%s · most around %s" % (state.plural(self.total, "reaction"), _clock(best))

    def _draw_strip(self, fresh=None):
        try:
            st = self.player.st if self.player is not None else hb.NULL
            hb.HB.art.reactStrip(self.dom_nodes["strip_node"], hb.js(self.marks), self.seconds, hb.js(fresh) if fresh else hb.NULL, st)
        except Exception as e:
            print("reaction strip: %s" % e)

    def _react(self, kind):
        if self.player is None:
            return
        try:
            beats = float(self.player.st.position())
        except Exception:
            beats = 0.0
        bpm = float(self.doc.get("bpm") or 100)
        t = max(0.0, beats * 60.0 / bpm)
        mark = {"t": round(t / BUCKET) * BUCKET, "kind": kind, "n": 1}
        self.marks.append(mark)
        self.total += 1
        self._draw_strip(mark)
        self._react_text()
        r = anvil.server.call_s("react", self.key, t, kind)
        if isinstance(r, dict) and not r.get("ok"):
            state.toast(r.get("error") or "That reaction didn't arrive.", "error")

    @handle("r_fire", "click")
    def r_fire_click(self, **event_args):
        self._react("fire")

    @handle("r_love", "click")
    def r_love_click(self, **event_args):
        self._react("love")

    @handle("r_laugh", "click")
    def r_laugh_click(self, **event_args):
        self._react("laugh")

    @handle("r_chills", "click")
    def r_chills_click(self, **event_args):
        self._react("chills")

    # ------------------------------------------------------------ the player
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
            self._draw_strip()

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
        for k in KINDS:
            getattr(self, "r_" + k).enabled = True
        if not self.counted:
            self.counted = True
            if not self.total:
                self.react_label.text = "Tap a reaction when a moment hits you: it lands right where the song is."
            anvil.server.call_s("record_play", self.key)
