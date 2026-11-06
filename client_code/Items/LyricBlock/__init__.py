import re

from anvil import *
from anvil.js import window

from ._anvil_designer import LyricBlockTemplate
from ... import state

WORD = re.compile(r"[A-Za-z']+")


def syllables(word):
    """A good-enough English syllable count (vowel groups, silent final e)."""
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    n = len(re.findall(r"[aeiouy]+", w))
    if w.endswith("e") and n > 1 and not w.endswith("le") and not w.endswith("ee"):
        n -= 1
    return max(1, n)


def line_counts(text):
    out = []
    for line in (text or "").split("\n"):
        if line.strip():
            out.append(sum(syllables(m) for m in WORD.findall(line)))
    return out


class LyricBlock(LyricBlockTemplate):
    """The words of one section, with a syllable count per line (to fit the flow). item = {id, name, text, bars}.
    Raises x-lyrics(id, text) a moment after typing stops."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self._t = None
        state.set_control_attr(self.text_box, "aria-label", "Words for " + (self.item.get("name") or "this section"))
        self._count()

    def _count(self):
        c = line_counts(self.text_box.text)
        self.syll_label.text = ("Syllables: " + " · ".join(str(x) for x in c)) if c else "%d bars" % int(self.item.get("bars") or 0)

    def _send(self):
        self._t = None
        if self.parent is not None:
            self.parent.raise_event("x-lyrics", id=self.item["id"], text=self.text_box.text or "")

    @handle("text_box", "change")
    def text_box_change(self, **event_args):
        self._count()
        if self._t is not None:
            window.clearTimeout(self._t)
        self._t = window.setTimeout(self._send, 700)

    @handle("text_box", "lost_focus")
    def text_box_lost_focus(self, **event_args):
        if self._t is not None:
            window.clearTimeout(self._t)
            self._send()
