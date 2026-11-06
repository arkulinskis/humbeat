"""Page addresses: #name/arg1/arg2 -> a page Form (open_form), with sign-in rules.

Links in templates are plain <a href="#home">; code calls router.go("studio", id).

    PAGES[name] = (who may open it, browser-tab title)   who: None = anyone, "guest" = signed out only, "user", "admin"
    NAV = the main menu for members (header + phone tab bar): (page, label, icon). At most 4. GUEST_NAV for visitors.
New page: add it to PAGES, to _form() and (if it belongs in the menu) to NAV.
"""
import anvil
import anvil.js
from anvil.js import window

from . import state

PAGES = {
    "landing": (None, "Make any song"),
    "auth": ("guest", "Sign in"),
    "home": ("user", "Your songs"),
    "studio": (None, "Studio"),
    "styles": (None, "Styles"),
    "learn": (None, "How songs are made"),
    "listen": (None, "Listen"),
    "profile": ("user", "Your profile"),
    "admin": ("admin", "Admin"),
}
NAV = [("home", "Songs", "music"), ("studio", "Studio", "mixer"), ("styles", "Styles", "disc"), ("learn", "Learn", "book")]
GUEST_NAV = [("studio", "Studio", "mixer"), ("styles", "Styles", "disc"), ("learn", "Learn", "book")]
APP_NAME = "Humbeat"
_r: dict = {"after": "", "listening": False, "page": None}


def _form(name):
    """The page's Form class (imported when first needed, so start-up stays quick)."""
    if name == "landing":
        from .Pages.Landing import Landing
        return Landing
    if name == "auth":
        from .Pages.Auth import Auth
        return Auth
    if name == "home":
        from .Pages.Home import Home
        return Home
    if name == "studio":
        from .Pages.Studio import Studio
        return Studio
    if name == "styles":
        from .Pages.Styles import Styles
        return Styles
    if name == "learn":
        from .Pages.Learn import Learn
        return Learn
    if name == "listen":
        from .Pages.Listen import Listen
        return Listen
    if name == "profile":
        from .Pages.Profile import Profile
        return Profile
    from .Pages.Admin import Admin
    return Admin


def parse(hash_text):
    h = (hash_text or "").lstrip("#").lstrip("!").lstrip("/").split("?")[0]
    parts = [window.decodeURIComponent(p) for p in h.split("/") if p]
    return (parts[0] if parts else ""), parts[1:]


def href(name, *args):
    """'#name/arg1/arg2' with every part URL-encoded (row ids contain brackets and commas)."""
    return "#" + "/".join([name] + [window.encodeURIComponent(str(a)) for a in args if a not in (None, "")])


def home_page():
    return "home" if state.me() else "landing"


def nav():
    return NAV if state.me() else GUEST_NAV


def show():
    """Open the page for the current address."""
    name, args = parse(window.location.hash)
    if name not in PAGES:
        name, args = home_page(), []
    who = PAGES[name][0]
    if who == "guest" and state.me():
        name, args = "home", []
    elif who in ("user", "admin") and not state.me():
        _r["after"] = window.location.hash
        name, args = "auth", []
    elif who == "admin" and not state.is_admin():
        state.toast("That page is for admins only.", "error")
        name, args = "home", []
    old = _r["page"]
    if old is not None and hasattr(old, "leave"):
        old.leave()  # the studio saves and lets go of the microphone and the sound
    window.HB.stopPreview()
    window.document.title = PAGES[name][1] + " · " + APP_NAME
    window.UI_READY = False
    page = _form(name)(args=args)
    _r["page"] = page
    anvil.open_form(page)
    shell = getattr(page, "layout", None)
    if shell is not None and hasattr(shell, "refresh"):
        shell.refresh(name)  # Anvil reuses the layout between pages: tell it who is signed in and which page is open
    window.scrollTo(0, 0)
    window.UI_READY = True  # tests and screenshots wait for this


def go(name, *args):
    """Go to a page. Same address again = reload the page."""
    target = href(name, *args)
    if window.location.hash == target:
        show()
    else:
        window.location.hash = target


def replace(name, *args):
    """Change the address without opening anything (a page that switches its own view)."""
    window.history.replaceState(None, "", href(name, *args))


def after_sign_in():
    """Where to go once someone signs in: the page they were heading for, or home."""
    target = _r["after"]
    _r["after"] = ""
    if target and target != window.location.hash:
        window.location.hash = target
    else:
        go("home")


def remember_after(target):
    _r["after"] = target


def _on_hash(event):
    show()


def _on_click(event):
    """Anvil's <base href> makes '#x' links reload the whole app when the address has a ?query: set the hash instead."""
    t = event.target
    a = t.closest("a[href^='#']") if t is not None and getattr(t, "closest", None) else None
    if a is None or event.defaultPrevented or event.button or event.ctrlKey or event.metaKey or a.getAttribute("target"):
        return
    event.preventDefault()
    h = a.getAttribute("href")
    if window.location.hash == h:
        show()
    else:
        window.location.hash = h


def start():
    if not _r["listening"]:
        window.addEventListener("hashchange", anvil.js.report_exceptions(_on_hash))
        window.document.addEventListener("click", anvil.js.report_exceptions(_on_click))
        _r["listening"] = True
    show()
