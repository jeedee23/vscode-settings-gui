# Script: test_python_gui.py
# Purpose: Validate desktop drafts, shared export rules, and real Tk widgets
# Version: 1.1
# Created/updated: 2026-11-07

import copy
import json
import sys
import tempfile
import tkinter as tk
from tkinter import font, ttk
import unittest
from pathlib import Path
from unittest.mock import patch

if __name__ == "__main__" and not __package__:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from python_gui import Draft, SettingsGUI, bridge, identity


class DraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.metadata = bridge("metadata")

    def setUp(self):
        self.draft = Draft(self.metadata)

    def key(self, name, path=None):
        return identity({"settings_name": name, "settings_path": path or []})

    def test_all_catalog_entries_and_parents(self):
        self.assertEqual(len(self.draft.entries), 93)
        self.assertEqual(len(self.metadata["catalog"]["categories"]), 15)
        self.assertEqual(self.draft.export(), {"settings": {}, "removals": []})

    def test_literal_keys_and_inheritance_export(self):
        bg = self.key("workbench.colorCustomizations", ["editor.background"])
        fg = self.key("workbench.colorCustomizations", ["editor.foreground"])
        self.draft.set(bg, "#12345680")
        self.draft.set(fg, None, "inherit")
        result = self.draft.export()
        self.assertEqual(result["settings"], {
            "workbench.colorCustomizations": {"editor.background": "#12345680"}
        })
        self.assertEqual(result["removals"], [{
            "settings_name": "workbench.colorCustomizations",
            "settings_path": ["editor.foreground"]
        }])

    def test_nested_token_values_merge(self):
        self.draft.set(self.key("editor.tokenColorCustomizations", ["comments", "foreground"]),
                       "#123456")
        self.draft.set(self.key("editor.tokenColorCustomizations", ["comments", "fontStyle"]),
                       "bold italic")
        self.assertEqual(self.draft.export()["settings"]["editor.tokenColorCustomizations"], {
            "comments": {"foreground": "#123456", "fontStyle": "bold italic"}
        })

    def test_invalid_edit_preserves_draft(self):
        key = self.key("editor.fontSize")
        self.draft.set(key, 18)
        previous = copy.deepcopy(self.draft.edits)
        for value in (0, 101, "huge", float("inf")):
            with self.assertRaises(ValueError):
                self.draft.set(key, value)
            self.assertEqual(self.draft.edits, previous)

    def test_preset_round_trip_and_atomic_failure(self):
        self.draft.set(self.key("editor.fontSize"), 21)
        payload = json.loads(json.dumps(self.draft.preset()))
        other = Draft(self.metadata)
        other.load(payload)
        self.assertEqual(other.edits, self.draft.edits)
        previous = copy.deepcopy(other.edits)
        for invalid in (
            {}, {"format": "human-settings-python-v1", "edits": "wrong"},
            {"format": "human-settings-python-v1", "edits": [
                {"id": "unknown", "mode": "value", "value": 4}
            ]},
            {"format": "human-settings-python-v1", "edits": payload["edits"] * 2},
        ):
            with self.assertRaises(ValueError):
                other.load(invalid)
            self.assertEqual(other.edits, previous)

    def test_bool_and_select_types(self):
        self.draft.set(self.key("git.autofetch"), False)
        self.draft.set(self.key("workbench.sideBar.location"), "right")
        self.assertIs(self.draft.export()["settings"]["git.autofetch"], False)


class WidgetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.metadata = bridge("metadata")

    def setUp(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.gui = SettingsGUI(self.root, self.metadata)
        self.root.update()

    def tearDown(self):
        self.root.destroy()

    def choose(self, key):
        self.gui.tree.selection_set("setting:" + key)
        self.gui.select()

    def test_every_setting_control_renders(self):
        for key in self.gui.draft.entries:
            with self.subTest(key=key):
                self.choose(key)
                self.assertTrue(self.gui.editor.winfo_children())
        self.assertEqual(len(self.gui.tree.get_children()), 15)

    def test_visible_two_pane_layout(self):
        self.root.deiconify()
        self.root.update()
        self.assertGreater(self.gui.tree.winfo_width(), 300)
        self.assertGreater(self.gui.preview.winfo_width(), 300)

    def test_fhd_geometry_and_scaled_rows(self):
        self.root.deiconify()
        self.root.update()
        self.assertEqual(self.root.winfo_width(), min(1920, self.root.winfo_screenwidth()))
        self.assertEqual(self.root.winfo_height(), min(1080, self.root.winfo_screenheight() - 80))
        height = int(ttk.Style(self.root).lookup("HumanSettings.Treeview", "rowheight"))
        self.assertGreaterEqual(height, font.nametofont("TkDefaultFont").metrics("linespace") + 16)
        row = self.gui.tree.get_children()[0]
        self.assertEqual(self.gui.tree.bbox(row)[3], height)
        self.assertGreater(self.gui.editor.winfo_height(), 40)
        self.assertLessEqual(self.gui.editor.winfo_rooty() + self.gui.editor.winfo_height(),
                             self.root.winfo_rooty() + self.root.winfo_height())

    def test_color_commit_and_preview(self):
        key = identity({"settings_name": "workbench.colorCustomizations",
                        "settings_path": ["editor.background"]})
        self.choose(key)
        self.gui.input.set("#12345680")
        self.gui.commit()
        self.root.update()
        self.assertEqual(self.gui.draft.value(key), "#12345680")
        self.assertEqual(self.gui.tree.set("setting:" + key, "value"), "#12345680")
        self.assertIn("1 draft edits", self.gui.status.get())
        self.gui.update(key, None, "inherit")
        self.assertEqual(self.gui.tree.set("setting:" + key, "value"), "Inherit")

    def test_search_filters_and_restores(self):
        self.gui.search.set("selection background")
        self.root.update()
        self.assertEqual(len(self.gui.rows), 1)
        self.gui.search.set("")
        self.root.update()
        self.assertEqual(len(self.gui.rows), 93)

    def test_invalid_color_shows_error(self):
        key = identity({"settings_name": "workbench.colorCustomizations",
                        "settings_path": ["editor.background"]})
        self.choose(key)
        self.gui.input.set("not-a-color")
        with patch("python_gui.messagebox.showerror") as error:
            self.gui.commit()
            error.assert_called_once()
        self.assertEqual(self.gui.draft.edits, {})

    def test_discard_confirmation(self):
        key = identity({"settings_name": "editor.fontSize"})
        self.gui.draft.set(key, 20)
        with patch("python_gui.messagebox.askyesno", return_value=False):
            self.gui.discard()
            self.assertEqual(len(self.gui.draft.edits), 1)
        with patch("python_gui.messagebox.askyesno", return_value=True):
            self.gui.discard()
            self.assertEqual(self.gui.draft.edits, {})

    def test_save_load_preset_files(self):
        key = identity({"settings_name": "editor.fontSize"})
        self.gui.draft.set(key, 22)
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "preset.json")
            with patch("python_gui.filedialog.asksaveasfilename", return_value=target):
                self.gui.save_preset()
            self.assertEqual(json.loads(Path(target).read_text()), self.gui.draft.preset())
            self.gui.draft.edits.clear()
            with patch("python_gui.filedialog.askopenfilename", return_value=target):
                self.gui.load_preset()
            self.assertEqual(self.gui.draft.value(key), 22)

    def test_export_bundle_and_settings_file_guard(self):
        key = identity({"settings_name": "editor.fontSize"})
        self.gui.draft.set(key, 22)
        with tempfile.TemporaryDirectory() as directory:
            target = str(Path(directory) / "export.json")
            with patch("python_gui.filedialog.asksaveasfilename", return_value=target), \
                    patch("python_gui.messagebox.showinfo"):
                self.gui.export()
            self.assertEqual(json.loads(Path(target).read_text()), {
                "settings": {"editor.fontSize": 22}, "removals": []
            })
            protected = Path(directory) / "settings.json"
            protected.write_text('{"untouched":true}\n')
            with patch("python_gui.filedialog.asksaveasfilename", return_value=str(protected)), \
                    patch("python_gui.messagebox.showerror") as error:
                self.gui.export()
                error.assert_called_once()
            self.assertEqual(protected.read_text(), '{"untouched":true}\n')

    def test_commit_numeric_boolean_and_choice_widgets(self):
        size = identity({"settings_name": "editor.fontSize"})
        self.choose(size)
        self.gui.input.set("24")
        self.gui.commit()
        self.assertEqual(self.gui.draft.value(size), 24)
        visible = identity({"settings_name": "workbench.statusBar.visible"})
        self.choose(visible)
        self.gui.boolean.set(False)
        self.gui.commit()
        self.assertIs(self.gui.draft.value(visible), False)
        location = identity({"settings_name": "workbench.sideBar.location"})
        self.choose(location)
        self.gui.input.set("right")
        self.gui.commit()
        self.assertEqual(self.gui.draft.value(location), "right")


if __name__ == "__main__":
    unittest.main()
