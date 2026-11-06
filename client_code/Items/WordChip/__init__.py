from anvil import *

from ._anvil_designer import WordChipTemplate


class WordChip(WordChipTemplate):
    """A word (a rhyme) or a song-starter idea. item = {text}. Raises x-word."""

    def __init__(self, **properties):
        super().__init__(**properties)
        self.button.text = self.item["text"]

    @handle("button", "click")
    def button_click(self, **event_args):
        self.parent.raise_event("x-word", text=self.item["text"])
