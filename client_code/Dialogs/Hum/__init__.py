import json

from anvil import *
from anvil.js import window

from ._anvil_designer import HumTemplate
from ... import hb, state

GRIDS = [("16th notes (most detail)", 0.25), ("8th notes", 0.5), ("Quarter notes (simplest)", 1.0), ("Triplets", 1 / 3)]


class Hum(HumTemplate):
    """Hum to notes (kind "hum") or beatbox to drums (kind "beatbox"): count-in, listen, then show what was heard,
    let you pick the instrument / kit, the timing grid and key snapping, listen, and add it to the song."""

    def __init__(self, page, kind="hum", **properties):
        super().__init__(**properties)
        self.page = page
        self.kind = kind
        self.st = page.st
        hum = kind == "hum"
        self.title_label.text = "Hum a melody" if hum else "Beatbox a beat"
        state.heading(self.title_label, 2)
        self.intro_label.text = ("Hum or sing a tune. Humbeat turns it into notes you can play on any instrument."
                                 if hum else "Make drum sounds with your mouth. Humbeat turns them into a drum part.")
        self.hum_tips.visible = hum
        self.bb_tips.visible = not hum
        self.song_box.checked = hum
        self.dom_nodes["inst_cap"].textContent = "Play it on" if hum else "Drum kit"
        self.inst_drop.items = [(i["name"], i["id"]) for i in hb.instruments()] if hum else [(k["name"], k["id"]) for k in hb.kits()]
        self.inst_drop.selected_value = "piano" if hum else "acoustic"
        self.grid_drop.items = GRIDS
        self.grid_drop.selected_value = 0.25
        self.snap_box.visible = hum
        sel = page.s.get("track") or {}
        self.replace_button.visible = sel.get("kind") == ("notes" if hum else "drums")
        self._step("intro")

    def _step(self, name):
        self.step_intro.visible = name == "intro"
        self.step_rec.visible = name == "rec"
        self.step_done.visible = name == "done"

    @handle("", "show")
    def form_show(self, **event_args):
        state.set_control_attr(self.inst_drop, "aria-label", "Instrument" if self.kind == "hum" else "Drum kit")
        state.set_control_attr(self.grid_drop, "aria-label", "Snap timing to")

    @handle("cancel_button", "click")
    def cancel_button_click(self, **event_args):
        self.raise_event("x-close-alert", value=None)

    @handle("start_button", "click")
    def start_button_click(self, **event_args):
        ok = self.st.humStart(self.kind, bool(self.song_box.checked))
        if not ok:
            state.toast("Humbeat couldn't use your microphone. Allow it in the browser's address bar and try again.", "error")
            return
        self._step("rec")
        self.rec_label.text = "Get ready..."
        self.tick.interval = 0.2
        state.focus(self.stop_button)

    @handle("tick", "tick")
    def tick_tick(self, **event_args):
        n = hb.HB.audio.counting()
        if n:
            self.rec_label.text = "Count-in: %d" % n
        else:
            self.rec_label.text = "Listening... %.1f s" % float(hb.HB.voice.recordedSeconds())

    @handle("stop_button", "click")
    def stop_button_click(self, **event_args):
        self.tick.interval = 0
        if not self.st.humStop():
            self._step("intro")
            return
        self._step("done")
        self._analyse()

    def _analyse(self):
        r = json.loads(self.st.humResult(json.dumps({"grid": self.grid_drop.selected_value, "snap": bool(self.snap_box.checked),
                                                     "inst": self.inst_drop.selected_value})))
        self.error_label.visible = False
        empty = not r.get("count")
        if self.kind == "hum":
            if empty:
                self.result_label.text = "Humbeat didn't hear clear notes. Try again a bit louder, with \"da da\" on each note."
            else:
                self.result_label.text = "Heard %s over %s: %s. Your tune sounds like %s; the song is in %s." % (
                    state.plural(r["count"], "note"), state.plural(int(r["beats"] // 4) or 1, "bar"), " ".join(r.get("names") or []),
                    r.get("keyName"), r.get("songKey"))
        else:
            self.result_label.text = ("Heard nothing that sounded like a drum. Try again closer to the microphone." if empty else
                                      "Heard %d kicks, %d snares and %d hi-hats over %s." % (r["kicks"], r["snares"], r["hats"], state.plural(int(r["beats"] // 4) or 1, "bar")))
        for b in (self.use_button, self.replace_button, self.listen_button):
            b.enabled = not empty
        self.st.humPreview(self.dom_nodes["cv"])

    @handle("inst_drop", "change")
    def inst_drop_change(self, **event_args):
        self._analyse()
        self.st.humListen(self.inst_drop.selected_value)

    @handle("grid_drop", "change")
    def grid_drop_change(self, **event_args):
        self._analyse()

    @handle("snap_box", "change")
    def snap_box_change(self, **event_args):
        self._analyse()

    @handle("listen_button", "click")
    def listen_button_click(self, **event_args):
        self.st.humListen(self.inst_drop.selected_value)

    @handle("again_button", "click")
    def again_button_click(self, **event_args):
        self._step("intro")

    def _use(self, mode):
        if self.st.humUse(hb.js({"inst": self.inst_drop.selected_value, "mode": mode})):
            self.page.status("Added. Change its instrument in the Instrument tab, or fix notes in the piano roll below.")
            self.raise_event("x-close-alert", value=True)

    @handle("use_button", "click")
    def use_button_click(self, **event_args):
        self._use("new")

    @handle("replace_button", "click")
    def replace_button_click(self, **event_args):
        self._use("replace")
