"""Reactions: listeners tap Fire / Love / Laugh / Chills at a moment of a shared song (no account, no words, so
nothing to moderate). The listen page shows every tap as a marker on the song's strip; the owner sees how many and
the moment people reacted to most (Songs list and the Share dialog).

Each tap is one row (song, seconds into the song, kind). The count also goes into songs.reacts (an optional column:
read and written through guards, so the live app keeps working until the schema change is accepted).
"""
import hashlib
import re

import anvil.server
import anvil.tables as tables
from anvil.tables import app_tables

from . import common as C

KINDS = ("fire", "love", "laugh", "chills")
KIND_NAMES = {"fire": "Fire", "love": "Love", "laugh": "Laugh", "chills": "Chills"}
KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{12,40}$")
BUCKET = 2.0          # seconds per marker on the strip
MAX_ROWS = 3000       # newest taps read for one song
SUNG = ("verse", "pre", "chorus", "bridge")


def count_of(r):
    """songs.reacts, or 0 before the column exists."""
    try:
        return int(r["reacts"] or 0)
    except Exception:
        return 0


def _bump(r, n):
    try:
        r["reacts"] = max(0, count_of(r) + n)
    except Exception:
        pass


def _who():
    try:
        fn = getattr(anvil.server, "get_session_id", None)
        sid = fn() if fn else ""
    except Exception:
        sid = ""
    return hashlib.sha256(("hb-react:" + str(sid)).encode("utf-8")).hexdigest()[:16] if sid else "anon"


def _rows(r):
    try:
        return list(app_tables.reactions.search(tables.order_by("created", ascending=False), song=r)[:MAX_ROWS])
    except Exception:
        return []


def buckets(r):
    """[{t, kind, n}] with t rounded to BUCKET seconds, plus the totals per kind."""
    groups, totals = {}, {k: 0 for k in KINDS}
    for x in _rows(r):
        kind = x["kind"] if x["kind"] in KINDS else "fire"
        t = round(float(x["t"] or 0) / BUCKET) * BUCKET
        groups[(t, kind)] = groups.get((t, kind), 0) + 1
        totals[kind] += 1
    marks = [{"t": t, "kind": k, "n": n} for (t, k), n in sorted(groups.items())]
    return marks, totals


def section_at(doc, seconds):
    """The name of the section playing `seconds` into a song document ('' if unknown)."""
    if not isinstance(doc, dict):
        return ""
    try:
        bpm = max(40.0, min(220.0, float(doc.get("bpm") or 100)))
    except (TypeError, ValueError):
        bpm = 100.0
    at = 0.0
    for s in doc.get("sections") or []:
        if not isinstance(s, dict):
            continue
        try:
            length = float(s.get("bars") or 0) * 4 * 60 / bpm
        except (TypeError, ValueError):
            length = 0
        if seconds < at + length:
            return str(s.get("name") or "")
        at += length
    return ""


def top_moment(r, marks=None):
    """The 4-second stretch people reacted to most: {t, n, section, kind} or None."""
    if marks is None:
        marks, _ = buckets(r)
    if not marks:
        return None
    per, kinds = {}, {}
    for m in marks:
        slot = int(m["t"] // 4) * 4
        per[slot] = per.get(slot, 0) + m["n"]
        kinds.setdefault(slot, {})
        kinds[slot][m["kind"]] = kinds[slot].get(m["kind"], 0) + m["n"]
    slot = max(per, key=lambda s: (per[s], -s))
    kind = max(kinds[slot], key=lambda k: kinds[slot][k])
    doc = r["doc"] or {}
    return {"t": slot, "n": per[slot], "kind": kind, "kind_name": KIND_NAMES[kind],
            "section": "" if doc.get("from_recipe") else section_at(doc, slot + 1)}


def delete_for(r):
    for x in _rows(r):
        x.delete()


@anvil.server.callable
def react(key, t, kind):
    """A listener's tap on a shared song (anyone, no account). -> {ok, total}"""
    key = str(key or "")
    r = app_tables.songs.get(share_key=key) if KEY_RE.match(key) else None
    if r is None or not r["shared"]:
        return C.fail("This song isn't shared any more.")
    if kind not in KINDS:
        return C.fail("Pick one of the reactions.")
    try:
        t = float(t)
    except (TypeError, ValueError):
        return C.fail("That moment isn't in the song.")
    longest = float(r["seconds"] or 0) + 30
    if t != t or t < 0 or t > max(longest, 60):
        return C.fail("That moment isn't in the song.")
    if C.rate_limited("react_" + key, 40, 3600):
        return C.fail("That's a lot of reactions to one song. Thanks: give it a rest for a while.")
    app_tables.reactions.add_row(song=r, t=round(t, 1), kind=kind, who=_who(), created=C.now(), is_demo=False)
    _bump(r, 1)
    return C.ok(total=count_of(r))


@anvil.server.callable(require_user=True)
def song_reactions(song_id):
    """For the owner (Share dialog): how many reactions, per kind, and the moment people liked most."""
    me = C.require_user()
    r = C.row_by_id(app_tables.songs, song_id) if isinstance(song_id, str) and len(song_id) < 80 else None
    if r is None or r["owner"] != me:
        return C.fail("You can only see reactions to your own songs.")
    marks, totals = buckets(r)
    return C.ok(total=sum(totals.values()), totals=totals, top=top_moment(r, marks))


def add_demo(song_row, seed):
    """A few believable taps on a demo song (used by DemoData.load)."""
    secs = float(song_row["seconds"] or 120)
    x = seed * 7919 % 1000
    n = 6 + seed % 9
    for i in range(n):
        x = (x * 37 + 11) % 1000
        # cluster around the first chorus (about a third in) and the last one
        centre = secs * (0.34 if i % 3 else 0.78)
        t = max(1.0, min(secs - 1, centre + (x / 1000.0 - 0.5) * 12))
        app_tables.reactions.add_row(song=song_row, t=round(t, 1), kind=KINDS[(x + i) % 4], who="demo",
                                     created=C.now(), is_demo=True)
    _bump(song_row, n)
