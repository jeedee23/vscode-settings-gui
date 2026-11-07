# Script: python_gui.py
# Purpose: Native desktop editor and illustrative preview for the shared VS Code catalog
# Version: 1.1
# Created/updated: 2026-11-07

from __future__ import annotations

import copy
import json
import math
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import colorchooser, filedialog, font, messagebox, ttk
from typing import Any

ROOT = Path(__file__).resolve().parent


def bridge(action: str, edits: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Reuse the extension's validation and literal-path merge rules."""
    result = subprocess.run(
        ["node", str(ROOT / "python-bridge.js")],
        input=json.dumps({"action": action, "edits": edits or []}),
        capture_output=True, text=True, check=False, timeout=15,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip() or "Catalog validation failed.")
    return json.loads(result.stdout)


def identity(item: dict[str, Any]) -> str:
    return json.dumps(
        [item["settings_name"], item.get("settings_path", [])],
        separators=(",", ":"), ensure_ascii=False,
    )


class Draft:
    def __init__(self, metadata: dict[str, Any]) -> None:
        self.metadata = metadata
        self.entries: dict[str, dict[str, Any]] = {}

        def walk(nodes: dict[str, Any]) -> None:
            for node in nodes.values():
                for item in node["settings"]:
                    self.entries[identity(item)] = item
                walk(node["children"])

        walk(metadata["catalog"]["categories"])
        self.edits: dict[str, dict[str, Any]] = {}

    def value(self, key: str) -> Any:
        edit = self.edits.get(key)
        return edit["value"] if edit else self.entries[key]["settings_value"]

    def mode(self, key: str) -> str:
        edit = self.edits.get(key)
        return edit["mode"] if edit else self.entries[key].get("settings_value_mode", "value")

    def set(self, key: str, value: Any, mode: str = "value") -> None:
        edit = {"id": key, "value": value, "mode": mode}
        bridge("validate", [edit])
        self.edits[key] = edit

    def load(self, payload: Any) -> None:
        if not isinstance(payload, dict) or payload.get("format") != "human-settings-python-v1":
            raise ValueError("Not a Human Settings Python preset.")
        edits = payload.get("edits")
        bridge("validate", edits if isinstance(edits, list) else [None])
        self.edits = {edit["id"]: copy.deepcopy(edit) for edit in edits}

    def preset(self) -> dict[str, Any]:
        return {"format": "human-settings-python-v1", "edits": list(self.edits.values())}

    def export(self) -> dict[str, Any]:
        return bridge("export", list(self.edits.values()))


class SettingsGUI:
    def __init__(self, root: tk.Tk, metadata: dict[str, Any]) -> None:
        self.root = root
        self.draft = Draft(metadata)
        self.selected: str | None = None
        self.rows: dict[str, str] = {}
        self.preview_fonts: list[font.Font] = []
        self.root.title("Human Settings - Python desktop")
        width = min(1920, root.winfo_screenwidth())
        height = min(1080, root.winfo_screenheight() - 80)
        self.root.geometry(f"{width}x{height}")
        self.root.minsize(950, 620)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        style = ttk.Style(root)
        row_height = max(40, font.nametofont("TkDefaultFont", root=root).metrics("linespace") + 16)
        style.configure("HumanSettings.Treeview", rowheight=row_height)
        style.configure("HumanSettings.Treeview.Heading", padding=(8, 8))
        style.configure("HumanSettings.TButton", padding=(12, 8))
        toolbar = ttk.Frame(root, padding=16)
        toolbar.pack(fill="x")
        ttk.Label(toolbar, text="Search").pack(side="left")
        self.search = tk.StringVar()
        ttk.Entry(toolbar, textvariable=self.search, width=28).pack(side="left", padx=8)
        self.search.trace_add("write", lambda *_: self.populate())
        for label, command in [
            ("Save preset", self.save_preset), ("Load preset", self.load_preset),
            ("Export draft", self.export), ("Discard draft", self.discard),
        ]:
            ttk.Button(toolbar, text=label, command=command,
                       style="HumanSettings.TButton").pack(side="left", padx=6)
        self.status = tk.StringVar()
        ttk.Label(root, textvariable=self.status, padding=12).pack(side="bottom", fill="x")
        panes = ttk.Panedwindow(root, orient="horizontal")
        panes.pack(fill="both", expand=True, padx=16, pady=(0, 12))
        left = ttk.Frame(panes)
        right = ttk.Frame(panes)
        panes.add(left, weight=1)
        panes.add(right, weight=1)
        ttk.Label(left, text="Settings: expand categories; select a value to edit").pack(
            anchor="w", pady=(0, 12))
        tree_frame = ttk.Frame(left)
        self.tree = ttk.Treeview(tree_frame, columns=("value",), selectmode="browse",
                                 style="HumanSettings.Treeview")
        self.tree.heading("#0", text="Category / preference")
        self.tree.heading("value", text="Draft value")
        self.tree.column("#0", width=480)
        self.tree.column("value", width=240)
        scroll = ttk.Scrollbar(tree_frame, command=self.tree.yview)
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")
        self.tree.bind("<<TreeviewSelect>>", self.select)
        self.editor = ttk.LabelFrame(left, text="Edit selected preference", padding=16)
        self.editor.pack(side="bottom", fill="x", pady=(12, 0))
        tree_frame.pack(fill="both", expand=True)
        self.preview = ttk.Frame(right)
        self.preview.pack(fill="both", expand=True, padx=(20, 0))
        self.populate()
        self.select()
        self.render()
        panes.bind("<Map>", lambda _event: self.root.after_idle(
            lambda: panes.sashpos(0, panes.winfo_width() // 2)))

    def display(self, key: str) -> str:
        if self.draft.mode(key) == "inherit":
            return "Inherit"
        return str(self.draft.value(key))

    def populate(self) -> None:
        expanded = set()

        def record(parent: str = "") -> None:
            for row in self.tree.get_children(parent):
                if self.tree.item(row, "open"):
                    expanded.add(row)
                record(row)

        record()
        self.tree.delete(*self.tree.get_children())
        self.rows.clear()
        query = self.search.get().casefold().strip()

        def matches(label: str, node: dict[str, Any]) -> bool:
            return (query in (label + " " + node["description"]).casefold()
                    or any(query in (item["settings_human_read"] + " " +
                                     item["settings_description"]).casefold()
                           for item in node["settings"])
                    or any(matches(label, child) for label, child in node["children"].items()))

        def add(nodes: dict[str, Any], parent: str = "", path: tuple[str, ...] = (),
                show_all: bool = False) -> None:
            for label, node in nodes.items():
                if query and not show_all and not matches(label, node):
                    continue
                row = "category:" + json.dumps(path + (label,))
                self.tree.insert(parent, "end", iid=row, text=label,
                                 open=bool(query) or row in expanded)
                whole = show_all or bool(query and query in
                                          (label + " " + node["description"]).casefold())
                for item in node["settings"]:
                    if query and not whole and query not in (
                        item["settings_human_read"] + " " + item["settings_description"]
                    ).casefold():
                        continue
                    key = identity(item)
                    leaf = "setting:" + key
                    self.rows[leaf] = key
                    self.tree.insert(row, "end", iid=leaf, text=item["settings_human_read"],
                                     values=(self.display(key),))
                add(node["children"], row, path + (label,), whole)

        add(self.draft.metadata["catalog"]["categories"])
        if self.selected and "setting:" + self.selected in self.rows:
            self.tree.selection_set("setting:" + self.selected)

    def select(self, _event: Any = None) -> None:
        selection = self.tree.selection()
        self.selected = self.rows.get(selection[0]) if selection else None
        for child in self.editor.winfo_children():
            child.destroy()
        if not self.selected:
            ttk.Label(self.editor, text="Select an individual preference above.").pack(anchor="w")
            return
        key = self.selected
        item = self.draft.entries[key]
        ttk.Label(self.editor, text=item["settings_description"], wraplength=760).pack(anchor="w")
        controls = ttk.Frame(self.editor)
        controls.pack(fill="x", pady=12)
        value = self.draft.value(key)
        choices = item.get("settings_options") or self.draft.metadata["options"].get(
            item["settings_name"], []
        )
        control = item.get("settings_control")
        self.input = tk.StringVar(value="" if value is None else str(value))
        self.boolean: tk.BooleanVar | None = None
        if choices:
            widget = ttk.Combobox(controls, textvariable=self.input,
                                  values=[str(choice) for choice in choices], state="readonly")
        elif isinstance(item["settings_value"], bool) or item.get("settings_path", [])[-1:] == ["enabled"]:
            self.boolean = tk.BooleanVar(value=bool(value))
            widget = ttk.Checkbutton(controls, text="Enabled", variable=self.boolean)
        elif control == "font":
            widget = ttk.Combobox(controls, textvariable=self.input,
                                  values=sorted(font.families(self.root)))
        else:
            widget = ttk.Entry(controls, textvariable=self.input)
        widget.pack(side="left", fill="x", expand=True)
        if control == "color":
            ttk.Button(controls, text="Pick color", command=self.pick_color).pack(side="left", padx=4)
            ttk.Label(self.editor, text="Hex: #RRGGBB or #RRGGBBAA (alpha)").pack(anchor="w")
        limits = self.draft.metadata["ranges"].get(item["settings_name"])
        if limits and limits[1] is not None:
            slider = ttk.Scale(self.editor, from_=limits[0], to=limits[1])
            slider.set(float(value if value is not None else limits[0]))
            slider.configure(command=lambda number: self.input.set(str(round(float(number)))))
            slider.pack(fill="x")
        buttons = ttk.Frame(self.editor)
        buttons.pack(fill="x", pady=(8, 0))
        ttk.Button(buttons, text="Set draft value", command=self.commit).pack(side="left")
        ttk.Button(buttons, text="Inherit / remove override",
                   command=lambda: self.update(key, None, "inherit")).pack(side="left", padx=4)
        ttk.Label(self.editor, text="Uncommitted input is not exported. Use Set draft value.",
                  wraplength=430).pack(anchor="w", pady=(6, 0))

    def pick_color(self) -> None:
        current = self.input.get()
        chosen = colorchooser.askcolor(
            color=current[:7] if current.startswith("#") and len(current) in (7, 9) else None,
            parent=self.root,
        )[1]
        if chosen:
            self.input.set(chosen + (current[7:] if len(current) == 9 else ""))

    def commit(self) -> None:
        if not self.selected:
            return
        item = self.draft.entries[self.selected]
        raw = self.input.get()
        try:
            choices = item.get("settings_options") or self.draft.metadata["options"].get(
                item["settings_name"], []
            )
            if self.boolean is not None:
                value: Any = self.boolean.get()
            elif choices:
                value = next(choice for choice in choices if str(choice) == raw)
            elif isinstance(item["settings_value"], (int, float)) and not isinstance(
                item["settings_value"], bool
            ):
                value = float(raw)
                if not math.isfinite(value):
                    raise ValueError("Enter a finite number.")
                if value.is_integer():
                    value = int(value)
            else:
                value = raw
            self.update(self.selected, value)
        except (ValueError, StopIteration) as error:
            messagebox.showerror("Invalid value", str(error) or "Select a supported choice.",
                                 parent=self.root)

    def update(self, key: str, value: Any, mode: str = "value") -> None:
        try:
            self.draft.set(key, value, mode)
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            messagebox.showerror("Cannot update draft", str(error), parent=self.root)
            return
        self.tree.set("setting:" + key, "value", self.display(key))
        self.select()
        self.render()

    def render(self) -> None:
        for child in self.preview.winfo_children():
            child.destroy()
        self.preview_fonts.clear()
        explicit = {
            key: self.draft.value(key) for key in self.draft.entries
            if self.draft.mode(key) == "value"
        }

        def get(name: str, fallback: Any, path: list[str] | None = None) -> Any:
            return explicit.get(identity({"settings_name": name, "settings_path": path or []}), fallback)

        def color(name: str, fallback: str, background: str = "#1e1e1e") -> str:
            raw = get("workbench.colorCustomizations", fallback, [name])
            if len(raw) == 9:
                alpha = int(raw[7:], 16) / 255
                values = [round(int(raw[i:i + 2], 16) * alpha +
                                int(background[i:i + 2], 16) * (1 - alpha))
                          for i in (1, 3, 5)]
                return "#" + "".join(f"{value:02x}" for value in values)
            return raw

        ttk.Label(self.preview, text="Live illustrative preview", font=("", 13, "bold")).pack(anchor="w")
        ttk.Label(self.preview, text="Sample colors when inherited; not the installed VS Code theme.",
                  wraplength=800).pack(anchor="w", pady=12)
        ttk.Label(self.preview, text="Preview covers editor/interface colors, token groups, fonts, "
                  "wrapping, sidebar position and terminal cursor. Other settings are editable "
                  "but are not executed or simulated.", wraplength=800).pack(
                      side="bottom", anchor="w", pady=(12, 0))
        sample = tk.Frame(self.preview, bg="#252526")
        sample.pack(fill="both", expand=True)
        bg = color("editor.background", "#1e1e1e")
        fg = color("editor.foreground", "#d4d4d4", bg)
        side = tk.Frame(sample, bg=color("sideBar.background", "#252526"))
        side.pack(side=get("workbench.sideBar.location", "left"), fill="y")
        for text in ("EXPLORER", "  sample.py", "  settings.json", "  README.md"):
            tk.Label(side, text=text, anchor="w", padx=8, pady=8,
                     bg=color("sideBar.background", "#252526"),
                     fg=color("sideBar.foreground", "#cccccc")).pack(fill="x")
        main = tk.Frame(sample, bg=bg)
        main.pack(fill="both", expand=True)
        tabs = tk.Frame(main, bg="#252526")
        tabs.pack(fill="x")
        for title, state in (("sample.py", "active"), ("settings.json", "inactive")):
            tk.Label(tabs, text=title, padx=12, pady=8,
                     bg=color(f"tab.{state}Background", bg if state == "active" else "#2d2d2d"),
                     fg=color(f"tab.{state}Foreground", fg)).pack(side="left")
        family = get("editor.fontFamily", "monospace").split(",")[0].strip("'\" ")
        size = int(get("editor.fontSize", 14))
        text_widget = tk.Text(
            main, bg=bg, fg=fg, insertbackground=color("editorCursor.foreground", "#ffffff"),
            selectbackground=color("editor.selectionBackground", "#264f78", bg),
            font=(family, size), wrap="none" if get("editor.wordWrap", "off") == "off" else "word",
            relief="flat", height=12, width=36, padx=12, pady=12, exportselection=False,
        )
        text_widget.insert("1.0", '# Sample editor\nmessage = "Hello, settings!"\nprint(message)\n')
        text_widget.tag_configure("current", background=color("editor.lineHighlightBackground", "#252526", bg))
        text_widget.tag_add("current", "2.0", "2.end")
        for tag, start, end, fallback in [
            ("comments", "1.0", "1.end", "#6a9955"),
            ("strings", "2.10", "2.end", "#ce9178"),
            ("functions", "3.0", "3.5", "#dcdcaa"),
        ]:
            token_color = get("editor.tokenColorCustomizations", fallback, [tag, "foreground"])
            style = get("editor.tokenColorCustomizations", "", [tag, "fontStyle"])
            token_font = font.Font(root=self.root, family=family, size=size,
                                   weight="bold" if "bold" in style else "normal",
                                   slant="italic" if "italic" in style else "roman",
                                   underline="underline" in style,
                                   overstrike="strikethrough" in style)
            text_widget.tag_configure(tag, foreground=self.blend(token_color, bg), font=token_font)
            text_widget.tag_add(tag, start, end)
            # Tk does not retain the Python Font object referenced by a tag.
            self.preview_fonts.append(token_font)
        text_widget.tag_add("sel", "2.0", "2.7")
        text_widget.configure(state="disabled")
        terminal_bg = color("terminal.background", "#181818")
        terminal_family = get("terminal.integrated.fontFamily", family).split(",")[0].strip("'\" ") or family
        cursor = {"block": "\u2588", "line": "|", "underline": "_"}.get(
            get("terminal.integrated.cursorStyle", "block"), "|")
        terminal = tk.Label(main, text=f"TERMINAL\n$ python sample.py\nHello, settings!\n$ {cursor}",
                 anchor="w", justify="left", padx=12, pady=12, bg=terminal_bg,
                 fg=color("terminal.foreground", "#cccccc", terminal_bg),
                 font=(terminal_family, int(get("terminal.integrated.fontSize", 14))))
        if get("workbench.statusBar.visible", True):
            tk.Label(main, text="Python    UTF-8    Ln 2, Col 1", anchor="w",
                     bg=color("statusBar.background", "#007acc"),
                     fg=color("statusBar.foreground", "#ffffff")).pack(side="bottom", fill="x")
        terminal.pack(side="bottom", fill="x")
        text_widget.pack(fill="both", expand=True)
        self.status.set(f"{len(self.draft.edits)} draft edits | Export only: active VS Code settings are untouched.")

    @staticmethod
    def blend(raw: str, bg: str) -> str:
        if len(raw) != 9:
            return raw
        alpha = int(raw[7:], 16) / 255
        return "#" + "".join(
            f"{round(int(raw[i:i + 2], 16) * alpha + int(bg[i:i + 2], 16) * (1 - alpha)):02x}"
            for i in (1, 3, 5)
        )

    def save_preset(self) -> None:
        self.write_json(self.draft.preset(), "Save Python preset", "human-settings-preset.json")

    def write_json(self, payload: dict[str, Any], title: str, filename: str) -> bool:
        target = filedialog.asksaveasfilename(
            parent=self.root, title=title, initialfile=filename,
            defaultextension=".json", filetypes=[("JSON", "*.json")],
        )
        if not target:
            return False
        if Path(target).name.casefold() == "settings.json":
            messagebox.showerror(
                "Choose an export filename",
                "Presets and export bundles are not settings.json files. Choose another "
                "filename to avoid replacing a VS Code profile.", parent=self.root,
            )
            return False
        try:
            Path(target).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
                                    encoding="utf-8")
        except OSError as error:
            messagebox.showerror("Cannot save file", str(error), parent=self.root)
            return False
        self.status.set(f"Saved {target}. Active VS Code settings were not modified.")
        return True

    def load_preset(self) -> None:
        if self.draft.edits and not messagebox.askyesno(
            "Replace draft?", "Loading a preset replaces your current draft.", parent=self.root
        ):
            return
        target = filedialog.askopenfilename(parent=self.root, filetypes=[("JSON", "*.json")])
        if not target:
            return
        try:
            payload = json.loads(Path(target).read_text(encoding="utf-8"))
            self.draft.load(payload)
        except (OSError, ValueError, subprocess.TimeoutExpired) as error:
            messagebox.showerror("Cannot load preset", str(error), parent=self.root)
            return
        self.populate()
        self.select()
        self.render()

    def export(self) -> None:
        try:
            payload = self.draft.export()
        except (ValueError, OSError, subprocess.TimeoutExpired) as error:
            messagebox.showerror("Cannot export", str(error), parent=self.root)
            return
        if self.write_json(payload, "Export draft bundle", "human-settings-export.json"):
            messagebox.showinfo(
                "Draft exported",
                "This is an export bundle, not a settings.json replacement.\n\n"
                "Merge its 'settings' properties into your chosen VS Code profile, preserving "
                "unrelated nested keys. 'removals' lists overrides to remove for inheritance.\n\n"
                "The Python GUI does not modify or read your active profile.",
                parent=self.root,
            )

    def discard(self) -> None:
        if self.draft.edits and not messagebox.askyesno(
            "Discard draft?", "Discard all committed draft edits?", parent=self.root
        ):
            return
        self.draft.edits.clear()
        self.populate()
        self.select()
        self.render()

    def close(self) -> None:
        if self.draft.edits and not messagebox.askyesno(
            "Close editor?", "Draft edits remain in memory. Close without saving a preset?",
            parent=self.root,
        ):
            return
        self.root.destroy()


def main() -> int:
    try:
        metadata = bridge("metadata")
        root = tk.Tk()
    except (OSError, ValueError, subprocess.TimeoutExpired, tk.TclError) as error:
        print(f"Cannot start Human Settings: {error}", file=sys.stderr)
        return 1
    SettingsGUI(root, metadata)
    root.mainloop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
