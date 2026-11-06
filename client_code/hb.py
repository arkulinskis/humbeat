"""The Python face of the Humbeat engines (theme/assets/hb-*.js, window.HB).

Sound, voices, drawing and dragging are JavaScript (they run every frame or crunch samples, which Skulpt does slowly).
Forms never touch window.HB directly: they call these functions, or the Studio controller through cmd().
Catalogues come back as plain Python lists of dicts (JSON in one step)."""
import json

import anvil.js
from anvil.js import window

HB = window.HB
NULL = anvil.js.call(window.Function("return null"))  # "nothing yet" for JS objects (typed Any, unlike None)


def py(x):
    if x is None:
        return None
    return json.loads(window.JSON.stringify(x))


def js(value):
    """A Python dict/list as a real JS object (for the engines)."""
    return window.JSON.parse(json.dumps(value))


_CACHE = {}


def genres():
    if "genres" not in _CACHE:
        _CACHE["genres"] = [{"id": g["id"], "name": g["name"], "era": g["era"], "bpm": g["bpm"], "key": g["key"], "scale": g["scale"],
                             "blurb": g["blurb"], "ingredients": g["ingredients"], "starters": g.get("starters") or []}
                            for g in py(HB.GENRES)]
    return _CACHE["genres"]


def genre(gid):
    for g in genres():
        if g["id"] == gid:
            return g
    return genres()[0]


def instruments():
    if "inst" not in _CACHE:
        _CACHE["inst"] = [{"id": i["id"], "name": i["name"], "cat": i["cat"]} for i in py(HB.INSTRUMENTS)]
    return _CACHE["inst"]


def inst_name(iid):
    for i in instruments():
        if i["id"] == iid:
            return i["name"]
    return iid


def kits():
    if "kits" not in _CACHE:
        _CACHE["kits"] = py(HB.KIT_LIST)
    return _CACHE["kits"]


def voice_presets():
    if "vp" not in _CACHE:
        _CACHE["vp"] = [{"id": p["id"], "name": p["name"], "hint": p["hint"]} for p in py(HB.voice.PRESETS)]
    return _CACHE["vp"]


def harmonies():
    return [(h[1], h[0]) for h in py(HB.voice.HARMONIES)]


def progressions():
    return py(HB.PROGRESSIONS)


def transitions():
    return py(HB.TRANSITIONS)


def section_kinds():
    return [(k[1], k[0]) for k in py(HB.SECTION_KINDS)]


def note_names():
    return py(HB.theory.NOTE_NAMES)


def scales():
    s = py(HB.theory.SCALES)
    return [(v["name"], k) for k, v in s.items()]


def chord_name(key, scale, degree, ext=""):
    return str(HB.theory.chordName(key, scale, degree, ext or ""))


def roman(scale, degree):
    return str(HB.theory.roman(scale, degree))


def cover_svg(genre_id, seed, title, label=""):
    return str(HB.art.cover(js({"genre": genre_id, "seed": seed, "title": title, "label": label})))


def new_doc(genre_id, title=None, empty=False, seed=None):
    o = {"title": title, "empty": bool(empty)}
    if seed:
        o["seed"] = seed
    return py(HB.Doc.fromRecipe(genre_id, js(o)))


def doc_from(stored):
    """A stored song document; demo songs are {"from_recipe": genre, "seed": n} and get built here."""
    if isinstance(stored, dict) and stored.get("from_recipe"):
        return new_doc(stored["from_recipe"], stored.get("title"), seed=stored.get("seed"))
    return stored or new_doc("hopecore")


def studio(doc, editable, guest, api, hooks):
    """A new HB.Studio for the open song. hooks: dict of Python callables (change, save, saveTake, status, recorded)."""
    opts = js({"doc": doc, "editable": editable, "guest": guest, "api": api, "latencyMs": window.UI.store.get("latency", 0)})
    opts["hooks"] = {name: anvil.js.report_exceptions(fn) for name, fn in hooks.items()}
    return anvil.js.new(HB.Studio, opts)


def preview_genre(gid, on_change=None):
    if on_change is not None:
        return HB.previewGenre(gid, anvil.js.report_exceptions(on_change))
    return HB.previewGenre(gid)


def stop_preview():
    HB.stopPreview()


def previewing():
    p = HB.previewing()
    return str(p) if p else None


def preview_inst(iid):
    """A short taste of an instrument (a chord) or a drum kit (kick, snare), outside the studio."""
    HB.audio.unlock()
    if iid in [k["id"] for k in kits()]:
        HB.audio.previewDrum(iid, "kick")
        window.setTimeout(lambda: HB.audio.previewDrum(iid, "snare"), 260)
    else:
        HB.audio.previewChord(iid, js([60, 64, 67]))


def rhymes(word, kind="rel_rhy"):
    """Rhymes from Datamuse (keyless, CORS). -> list of words, or None if it couldn't be reached."""
    try:
        r = window.fetch("https://api.datamuse.com/words?%s=%s&max=30" % (kind, window.encodeURIComponent(word)))
        if not getattr(r, "ok"):
            return None
        data = getattr(r, "json")()
        return [str(w["word"]) for w in py(data)]
    except Exception:
        return None
