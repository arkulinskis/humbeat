"""Songs: your own songs (list, open, autosave, rename, copy, delete), share links, and the public spotlight.

A song's whole arrangement is one JSON document (tracks, clips, patterns, sections, lyrics) made and edited in the
browser (theme/assets/hb-*.js); the server checks who may read or change it, keeps it in songs.doc, and keeps a few
facts beside it for lists (tempo, key, length). Recorded voices are separate rows (Takes.py).
Demo songs store {"from_recipe": genre, "seed": n} and the browser builds them from the genre recipe.
"""
import json
import re
import secrets

import anvil.server
import anvil.tables as tables
from anvil.tables import app_tables

from . import common as C
from . import DemoData, Takes

GENRES = {"hopecore", "mumble", "metal", "pop80", "teenpop", "storypop", "lofi", "house", "synthwave", "reggaeton",
          "poppunk", "drill", "afrobeats", "ballad", "futurebass", "hyperpop", "disco", "boombap"}
NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MAX_DOC = 600000          # characters of JSON
MAX_SONGS = 300           # per person
ID_RE = re.compile(r"^[A-Za-z0-9_\-\[\],]{1,80}$")
KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{12,40}$")


def _stats(doc):
    """Tempo, key name, bars, seconds and track count from a song document."""
    if not isinstance(doc, dict):
        return {"bpm": 100, "key_name": "C major", "bars": 0, "seconds": 0, "tracks": 0}
    if doc.get("from_recipe"):
        return {"bpm": DemoData.GENRE_BPM.get(doc.get("from_recipe"), 100), "key_name": "", "bars": 56,
                "seconds": int(56 * 4 * 60 / DemoData.GENRE_BPM.get(doc.get("from_recipe"), 100)), "tracks": 5}
    try:
        bpm = max(40, min(220, float(doc.get("bpm") or 100)))
    except (TypeError, ValueError):
        bpm = 100.0
    bars = 0
    for s in doc.get("sections") or []:
        if isinstance(s, dict):
            try:
                bars += int(s.get("bars") or 0)
            except (TypeError, ValueError):
                pass
    key = doc.get("key")
    key_name = "%s %s" % (NOTE_NAMES[int(key) % 12], doc.get("scale") or "major") if isinstance(key, (int, float)) else ""
    tracks = len(doc.get("tracks") or [])
    return {"bpm": round(bpm), "key_name": key_name, "bars": bars, "seconds": int(bars * 4 * 60 / bpm), "tracks": tracks}


def _clean_doc(doc):
    """The browser's JSON text (or dict) -> a dict we are willing to store, or a message."""
    if isinstance(doc, str):
        if len(doc) > MAX_DOC:
            return None, "This song has grown too big to save (over 600 KB). Remove some unused parts."
        try:
            doc = json.loads(doc)
        except ValueError:
            return None, "The song arrived damaged. Please try again."
    if not isinstance(doc, dict):
        return None, "The song arrived damaged. Please try again."
    if len(json.dumps(doc)) > MAX_DOC:
        return None, "This song has grown too big to save (over 600 KB). Remove some unused parts."
    for key, kind, limit in (("tracks", list, 32), ("clips", list, 3000), ("sections", list, 64)):
        v = doc.get(key)
        if v is not None and (not isinstance(v, kind) or len(v) > limit):
            return None, "That song has too many %s (the limit is %d)." % (key, limit)
    if not isinstance(doc.get("patterns", {}), dict) or len(doc.get("patterns", {})) > 1500:
        return None, "That song has too many parts."
    doc["title"] = C.text(doc.get("title") or "Untitled song", 80) or "Untitled song"
    return doc, None


def _summary(r, me):
    mine = me is not None and r["owner"] is not None and r["owner"] == me
    out = {"id": r.get_id(), "title": r["title"] or "Untitled song", "genre": r["genre"] or "hopecore", "bpm": r["bpm"] or 100,
           "key_name": r["key_name"] or "", "bars": r["bars"] or 0, "seconds": r["seconds"] or 0, "tracks": r["tracks"] or 0,
           "cover_seed": r["cover_seed"] or 1, "shared": bool(r["shared"]), "featured": bool(r["featured"]), "plays": r["plays"] or 0,
           "updated": C.iso(r["updated"]), "created": C.iso(r["created"]), "demo": bool(r["is_demo"]), "mine": mine,
           "by": C.name_of(r["owner"])}
    if mine:
        out["share_key"] = r["share_key"] if r["shared"] else None
    return out


def _row(song_id):
    if not isinstance(song_id, str) or not ID_RE.match(song_id):
        return None
    return C.row_by_id(app_tables.songs, song_id)


def _readable(r, me):
    """Your own songs, and anyone's shared, featured or demo songs (opened as a copy you can't save over)."""
    return r is not None and ((me is not None and r["owner"] == me) or r["shared"] or r["featured"] or r["is_demo"])


@anvil.server.callable(require_user=True)
def list_songs():
    me = C.require_user()
    rows = app_tables.songs.search(tables.order_by("updated", ascending=False), owner=me)
    return {"songs": [_summary(r, me) for r in rows[:MAX_SONGS]], "total": len(rows)}


@anvil.server.callable
def get_spotlight():
    """Shared songs the admin featured (and the demo songs), newest first: the Songs and Styles pages show them."""
    DemoData.ensure_loaded()
    me = C.me()
    rows = [r for r in app_tables.songs.search(tables.order_by("updated", ascending=False), featured=True) if r["shared"]]
    return {"songs": [_summary(r, me) for r in rows[:24]]}


@anvil.server.callable
def get_song(song_id):
    me = C.me()
    r = _row(song_id)
    if not _readable(r, me) or r is None:
        return C.fail("That song doesn't exist, or it's private.")
    mine = me is not None and r["owner"] == me
    return C.ok(song=dict(_summary(r, me), doc=r["doc"] or {}, takes=Takes.takes_for(r), can_edit=mine))


@anvil.server.callable(require_user=True)
def create_song(title, genre, doc):
    me = C.require_user()
    if genre not in GENRES:
        genre = "hopecore"
    clean, err = _clean_doc(doc)
    if err or clean is None:
        return C.fail(err or "The song arrived damaged.")
    if C.rate_limited("create_song", 40, 3600):
        return C.fail("That's a lot of new songs in one hour. Take a break and try again later.")
    if len(app_tables.songs.search(owner=me)) >= MAX_SONGS:
        return C.fail("You have %d songs, the most one account can keep. Delete some old ones first." % MAX_SONGS)
    clean["title"] = C.text(title, 80) or clean["title"]
    clean["takes"] = {}
    st = _stats(clean)
    r = app_tables.songs.add_row(owner=me, title=clean["title"], genre=genre, doc=clean, cover_seed=secrets.randbelow(99999) + 1,
                                 shared=False, featured=False, plays=0, created=C.now(), updated=C.now(), is_demo=False, **st)
    return C.ok(song=_summary(r, me))


@anvil.server.callable(require_user=True)
def save_song(song_id, doc):
    me = C.require_user()
    r = _row(song_id)
    if r is None or r["owner"] != me:
        return C.fail("You can only save your own songs.")
    clean, err = _clean_doc(doc)
    if err or clean is None:
        return C.fail(err or "The song arrived damaged.")
    genre = clean.get("genre") if clean.get("genre") in GENRES else r["genre"]
    r.update(doc=clean, title=clean["title"], genre=genre, updated=C.now(), **_stats(clean))
    return C.ok(updated=C.iso(r["updated"]))


@anvil.server.callable(require_user=True)
def rename_song(song_id, title):
    me = C.require_user()
    r = _row(song_id)
    if r is None or r["owner"] != me:
        return C.fail("You can only rename your own songs.")
    title = C.text(title, 80)
    if len(title) < 1:
        return C.fail("Give the song a name.")
    doc = dict(r["doc"] or {})
    doc["title"] = title
    r.update(title=title, doc=doc, updated=C.now())
    return C.ok(song=_summary(r, me))


@anvil.server.callable(require_user=True)
def delete_song(song_id):
    me = C.require_user()
    r = _row(song_id)
    if r is None:
        return C.ok()
    if r["owner"] != me and not C.is_admin(me):
        return C.fail("You can only delete your own songs.")
    Takes.delete_for(r)
    r.delete()
    return C.ok()


@anvil.server.callable(require_user=True)
def duplicate_song(song_id, doc=None):
    """A copy in your account: of your own song, or of a shared / demo song you opened (with its recordings).
    doc: the browser's current version (a demo built from its recipe, or edits you made before copying)."""
    me = C.require_user()
    r = _row(song_id)
    if not _readable(r, me) or r is None:
        return C.fail("That song doesn't exist, or it's private.")
    if len(app_tables.songs.search(owner=me)) >= MAX_SONGS:
        return C.fail("You have %d songs, the most one account can keep. Delete some old ones first." % MAX_SONGS)
    if C.rate_limited("create_song", 40, 3600):
        return C.fail("That's a lot of new songs in one hour. Take a break and try again later.")
    src = doc if doc else r["doc"]
    clean, err = _clean_doc(src)
    if err or clean is None:
        return C.fail(err or "The song arrived damaged.")
    mine = r["owner"] == me
    clean["title"] = C.text(("Copy of " if mine else "") + clean["title"], 80)
    n = app_tables.songs.add_row(owner=me, title=clean["title"], genre=r["genre"], doc=clean, cover_seed=secrets.randbelow(99999) + 1,
                                 shared=False, featured=False, plays=0, created=C.now(), updated=C.now(), is_demo=False, **_stats(clean))
    keys = Takes.copy_takes(r, n, me)
    if keys:
        clean["takes"] = {k: dict(v, key=keys.get(k, v.get("key"))) for k, v in (clean.get("takes") or {}).items() if isinstance(v, dict)}
        n["doc"] = clean
    return C.ok(song=_summary(n, me))


@anvil.server.callable(require_user=True)
def share_song(song_id, on):
    """Turn the public listen link on (a new address each time) or off (the old address stops working)."""
    me = C.require_user()
    r = _row(song_id)
    if r is None or r["owner"] != me:
        return C.fail("You can only share your own songs.")
    if on:
        r.update(shared=True, share_key=secrets.token_urlsafe(12))
    else:
        r.update(shared=False, share_key=None, featured=False)
    return C.ok(song=_summary(r, me))


@anvil.server.callable
def get_shared(key):
    """The listen page: a shared song by its link, for anyone (no account needed)."""
    key = str(key or "")
    r = app_tables.songs.get(share_key=key) if KEY_RE.match(key) else None
    if r is None or not r["shared"]:
        return C.fail("This link doesn't work any more. The owner may have stopped sharing the song.")
    me = C.me()
    return C.ok(song=dict(_summary(r, me), doc=r["doc"] or {}, takes=Takes.takes_for(r)))


@anvil.server.callable
def record_play(key):
    key = str(key or "")
    r = app_tables.songs.get(share_key=key) if KEY_RE.match(key) else None
    if r is None or not r["shared"] or C.rate_limited("play_" + key, 3, 600):
        return C.ok()
    r["plays"] = (r["plays"] or 0) + 1
    return C.ok(plays=r["plays"])
