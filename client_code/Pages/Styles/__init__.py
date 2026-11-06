from anvil import *

from ._anvil_designer import StylesTemplate
from ... import hb, router, state

NOTE = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


class Styles(StylesTemplate):
    """#styles/<id>: what makes a style (drums, bass, chords, vocals, song shape, a tip), its chorus to hear, and a
    button that starts a song in it. All styles below as covers."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        gs = hb.genres()
        ids = [g["id"] for g in gs]
        self.gid = args[0] if args and args[0] in ids else ids[0]
        g = hb.genre(self.gid)
        state.heading(self.name_label, 1)
        self.name_label.text = g["name"]
        self.facts_label.text = "%s · %d BPM · %s %s" % (g["era"], g["bpm"], NOTE[g["key"] % 12], g["scale"])
        self.blurb_label.text = g["blurb"]
        ing = g["ingredients"]
        for key, label in (("drums", self.drums_label), ("bass", self.bass_label), ("harmony", self.harmony_label), ("vocals", self.vocals_label),
                           ("structure", self.structure_label), ("tip", self.tip_label)):
            label.text = ing.get(key, "")
        self.cover.genre, self.cover.seed, self.cover.title, self.cover.label = g["id"], hb.HB.art.hash(g["id"]) % 9973 + 11, g["name"], "%d BPM" % g["bpm"]
        state.set_attr(self.start_link, "href", router.href("studio", "new", g["id"]))
        self.styles_panel.items = [dict(x, seed=hb.HB.art.hash(x["id"]) % 9973 + 11, on=x["id"] == self.gid) for x in gs]
        window_title = g["name"] + " · Styles · Humbeat"
        from anvil.js import window
        window.document.title = window_title

    def _played(self, gid=None, *a):
        on = gid == self.gid
        self.hear_button.text = "Stop" if on else "Hear the chorus"
        self.hear_button.role = ["btn", "btn-lg", "ic-stop" if on else "ic-play"]

    @handle("hear_button", "click")
    def hear_button_click(self, **event_args):
        self._played(self.gid if hb.preview_genre(self.gid, self._played) else None)
