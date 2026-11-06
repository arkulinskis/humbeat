"""Takes: the voice recordings in a song (16-bit mono WAV at 32 kHz, made in the browser).

Each take has a random key, the only way to fetch its sound (/_/api/take/<key>, with byte ranges for Safari). The
song document lists its takes as {take_id: {sec, key}}; the browser processes them (auto-tune, effects) itself.
Deleting a song deletes its takes; a copied song gets copies with new keys.
"""
import re
import secrets

import anvil
import anvil.server
from anvil.tables import app_tables

from . import common as C

MAX_BYTES = 13000000      # about 6 minutes at 32 kHz
MAX_SECONDS = 400
MAX_TAKES = 150           # per song
TAKE_RE = re.compile(r"^[A-Za-z0-9_\-]{2,40}$")
KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{16,48}$")


def _key():
    return secrets.token_urlsafe(18)


def takes_for(song):
    return {r["take_id"]: {"key": r["key"], "sec": r["seconds"] or 0} for r in app_tables.takes.search(song=song)}


def delete_for(song):
    for r in app_tables.takes.search(song=song):
        r.delete()


def copy_takes(src, dst, owner):
    """Copies src's recordings into dst (new keys). -> {take_id: new key}"""
    out = {}
    for r in app_tables.takes.search(song=src):
        k = _key()
        app_tables.takes.add_row(song=dst, owner=owner, take_id=r["take_id"], audio=r["audio"], seconds=r["seconds"], key=k,
                                 created=C.now(), is_demo=False)
        out[r["take_id"]] = k
    return out


@anvil.server.callable(require_user=True)
def save_take(song_id, take_id, audio, seconds):
    """Keeps one recording of your own song. -> {ok, key}"""
    me = C.require_user()
    song = C.row_by_id(app_tables.songs, song_id) if isinstance(song_id, str) else None
    if song is None or song["owner"] != me:
        return C.fail("You can only record into your own songs.")
    take_id = str(take_id or "")
    if not TAKE_RE.match(take_id):
        return C.fail("That recording has a broken name. Please record it again.")
    if not isinstance(audio, anvil.Media):
        return C.fail("The recording didn't arrive. Please try again.")
    ctype = (audio.content_type or "").split(";")[0].strip().lower()
    if ctype not in ("audio/wav", "audio/x-wav", "audio/wave"):
        return C.fail("That isn't a sound recording.")
    size = audio.length or 0
    if size < 1000:
        return C.fail("The recording was empty. Check your microphone and try again.")
    if size > MAX_BYTES:
        return C.fail("That recording is too long. Keep one take under 6 minutes.")
    if len(app_tables.takes.search(song=song)) >= MAX_TAKES and app_tables.takes.get(song=song, take_id=take_id) is None:
        return C.fail("This song has %d recordings, the most it can keep. Delete unused takes (File > Clean up)." % MAX_TAKES)
    if C.rate_limited("save_take", 120, 3600):
        return C.fail("That's a lot of recordings in one hour. Take a break and try again later.")
    try:
        secs = max(0.0, min(float(MAX_SECONDS), float(seconds)))
    except (TypeError, ValueError):
        secs = 0.0
    old = app_tables.takes.get(song=song, take_id=take_id)
    if old is not None:
        old.delete()
    k = _key()
    app_tables.takes.add_row(song=song, owner=me, take_id=take_id, audio=anvil.BlobMedia("audio/wav", audio.get_bytes(), name=take_id + ".wav"),
                             seconds=round(secs, 1), key=k, created=C.now(), is_demo=False)
    return C.ok(key=k)


@anvil.server.callable(require_user=True)
def delete_take(song_id, take_id):
    me = C.require_user()
    song = C.row_by_id(app_tables.songs, song_id) if isinstance(song_id, str) else None
    if song is None or song["owner"] != me:
        return C.fail("You can only change your own songs.")
    r = app_tables.takes.get(song=song, take_id=str(take_id or ""))
    if r is not None:
        r.delete()
    return C.ok()


def _range(raw, header):
    """(status, body bytes, extra headers) for a single "Range: bytes=a-b" request (Safari and iPhone need it)."""
    m = re.match(r"^bytes=(\d*)-(\d*)$", (header or "").strip())
    n = len(raw)
    if not m or (not m.group(1) and not m.group(2)):
        return 200, raw, {}
    if m.group(1):
        a = int(m.group(1))
        b = min(int(m.group(2)), n - 1) if m.group(2) else n - 1
    else:
        a, b = max(0, n - int(m.group(2))), n - 1
    if a >= n or a > b:
        return 416, b"", {"Content-Range": "bytes */%d" % n}
    return 206, raw[a:b + 1], {"Content-Range": "bytes %d-%d/%d" % (a, b, n)}


@anvil.server.http_endpoint("/take/:key")
def take_file(key, **kw):
    """The sound of one take. The key never changes for a take, so it is the ETag; no-cache means a deleted song's
    recordings stop at once (the browser asks again each time and gets a cheap 304 while they exist)."""
    key = str(key or "")
    row = app_tables.takes.get(key=key) if KEY_RE.match(key) else None
    if row is None or row["audio"] is None:
        return anvil.server.HttpResponse(404, "Not found", headers={"Content-Type": "text/plain"})
    etag = '"%s"' % key
    headers = {"Content-Type": "audio/wav", "Cache-Control": "private, no-cache", "ETag": etag, "Accept-Ranges": "bytes",
               "Access-Control-Allow-Origin": "*"}
    req = getattr(anvil.server, "request", None)
    req_headers = (getattr(req, "headers", None) or {}) if req is not None else {}
    if req_headers.get("if-none-match") == etag:
        return anvil.server.HttpResponse(304, "", headers=headers)
    raw = row["audio"].get_bytes()
    rng = req_headers.get("range")
    status, body, extra = _range(raw, rng) if rng else (200, raw, {})
    headers.update(extra)
    return anvil.server.HttpResponse(status, anvil.BlobMedia("audio/wav", body), headers=headers)
