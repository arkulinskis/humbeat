"""Server tests against the strict mock of Anvil (tools/testing/mock).

    python tools/testing/test_server.py          -> prints ALL OK, or the first failure

call(name, ...) runs a server function the way the browser does: by name, with require_user enforced,
and the reply must be JSON (a datetime or a row in a reply fails here, like it would break the page).
Add tests for every new server function: the happy path, bad input, and someone who isn't allowed.
"""
import datetime as dt
import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
PROJECT = HERE.parents[1]
_tmp = pathlib.Path(tempfile.mkdtemp())
shutil.copytree(PROJECT / "server_code", _tmp / "app")
(_tmp / "app" / "__init__.py").write_text("")
os.environ["ANVIL_APP_YAML"] = str(PROJECT / "anvil.yaml")  # the mock's tables follow the app's own schema
sys.path[:0] = [str(HERE / "mock"), str(_tmp)]
import anvil.server  # noqa: E402
import anvil.users  # noqa: E402
from anvil.tables import app_tables as T  # noqa: E402

M = {p.stem: importlib.import_module("app." + p.stem) for p in sorted((PROJECT / "server_code").glob("*.py"))}
now = dt.datetime.now(dt.timezone.utc)


def call(name, *args):
    r = anvil.server.call(name, *args)
    json.dumps(r)  # strict: must be JSON-able
    return r


def as_user(row):
    anvil.users.CURRENT[0] = row
    anvil.server.session.use(row.get_id() if row is not None else None)


def denied(name, *args):
    try:
        call(name, *args)
    except anvil.server.PermissionDenied:
        return True
    return False


def ok(r, msg=""):
    assert isinstance(r, dict) and r.get("ok"), (msg, r)
    return r


def bad(r, msg=""):
    assert isinstance(r, dict) and r.get("ok") is False and r.get("error"), (msg, r)
    return r


def person(email, name=None, **kw):
    return T.users.add_row(email=email, enabled=True, signed_up=now, display_name=name, **kw)


# ---------------------------------------------------------------------------------- accounts
admin = person("arkulinskis@gmail.com", "The Admin")
ana = person("ana@example.com", "Ana")
bob = person("bob@example.com")

as_user(None)
assert call("get_me") is None
assert denied("update_profile", "X")
as_user(admin)
assert call("get_me")["is_admin"] is True, "ADMIN_EMAILS become admins on first sign-in"
as_user(ana)
me = call("get_me")
assert me["name"] == "Ana" and me["is_admin"] is False
assert ana["last_seen"] is not None
as_user(bob)
assert call("get_me")["name"] == "Bob", "a name comes from the email when none is set"
bad(call("update_profile", " x "))
assert ok(call("update_profile", "  Bob   Stone "))["me"]["name"] == "Bob Stone"

# ---------------------------------------------------------------------------------- feedback
as_user(None)
bad(call("submit_feedback", "bug", "hi"))
ok(call("submit_feedback", "bug", "The button is broken", "guest@example.com", {"page": "#home", "evil": "x" * 9999}))
fb = T.feedback.search()[0]
assert fb["name"] == "Guest" and fb["email"] == "guest@example.com" and "evil" not in fb["context"] and fb["status"] == "new"
for i in range(4):
    ok(call("submit_feedback", "idea", "Idea number %d" % i))
bad(call("submit_feedback", "idea", "One too many this hour"), "rate limit")
as_user(ana)
ok(call("submit_feedback", "nonsense-kind", "Signed-in feedback"))
assert T.feedback.get(message="Signed-in feedback")["kind"] == "other"
assert denied("list_feedback")
as_user(admin)
lst = call("list_feedback")
assert lst["counts"]["new"] == 6 and len(lst["items"]) == 6
fid = lst["items"][0]["id"]
ok(call("set_feedback_status", fid, "done", "Fixed it"))
assert call("list_feedback", "done")["items"][0]["note"] == "Fixed it"
bad(call("set_feedback_status", fid, "weird"))
bad(call("set_feedback_status", "nope", "done"))
ok(call("delete_feedback", fid))
assert len(call("list_feedback")["items"]) == 5

# ---------------------------------------------------------------------------------- admin
as_user(ana)
for fn, args in [("admin_overview", ()), ("list_users", ()), ("set_admin", (bob.get_id(), True)), ("demo_load", ()), ("demo_remove", ())]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["users"] == 3 and ov["admins"] == 1 and ov["feedback_new"] == 5
assert len(call("list_users")["users"]) == 3 and len(call("list_users", "bob")["users"]) == 1
ok(call("set_admin", bob.get_id(), True))
assert bob["is_admin"] is True
bad(call("set_admin", admin.get_id(), False), "can't remove your own admin")
ok(call("set_enabled", bob.get_id(), False))
assert bob["enabled"] is False
bad(call("set_enabled", admin.get_id(), False))
ok(call("set_enabled", bob.get_id(), True))
ok(call("set_admin", bob.get_id(), False))
assert bob["is_admin"] is False

# ---------------------------------------------------------------------------------- demo data + songs
import anvil
DOC = {"v": 1, "title": "Night Bus", "genre": "hopecore", "bpm": 78, "key": 2, "scale": "major",
       "sections": [{"id": "s1", "kind": "verse", "name": "Verse", "bars": 8}, {"id": "s2", "kind": "chorus", "name": "Chorus", "bars": 8}],
       "tracks": [{"id": "t1", "kind": "drums"}, {"id": "t2", "kind": "voice"}], "clips": [], "patterns": {}, "takes": {}, "lyrics": {"s1": "late bus home"}}
as_user(None)
spot = call("get_spotlight")["songs"]
assert M["DemoData"].state() == "loaded" and len(spot) == len(M["DemoData"].DEMO_SONGS), "demo songs load on first visit"
assert all(x["shared"] and x["featured"] and not x["mine"] and "share_key" not in x for x in spot), "no owner-only fields for visitors"
demo = spot[0]
r = ok(call("get_song", demo["id"]))
assert r["song"]["doc"]["from_recipe"] and r["song"]["can_edit"] is False, "a demo song opens read-only, built from its recipe"
assert denied("list_songs") and denied("create_song", "x", "hopecore", "{}")

as_user(ana)
bad(call("create_song", "x", "hopecore", "not json"))
bad(call("create_song", "x", "hopecore", "[1, 2]"))
bad(call("create_song", "x", "hopecore", {"tracks": list(range(40))}), "too many tracks")
bad(call("create_song", "x", "hopecore", "x" * 700000), "too big")
song = ok(call("create_song", "  Night   Bus ", "no-such-genre", json.dumps(DOC)))["song"]
assert song["title"] == "Night Bus" and song["genre"] == "hopecore" and song["bpm"] == 78 and song["bars"] == 16 and song["key_name"] == "D major"
assert song["seconds"] == int(16 * 4 * 60 / 78) and song["mine"] and song["share_key"] is None
sid = song["id"]
assert call("list_songs")["total"] == 1
doc2 = dict(DOC, title="Night Bus (final)", bpm=90)
ok(call("save_song", sid, json.dumps(doc2)))
got = ok(call("get_song", sid))["song"]
assert got["title"] == "Night Bus (final)" and got["bpm"] == 90 and got["can_edit"] and got["doc"]["lyrics"]["s1"] == "late bus home"
bad(call("save_song", sid, "{broken"))
ok(call("rename_song", sid, "Night Bus Home"))
bad(call("rename_song", sid, "   "))

# takes: only the owner records; WAV only; empty and huge refused; endpoint with ranges and ETag
wav = anvil.BlobMedia("audio/wav", b"RIFF" + b"\x00" * 4000, name="t.wav")
bad(call("save_take", sid, "bad id!", wav, 2))
bad(call("save_take", sid, "k1", anvil.BlobMedia("text/plain", b"x" * 2000), 2), "not audio")
bad(call("save_take", sid, "k1", anvil.BlobMedia("audio/wav", b"x" * 10), 2), "empty")
bad(call("save_take", sid, "k1", anvil.BlobMedia("audio/wav", b"x" * 14000000), 2), "too long")
key = ok(call("save_take", sid, "k1", wav, 2.04))["key"]
assert ok(call("get_song", sid))["song"]["takes"] == {"k1": {"key": key, "sec": 2.0}}
key2 = ok(call("save_take", sid, "k1", wav, 3))["key"]
assert key2 != key and len(T.takes.search()) == 1, "recording the same take again replaces it"
ep = anvil.server.ENDPOINTS["/take/:key"]
assert ep(key=key).status == 404, "the old key stops working"
anvil.server.request.headers = {}
full = ep(key=key2)
assert full.status == 200 and full.headers["ETag"] == '"%s"' % key2 and full.headers["Cache-Control"] == "private, no-cache"
anvil.server.request.headers = {"range": "bytes=0-99"}
part = ep(key=key2)
assert part.status == 206 and part.headers["Content-Range"] == "bytes 0-99/4004" and len(part.body.get_bytes()) == 100
anvil.server.request.headers = {"if-none-match": '"%s"' % key2}
assert ep(key=key2).status == 304
anvil.server.request.headers = {}
assert ep(key="../../etc").status == 404

as_user(bob)
bad(call("get_song", sid), "a private song is private")
bad(call("save_song", sid, json.dumps(DOC)), "no saving over someone else's song")
bad(call("save_take", sid, "k2", wav, 2), "no recording into someone else's song")
bad(call("share_song", sid, True))
bad(call("delete_song", sid))
bad(call("delete_take", sid, "k1"))

as_user(ana)
shared = ok(call("share_song", sid, True))["song"]
skey = shared["share_key"]
assert shared["shared"] and skey
as_user(None)
pub = ok(call("get_shared", skey))["song"]
assert pub["title"] == "Night Bus Home" and pub["takes"]["k1"]["key"] == key2 and "share_key" not in pub
bad(call("get_shared", "nope-not-a-key"))
for _ in range(4):
    ok(call("record_play", skey))
assert T.songs.get(share_key=skey)["plays"] == 3, "plays are counted, a few per visitor"
as_user(bob)
copy = ok(call("duplicate_song", sid, None))["song"]
assert copy["title"] == "Night Bus Home" and copy["mine"] and not copy["shared"], "a shared song can be copied"
copied_takes = ok(call("get_song", copy["id"]))["song"]["takes"]
assert copied_takes["k1"]["key"] != key2, "a copy gets its own recording keys"
copy2 = ok(call("duplicate_song", demo["id"], json.dumps(dict(DOC, title="My take on it"))))["song"]
assert copy2["title"] == "My take on it", "copying a demo keeps the version the browser built"
as_user(ana)
ok(call("share_song", sid, False))
as_user(None)
bad(call("get_shared", skey), "turning sharing off kills the link")

# admin: spotlight and moderation
as_user(ana)
ok(call("share_song", sid, True))
for fn, args in [("admin_songs", ()), ("admin_feature", (sid, True)), ("admin_unshare", (sid,))]:
    assert denied(fn, *args), fn
as_user(admin)
ov = call("admin_overview")
assert ov["songs"] == len(M["DemoData"].DEMO_SONGS) + 3 and ov["shared"] == len(M["DemoData"].DEMO_SONGS) + 1 and ov["takes"] == 2, ov
lst = call("admin_songs", "night")["songs"]
assert len(lst) == 1 and lst[0]["by"] == "Ana"
ok(call("admin_feature", sid, True))
as_user(None)
assert any(x["id"] == sid for x in call("get_spotlight")["songs"])
as_user(admin)
ok(call("admin_unshare", sid))
assert not T.songs.get_by_id(sid)["shared"] and not T.songs.get_by_id(sid)["featured"]
bad(call("admin_feature", sid, True), "only shared songs go in the spotlight")

as_user(ana)
ok(call("delete_song", sid))
assert len(T.takes.search()) == 1, "deleting a song deletes its recordings (the copy keeps its own)"
assert call("list_songs")["total"] == 0

# demo data on and off
as_user(admin)
ok(call("demo_remove"))
assert M["DemoData"].state() == "removed" and not T.users.search(is_demo=True)
assert len(T.songs.search()) == 2, "removing demo data keeps real songs (the two copies)"
as_user(None)
call("get_spotlight")
assert M["DemoData"].state() == "removed", "removed demo data doesn't come back by itself"
as_user(admin)
ok(call("demo_load"))
ok(call("demo_load"))
assert len(T.songs.search(is_demo=True)) == len(M["DemoData"].DEMO_SONGS), "reloading replaces the demo instead of doubling it"

# ---------------------------------------------------------------------------------- Privacy & Terms
if "legal_server" in M:
    as_user(ana)
    st = call("legal_state")
    assert st["signedIn"] and st["accepted_version"] is None
    ok(call("legal_accept", st["version"], "signup"))
    assert ana["legal_source"] == "signup" and call("legal_state")["accepted_version"] == st["version"]

# ---------------------------------------------------------------------------------- schema check (App Board): names only, never data
r = anvil.server.ENDPOINTS["/schema-check"](tables="users, songs,no_such_table")
json.dumps(r)
assert "email" in r["tables"]["users"] and "title" in r["tables"]["songs"] and r["tables"]["no_such_table"] is None, r

# ---------------------------------------------------------------------------------- every callable is covered by a permission check
# A callable that changes data without require_user / a C.require_* check is a security hole. List the public ones here.
PUBLIC = {"get_me", "submit_feedback", "get_spotlight", "get_song", "get_shared", "record_play", "legal_state", "legal_accept"}
for name, (f, need) in sorted(anvil.server.CALLABLES.items()):
    if name in PUBLIC:
        continue
    assert need, "%s is callable by anyone: add require_user=True (or list it in PUBLIC in test_server.py)" % name

print("ALL OK (%d server functions)" % len(anvil.server.CALLABLES))
