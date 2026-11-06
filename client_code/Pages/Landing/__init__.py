from anvil import *

from ._anvil_designer import LandingTemplate
from ... import state


class Landing(LandingTemplate):
    """#landing (Persuade): the rolling cover hero (Components/CoverRoll: press Play to hear each style), how it
    works, the styles poster, the voice menu, questions. Static copy lives in the template."""

    def __init__(self, args=(), **properties):
        super().__init__(**properties)
        me = state.me()
        self.guest_cta.visible = not me
        self.member_cta.visible = bool(me)
