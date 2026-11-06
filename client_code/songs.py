"""Where songs live: members' songs on the server (Songs.py / Takes.py), a visitor's one song in this browser
(the document in localStorage, its recordings in IndexedDB). The studio and the Songs page go through here."""
import json

import anvil.js
import anvil.server
from anvil.js import window

from . import hb, state

GUEST_KEY = "guest.song"


def guest_doc():
    """The visitor's song from this browser (a JS object in storage -> a plain Python dict), or None."""
    raw = window.localStorage.getItem("humbeat." + GUEST_KEY)
    if not raw or raw == "null":
        return None
    try:
        d = json.loads(raw)
    except ValueError:
        return None
    return d if isinstance(d, dict) and d.get("tracks") is not None else None


def save_guest(doc_json):
    state.store_set(GUEST_KEY, json.loads(doc_json))


def clear_guest():
    state.store_set(GUEST_KEY, None)


def new_song(genre, title, empty=False):
    """Make a song from a style. -> the address to open ('#studio/<id>' for members, '#studio' for visitors)."""
    doc = hb.new_doc(genre, title or None, empty)
    if title:
        doc["title"] = title
    if not state.me():
        save_guest(json.dumps(doc))
        return ["studio"]
    r = state.call("create_song", doc["title"], genre, json.dumps(doc))
    if not r:
        return None
    return ["studio", r["song"]["id"]]


def upload_take(song_id, take_id, blob, seconds):
    """A recording (WAV Blob) into a member's song. -> its key, or None."""
    media = anvil.js.to_media(blob)
    r = anvil.server.call_s("save_take", song_id, take_id, media, seconds)
    if isinstance(r, dict) and r.get("ok"):
        return r["key"]
    if isinstance(r, dict):
        state.toast(r.get("error") or "The recording could not be saved.", "error")
    return None


def import_guest():
    """After signing up: the song made as a visitor moves into the account, recordings included. -> new song id."""
    doc = guest_doc()
    if not doc:
        return None
    r = state.call("create_song", doc.get("title") or "My first song", doc.get("genre") or "hopecore", json.dumps(dict(doc, takes={})))
    if not r:
        return None
    sid = r["song"]["id"]
    takes = doc.get("takes") or {}
    moved = {}
    for tid, meta in takes.items():
        try:
            blob = window.HB.store.get(tid)
        except Exception:
            blob = None
        if not blob:
            continue
        key = upload_take(sid, tid, blob, meta.get("sec") or 0)
        if key:
            moved[tid] = dict(meta, key=key)
            moved[tid].pop("local", None)
    doc["takes"] = moved
    state.call("save_song", sid, json.dumps(doc))
    clear_guest()
    for tid in moved:
        try:
            window.HB.store["del"](tid)
        except Exception:
            pass
    return sid
