"""Demo content, so a first visitor hears the app alive: fictional people and their shared songs in the spotlight.
Loaded the first time anyone opens the app (ensure_loaded), removed or reloaded from Admin -> Demo data; removing it
is remembered. Demo users have is_demo=True and @example.com emails and can't sign in (no password). Every demo row is
flagged is_demo=True, so remove() deletes exactly what load() added.

A demo song's document is {"from_recipe": genre, "seed": n, "title": ...}: the browser builds the full arrangement
from that genre's recipe (theme/assets/hb-music.js), so demo songs stay small and always match the current engine.
They have no recorded vocals (we don't ship anyone's voice); their words are in the lyrics, ready to sing.
"""
import datetime as dt

from anvil.tables import app_tables

from . import common as C

GENRE_BPM = {"hopecore": 78, "mumble": 140, "metal": 160, "pop80": 117, "teenpop": 96, "storypop": 120, "lofi": 82, "house": 124,
             "synthwave": 100, "reggaeton": 94, "poppunk": 172, "drill": 142, "afrobeats": 104, "ballad": 68, "futurebass": 150,
             "hyperpop": 160, "disco": 118, "boombap": 90}
DEMO_USERS = [
    ("Maya Chen", "maya.demo@example.com"),
    ("Dre Okafor", "dre.demo@example.com"),
    ("Ines Ozola", "ines.demo@example.com"),
    ("Sam Kowalczyk-Delacroix-Hargreaves", "sam.demo@example.com"),
]
# (who, title, genre, seed, plays, days ago)
DEMO_SONGS = [
    (0, "Lighter Every Day", "hopecore", 11, 412, 2),
    (1, "Phone Face Down", "mumble", 23, 1288, 5),
    (2, "Iron Sky", "metal", 7, 230, 9),
    (3, "Neon Floor", "pop80", 31, 657, 1),
    (0, "Second World", "teenpop", 5, 318, 12),
    (2, "Passenger Seat", "storypop", 17, 902, 3),
    (1, "Cold Coffee Rain", "lofi", 9, 2041, 20),
    (3, "Chrome Horizon", "synthwave", 44, 140, 7),
    (2, "Sunshine on My Skin", "afrobeats", 13, 377, 15),
    (0, "Hallway Light", "ballad", 3, 96, 30),
]
DEMO_TABLES = ["takes", "songs"]  # children before parents


def state():
    return C.get_setting("demo", "never")  # "never" | "loaded" | "removed"


def ensure_loaded():
    """Call from the app's main public callables: loads the demo once, unless an admin removed it."""
    if state() == "never":
        load()


def load():
    remove(remember=False)
    users = []
    for name, email in DEMO_USERS:
        u = app_tables.users.get(email=email) or app_tables.users.add_row(email=email, enabled=False)
        u.update(display_name=name, is_demo=True, signed_up=C.now() - dt.timedelta(days=60))
        users.append(u)
    for i, (who, title, genre, seed, plays, days) in enumerate(DEMO_SONGS):
        bpm = GENRE_BPM[genre]
        when = C.now() - dt.timedelta(days=days, hours=i)
        app_tables.songs.add_row(owner=users[who], title=title, genre=genre, doc={"from_recipe": genre, "seed": seed, "title": title},
                                 bpm=bpm, key_name="", bars=56, seconds=int(56 * 4 * 60 / bpm), tracks=5, cover_seed=seed * 97 + 13,
                                 share_key="demo-%s-%02d-song" % (genre, i), shared=True, featured=True, plays=plays,
                                 created=when, updated=when, is_demo=True)
    C.set_setting("demo", "loaded")
    return counts()


def remove(remember=True):
    for name in DEMO_TABLES:
        for r in getattr(app_tables, name).search(is_demo=True):
            r.delete()
    for u in app_tables.users.search(is_demo=True):
        u.delete()
    if remember:
        C.set_setting("demo", "removed")
    return counts()


def counts():
    out = {"users": len(app_tables.users.search(is_demo=True))}
    for name in DEMO_TABLES:
        out[name] = len(getattr(app_tables, name).search(is_demo=True))
    return out
