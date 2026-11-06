from anvil import *

from ._anvil_designer import CoverTemplate
from ... import hb


class Cover(CoverTemplate):
    """A song or style cover. Properties redraw it (the SVG comes from the art engine)."""

    def __init__(self, **properties):
        self._genre, self._seed, self._title, self._label = "hopecore", 1, "", ""
        self._ready = False
        super().__init__(**properties)
        self._ready = True
        self._draw()

    def _draw(self):
        if not self._ready:
            return
        node = self.dom_nodes["art"]
        node.innerHTML = hb.cover_svg(self._genre, int(self._seed or 1), self._title or "Untitled", self._label or "")

    @property
    def genre(self):
        return self._genre

    @genre.setter
    def genre(self, v):
        self._genre = v or "hopecore"
        self._draw()

    @property
    def seed(self):
        return self._seed

    @seed.setter
    def seed(self, v):
        self._seed = v or 1
        self._draw()

    @property
    def title(self):
        return self._title

    @title.setter
    def title(self, v):
        self._title = v or ""
        self._draw()

    @property
    def label(self):
        return self._label

    @label.setter
    def label(self, v):
        self._label = v or ""
        self._draw()
