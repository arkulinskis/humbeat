from anvil import *
from anvil.js import window

from ._anvil_designer import ChordsTemplate
from ... import hb, state


class Chords(ChordsTemplate):
    """Choose a chord progression for one kind of section (verse, chorus...). Each choice shows its chords in the song's
    key; pressing one applies it (Undo brings the old one back) and plays it."""

    def __init__(self, page, **properties):
        super().__init__(**properties)
        self.page = page
        s = page.fresh()
        kinds = []
        for x in s.get("sections") or []:
            if x["kind"] not in kinds:
                kinds.append(x["kind"])
        names = dict((v, k) for k, v in hb.section_kinds())
        self.kind_drop.items = [(names.get(k, k), k) for k in kinds]
        cur = (s.get("section") or {}).get("kind")
        self.kind_drop.selected_value = cur if cur in kinds else (kinds[0] if kinds else "verse")
        self.prog_panel.add_event_handler("x-prog", self._prog)
        self.progs = hb.progressions()
        self._draw()

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.kind_drop, "aria-label", "Which sections")

    def _names(self, deg, ext):
        s = self.page.s
        return " ".join(hb.chord_name(int(s.get("key") or 0), s.get("scale") or "major", d, ext) for d in deg)

    def _current(self):
        s = self.page.fresh()
        k = self.kind_drop.selected_value
        for x in s.get("sections") or []:
            if x["kind"] == k:
                sec = (s.get("section") or {})
                if sec.get("kind") == k:
                    return sec.get("prog") or {}
        return {}

    def _draw(self):
        cur = self._current()
        if not cur:
            self.page.cmd("section", id=[x["id"] for x in self.page.s.get("sections") or [] if x["kind"] == self.kind_drop.selected_value][0])
            cur = self._current()
        deg, ext = cur.get("deg") or [1, 5, 6, 4], cur.get("ext") or ""
        self.now_label.text = "Now: " + self._names(deg, ext)
        self.cur = (deg, ext)
        self.prog_panel.items = [{"id": p["id"], "name": p["name"], "chords": self._names(p["deg"], p.get("ext") or ""),
                                  "on": list(p["deg"]) == list(deg) and (p.get("ext") or "") == ext} for p in self.progs]

    @handle("kind_drop", "change")
    def kind_drop_change(self, **event_args):
        self._draw()

    def _play(self, deg, ext):
        for i, d in enumerate(deg):
            window.setTimeout(lambda d=d: self.page.cmd("previewchord", deg=d, ext=ext), i * 520)

    def _prog(self, pid=None, **event_args):
        key = state.focus_key()
        p = [x for x in self.progs if x["id"] == pid][0]
        self.page.cmd("progression", kind=self.kind_drop.selected_value, deg=p["deg"], ext=p.get("ext") or "")
        self._play(p["deg"], p.get("ext") or "")
        self._draw()
        state.refocus(self.prog_panel, key)

    @handle("hear_button", "click")
    def hear_button_click(self, **event_args):
        self._play(self.cur[0], self.cur[1])

    @handle("done_button", "click")
    def done_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=True)
