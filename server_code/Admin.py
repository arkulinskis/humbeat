"""Admin page callables: overview, songs (feature in the spotlight, stop sharing), users (make admin, disable), demo data.
Admins only. Feedback admin calls live in Feedback.py."""
import anvil.server
from anvil.tables import app_tables
import anvil.tables as tables

from . import common as C
from . import DemoData, Feedback


@anvil.server.callable(require_user=True)
def admin_overview():
    C.require_admin()
    return {"users": len([u for u in app_tables.users.search() if not u["is_demo"]]),
            "admins": len(app_tables.users.search(is_admin=True)),
            "feedback_new": Feedback.new_count(),
            "songs": len(app_tables.songs.search()),
            "shared": len(app_tables.songs.search(shared=True)),
            "takes": len(app_tables.takes.search()),
            "demo": {"state": DemoData.state(), "counts": DemoData.counts()}}


def _user(u):
    return {"id": u.get_id(), "email": u["email"], "name": C.name_of(u), "is_admin": C.is_admin(u),
            "enabled": u["enabled"] is not False, "joined": C.iso(u["signed_up"]), "last_seen": C.iso(u["last_seen"])}


@anvil.server.callable(require_user=True)
def list_users(query=None):
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [u for u in app_tables.users.search(tables.order_by("signed_up", ascending=False)) if not u["is_demo"]]
    if query:
        rows = [u for u in rows if query in (u["email"] or "").lower() or query in (u["display_name"] or "").lower()]
    return {"users": [_user(u) for u in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def set_admin(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me and not flag:
        return C.fail("You can't remove your own admin rights.")
    u["is_admin"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def set_enabled(user_id, flag):
    me = C.require_admin()
    u = C.row_by_id(app_tables.users, user_id)
    if u is None:
        return C.fail("That account no longer exists.")
    if u == me:
        return C.fail("You can't disable your own account.")
    u["enabled"] = bool(flag)
    return C.ok(user=_user(u))


@anvil.server.callable(require_user=True)
def demo_load():
    C.require_admin()
    DemoData.load()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


@anvil.server.callable(require_user=True)
def demo_remove():
    C.require_admin()
    DemoData.remove()
    return C.ok(demo={"state": DemoData.state(), "counts": DemoData.counts()})


def _song(r):
    return {"id": r.get_id(), "title": r["title"] or "Untitled song", "genre": r["genre"] or "", "by": C.name_of(r["owner"]),
            "shared": bool(r["shared"]), "featured": bool(r["featured"]), "plays": r["plays"] or 0, "demo": bool(r["is_demo"]),
            "updated": C.iso(r["updated"]), "share_key": r["share_key"] if r["shared"] else None}


@anvil.server.callable(require_user=True)
def admin_songs(query=None):
    """Shared songs (the ones the public can hear), newest first: feature them in the spotlight or stop sharing."""
    C.require_admin()
    query = C.text(query, 80).lower()
    rows = [r for r in app_tables.songs.search(tables.order_by("updated", ascending=False), shared=True)]
    if query:
        rows = [r for r in rows if query in (r["title"] or "").lower() or query in C.name_of(r["owner"]).lower()]
    return {"songs": [_song(r) for r in rows[:200]], "total": len(rows)}


@anvil.server.callable(require_user=True)
def admin_feature(song_id, flag):
    C.require_admin()
    r = C.row_by_id(app_tables.songs, song_id)
    if r is None or not r["shared"]:
        return C.fail("That song isn't shared any more.")
    r["featured"] = bool(flag)
    return C.ok(song=_song(r))


@anvil.server.callable(require_user=True)
def admin_unshare(song_id):
    """Moderation: take a song off its public link (its owner can share it again, with a new link)."""
    C.require_admin()
    r = C.row_by_id(app_tables.songs, song_id)
    if r is None:
        return C.ok()
    r.update(shared=False, featured=False, share_key=None)
    return C.ok(song=_song(r))
