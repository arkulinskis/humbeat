"""Small helpers shared by the ribbon tabs (client_code/Ribbon/*): toggle buttons and quiet updates.

Every tab is a Form made with page=<the Studio page>; its buttons call page.cmd(name, **args) and page.sync()
calls tab.sync(state) with the studio's latest state (a dict) whenever something changes."""
from . import state

BIG = ["rb", "rb-big"]
SMALL = ["rb"]


def toggle(button, on, roles):
    button.role = list(roles) + (["on"] if on else [])
    state.set_control_attr(button, "aria-pressed", "true" if on else "false")


def roles(button, roles_list):
    button.role = list(roles_list)


def text_if_idle(box, text):
    """Show a value in a TextBox unless the person is typing in it."""
    try:
        from anvil.js import window
        if window.document.activeElement == state.control(box):
            return
    except Exception:
        pass
    if box.text != text:
        box.text = text


def drop(dd, value):
    if dd.selected_value != value:
        dd.selected_value = value
