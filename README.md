# VS Code Settings GUI

[Reopen this project's chat](agent-host-session://ahp-session/04af9b6c-5bcb-4eb8-8a86-f26bedf09de8)

Open the Markdown preview in VS Code and click the link to return to this conversation after changing workspace folders. This is a local session link, not a public web link or a conversation backup.

## 1. Purpose and scope

A VS Code extension for organizing and adjusting settings in human-readable categories. The left pane provides collapsible categories and editable values; the right pane shows a live illustrative preview of colors, fonts, and selected layout choices.

### Opening the GUI

Open this repository as its own VS Code workspace, press F5 to launch an Extension Development Host, then run **Human Settings: Open Settings GUI** from that window's Command Palette.

Alternatively, run `npm install` and `npm run package`, then use **Extensions: Install from VSIX** to install the resulting package. A project license has not been chosen; packaging currently skips the missing-license check and does not publish anything.

Changes remain in draft until **Apply draft** is selected. Apply writes to the active user profile, not workspace settings. Workspace overrides can still take precedence. **Discard draft** leaves VS Code unchanged.

The interface supports color pickers with a separate hexadecimal field for transparency, font suggestions with free-text entry, checkboxes, dropdowns, and numeric inputs. Sliders are supplied where verified finite ranges are available. Unavailable extension settings are disabled.

The right pane is a sample workspace, not an exact rendering of the selected theme. It previews supported custom colors, syntax styles, fonts, sidebar position, status-bar visibility, wrapping, and terminal cursor shape. Behavior-only settings are explained rather than executed.

For a browser-only demonstration, serve the repository using a local static HTTP server and open [the preview page](./media/preview.html). This demonstration cannot apply VS Code settings or save synced presets.

### Development checks

Run `npm test` for catalog, documentation, validation, and nested-update tests. Run `npm run check` for JavaScript syntax checks. No dependencies are needed for these commands.

### Python desktop GUI

A native Python version is available alongside the extension:

```bash
python3 python_gui.py
```

Requirements: Python 3.10 or newer, Tkinter, Node.js 18 or newer, and a
graphical desktop session. No pip packages are required. Tkinter is provided
by the operating system (on Debian/Ubuntu, the package is `python3-tk`).
The interface is written in Python/Tkinter; a small Node bridge reuses the
existing catalog validation and nested-merge rules rather than duplicating
them. Launching from a different working directory is supported.

The desktop window starts at 1920×1080 (Full HD), capped to fit smaller
displays with room for window decorations. The pane divider is draggable.
Tree rows follow the actual desktop font height, with extra vertical spacing,
so high-DPI text does not overlap. The editor controls and footer retain
their space while the navigation tree and preview use the remaining area.

The left pane contains all 15 collapsible categories and 93 editable
preferences. Select a preference to show its explanation and typed controls
below the tree, then choose **Set draft value**. Color pickers retain an
existing alpha component; hexadecimal input supports transparency. Finite
verified numeric ranges have sliders, and installed desktop font families
are offered as suggestions. Theme and icon identifiers are free-text because
the desktop application does not query installed VS Code extensions.

The right pane previews interface/editor colors, token-group colors and
styles, editor and terminal fonts, wrapping, sidebar position, status-bar
visibility and terminal cursor shape. Inherited colors use illustrative
sample values, not the current VS Code theme. Other choices remain editable
but are not executed or visually simulated, including semantic-token rules
and behavior-only settings.

**This desktop version is export-only:** it does not read or write active
VS Code profiles. **Export draft** saves a JSON bundle containing:

- `settings`: explicit draft values, grouped by their VS Code setting names.
- `removals`: literal property paths to remove when a draft requests inheritance.

The bundle is **not** a replacement for a VS Code settings file. Review and
merge its settings into your chosen profile, preserving unrelated nested
keys; process removals explicitly rather than writing null color values.
Use the existing extension when you want integrated **Apply draft**.
The desktop application refuses to save a bundle or preset as `settings.json`.

**Save preset** and **Load preset** store/restore committed draft edits in
explicitly selected local files. These Python presets do not use native
Settings Sync and are not the extension's synced-preset format. Loading a
preset replaces the draft after confirmation; invalid presets leave it intact.
Uncommitted input is not saved. **Discard draft** restores catalog defaults
and inherited colors without modifying VS Code.

Run desktop tests from the repository root:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s test -p 'test_python_gui.py' -v
```

The widget tests create real Tk windows and require a graphical display
(or an already configured virtual display). The existing Node test suite
continues to cover the shared validation and merge implementation.

Direct execution of `test/test_python_gui.py` is also supported, including
from another working directory. That file runs tests and exits; to open the
interactive application, run `python_gui.py` instead.

## 2. Custom profiles and presets

**Save preset** stores the available catalog choices, including the current draft, under a custom name. **Load preset** replaces the draft with that preset; review it before applying. Saving a preset does not apply it.

## 3. Synchronization across VS Code sessions

Custom presets use extension global storage and are registered for native Settings Sync. Enable Settings Sync and extension synchronization in VS Code to transfer them between installations. This extension does not sign in, enable synchronization, or force all windows to use the same native profile.

Applied settings belong to the active native profile and follow VS Code's own synchronization rules. Other windows using that profile can observe those settings; different profiles and workspace overrides remain independent.

## 4. Settings GUI and navigation

Navigation follows recognizable areas of use rather than technical setting names or control types. Expand parents and children to reach individual preferences, or search readable category names, labels, and explanations.

## 5. Colors and fonts

Color and font controls are available within the relevant settings categories.

Personal theme customization starts with a base theme and individual color overrides. Backgrounds, text, selections, cursors, and syntax highlighting can be customized independently where VS Code exposes them. Colors may include transparency.

Every inherited choice will offer a way to return to the theme or existing preference. Inherited colors have no fixed catalog value because the selected theme determines their appearance.

Fonts can be selected for the editor, terminal, and chat code blocks. A font must be installed on each computer to render consistently. VS Code does not expose arbitrary font choices for every interface component; this catalog does not promise unsupported sidebar or tab fonts.

A reusable named color theme can later be packaged as a theme extension. Font preferences normally remain in presets rather than in the color theme. Theme-extension export is not implemented.

## 6. Boolean settings - checkboxes

Checkboxes represent settings with strictly yes/no or enabled/disabled values. Preferences that also allow other choices use a dropdown or another suitable control.

## 7. Numeric settings - sliders

Sliders represent numeric settings with verified finite ranges. Numeric input remains available and is used on its own when a finite range is not recorded.

## 8. Hierarchical JSON structure

[settings-catalog.json](./settings-catalog.json) is the planned GUI's content hierarchy, not a file to import directly into VS Code. Categories follow recognizable areas of use, with each preference listed once under its most relevant workflow.

The initial values are verified definition defaults for the installed Linux desktop release of VS Code and the identified extension versions, not personal configured values. Other platforms, profiles, policies, language-specific overrides, or extension versions can produce different effective defaults. PlatformIO is not installed locally; its defaults were checked against its official extension definition.

Individual custom colors and highlighting styles start in inherited mode, not with invented theme colors. Returning to inheritance removes only the relevant override at the user configuration scope and preserves unrelated choices. Theme-specific overrides can take precedence over global choices; applying customization edits when such overrides exist requires confirmation.

This is a curated starting selection, not an exhaustive list of VS Code settings. Launch configurations, task definitions, account sign-in, and project-specific PlatformIO configuration are not ordinary preferences and are not invented as settings here.

### Visual interface

The appearance and layout of the VS Code window.

#### Appearance

Themes, icons, and interface colors.

##### Themes

Choose a base theme and file icons. Individual color overrides are organized below by interface region.

- **Color theme:** Choose the overall interface color theme. Available themes depend on installed extensions.
- **File icon theme:** Choose the icons used to represent files and folders.

##### Interface colors

Override individual background and foreground colors, or inherit them from the active theme.

###### Editor surface

Colors of the editing surface, selection, current line, and cursor.

- **Editor background:** Choose the editor background color, or inherit it from the theme.
- **Editor default text:** Choose the default editor text color. Syntax highlighting can assign different colors to code.
- **Selection background:** Choose the background of selected text. Transparency can keep highlighting visible beneath the selection.
- **Current-line background:** Choose the background highlight for the current line.
- **Editor cursor color:** Choose the color of the editor cursor.

###### Sidebar

Backgrounds and text in the sidebar and its section headings.

- **Sidebar background:** Choose the background of the sidebar.
- **Sidebar text:** Choose the default sidebar text color. Specialized elements may have their own colors.
- **Sidebar heading background:** Choose the background of sidebar section headings.
- **Sidebar heading text:** Choose the text color of sidebar section headings.

###### Tabs

Colors that distinguish active and inactive editor tabs.

- **Active tab background:** Choose the background of the active editor tab.
- **Active tab text:** Choose the text color of the active editor tab.
- **Inactive tab background:** Choose the background of inactive editor tabs.
- **Inactive tab text:** Choose the text color of inactive editor tabs.

###### Status bar

Default status-bar colors. Debugging and windows without an open folder can use separate colors.

- **Status bar background:** Choose the default status-bar background.
- **Status bar text:** Choose the default text color in the status bar.

##### Code highlighting

Customize syntax colors and styles. Semantic highlighting can override syntax colors when a language provider supplies more specific information.

###### Syntax groups

Colors and styles for broad syntax groups. Supported styles include italic, bold, underline, and strikethrough; an empty style explicitly clears styling rather than inheriting.

- **Comment color:** Choose the text color of comments.
- **Comment style:** Choose font styles for comments, or inherit their styling.
- **String color:** Choose the text color of strings.
- **String style:** Choose font styles for strings, or inherit their styling.
- **Keyword color:** Choose the text color of language keywords.
- **Keyword style:** Choose font styles for keywords, or inherit their styling.
- **Number color:** Choose the text color of numeric literals.
- **Number style:** Choose font styles for numeric literals, or inherit their styling.
- **Type color:** Choose the text color of type names.
- **Type style:** Choose font styles for type names, or inherit their styling.
- **Function color:** Choose the text color of function names.
- **Function style:** Choose font styles for function names, or inherit their styling.
- **Variable color:** Choose the text color of variable names.
- **Variable style:** Choose font styles for variable names, or inherit their styling.

###### Semantic highlighting

More specific highlighting based on language understanding. These rules depend on the token types supplied by the active language provider.

- **Enable semantic highlighting:** Enable or disable semantic highlighting, or inherit the existing preference.
- **Semantic variable color:** Choose the color of tokens identified as variables by the language provider.
- **Semantic function color:** Choose the color of tokens identified as functions by the language provider.

#### Window layout

Position and visibility of the main interface regions.

- **Primary sidebar position:** Place the primary sidebar on the left or right of the editor.
- **Show status bar:** Show the bar containing status information at the bottom of the window.

### AI and chats

AI-assisted workflows and conversations. This starting selection covers code blocks in chat, not provider-specific model configuration.

#### Conversation appearance

How code is displayed inside conversations.

##### Code blocks

Font and wrapping preferences for code shown in chat.

- **Chat code font size:** Set the text size of code blocks shown in chat.
- **Chat code font:** Choose the font for chat code blocks, or keep the default font selection.
- **Chat code font weight:** Choose the font weight for chat code blocks, or keep the default weight.
- **Wrap chat code lines:** Choose whether long lines in chat code blocks wrap onto another line.

### Source control

Version-control workflows, starting with the built-in Git integration.

#### Git integration

Enable Git support and organize repository actions.

- **Enable Git integration:** Enable the built-in Git features for repositories.

##### Fetching and synchronization

Retrieve remote changes and confirm synchronization actions.

- **Fetch remote changes automatically:** Choose whether to fetch remote changes automatically. This also supports fetching from all remotes, so its control needs more than a checkbox.
- **Confirm synchronization:** Request confirmation before synchronizing a repository with its remote.

##### Committing

Control how changes are prepared for a commit.

- **Allow smart commits:** Allow committing all changes when no changes have been staged.

### Terminals

The appearance and behavior of integrated terminals.

#### Appearance

Terminal text and cursor presentation.

- **Terminal font:** Choose the terminal font, or inherit the editor font.
- **Terminal font size:** Set the text size in integrated terminals.
- **Terminal font weight:** Choose the weight of normal terminal text.
- **Terminal cursor shape:** Choose a block, line, or underline cursor.

##### Colors

Terminal colors independent of editor text. Individual ANSI palette colors can be added later.

- **Terminal background:** Choose the terminal background, or retain the theme's inherited background.
- **Terminal default text:** Choose the default terminal text color. Programs can still use ANSI colors.
- **Terminal cursor color:** Choose the terminal cursor color.

#### Output history

How much terminal output remains available.

- **Retained output lines:** Set how many lines of previous terminal output can be scrolled back through.

### Editor

Writing and reading text and code, independent of a particular language.

#### Text appearance

Font choices and text presentation.

##### Fonts

Font family, size, and ligatures.

- **Editor font:** Choose the editor font and its fallback fonts. Font availability depends on the computer.
- **Editor font size:** Set the size of text in the editor.
- **Editor font weight:** Choose the weight of editor text.
- **Font ligatures:** Control whether supported character combinations are drawn as combined glyphs. Advanced values can select individual font features.

#### Indentation

Preferred spacing for indentation. Automatic indentation detection can override these preferences for an opened file.

- **Tab width:** Set how many spaces a tab represents.
- **Indent with spaces:** Insert spaces rather than a tab character when indenting.

#### Reading and navigation

Keep code readable and make large files easier to navigate.

- **Wrap editor lines:** Choose whether long lines remain unwrapped or wrap at the viewport, a chosen column, or a combination of both.
- **Show minimap:** Show a miniature overview of the current file beside the editor.

### Extensions

General extension management. Settings for specific workflows belong in their workflow categories.

#### Updates

Checking for and installing extension updates.

- **Automatic extension updates:** Choose whether extensions update automatically.
- **Check for extension updates:** Check automatically whether newer extension versions are available.

### PlatformIO

Embedded-development preferences supplied by the PlatformIO IDE extension. These settings require that extension.

#### Toolchain

Choose which Python interpreter and PlatformIO Core installation the extension uses.

- **Use bundled Python:** Use the portable Python interpreter supplied for PlatformIO when available.
- **Use bundled PlatformIO Core:** Use the PlatformIO Core installation managed by the extension.
- **Use development Core:** Use a development version of PlatformIO Core rather than the stable version.

#### Projects

Project activation, configuration, and code indexing.

- **Activate the project of the current editor:** Automatically switch the active project to match the file being edited.
- **Open project configuration automatically:** Open the project's configuration file when no other editors are open.
- **Refresh code completion automatically:** Rebuild the project's code-completion index after configuration changes or library installations.

##### Project tasks

Access to build, upload, and related project actions.

- **Show project action shortcuts:** Show shortcuts for build, upload, and other project actions in the editor title area.
- **Preload all environment tasks:** Load tasks for every project environment automatically.

#### Serial monitor

Coordinate serial monitoring with uploading and testing.

- **Close the monitor before device operations:** Close the serial monitor automatically before uploading or testing.
- **Serial monitor reopening delay:** Set the delay in milliseconds before the serial monitor reopens.

### Files and folders

Browsing, saving, and managing files and folders.

#### Saving

Automatic saving and cleanup when saving files.

- **Automatic saving:** Choose whether files save automatically after a delay or when focus changes.
- **Automatic saving delay:** Set the delay in milliseconds when delayed automatic saving is selected.
- **Remove trailing whitespace:** Remove unnecessary whitespace at the ends of lines when saving.

#### File explorer

File-management actions in the explorer.

- **Confirm file deletion:** Request confirmation before deleting files through the explorer.

### Search

Finding text across files and choosing which files are searched.

#### Text matching

How searches handle letter case.

- **Automatic case-sensitive matching:** Use case-sensitive matching when a search contains uppercase letters, unless case matching is explicitly selected.

#### Files included

How ignore rules and linked files affect searches.

- **Respect ignore files:** Exclude files covered by project ignore rules when searching.
- **Follow symbolic links:** Include files reached through symbolic links in searches.

### Languages

Language-specific behavior, separate from general editor preferences.

#### JavaScript and TypeScript

Shared behavior provided by the built-in JavaScript and TypeScript language extension.

##### Imports

Keep import paths aligned with file moves.

- **Update imports after moving files:** Choose whether import paths update automatically, after confirmation, or not at all when files move.

### Run and debug

Running programs and inspecting their behavior during debugging.

#### Debugging interface

When debugging controls appear and where they are shown.

- **Open the debugging view:** Choose when the debugging view opens, such as when execution pauses.
- **Debug toolbar position:** Choose where debugging controls appear or hide them.
- **Show values beside code:** Choose whether runtime values appear beside code, with automatic behavior depending on language support.

### Tasks and automation

Build tasks and other repeatable automated actions.

#### Task discovery and execution

Find available tasks and prepare files before running them.

- **Detect tasks automatically:** Allow task providers to discover available tasks automatically.
- **Save files before running tasks:** Choose whether to save files before a task starts, ask first, or leave files unsaved.

### Notifications and sounds

Confirmation prompts and audible feedback.

#### Confirmations

Confirmation before closing the window. File and repository confirmations remain in their workflow categories.

- **Confirm before closing:** Choose whether closing the window requires confirmation, including an option for keyboard-triggered closing only.

#### Sound feedback

Volume of accessibility sound signals; this does not enable individual signals.

- **Signal volume:** Set the volume of accessibility sound signals from zero to one hundred.

### Accessibility

Screen-reader support and visual comfort.

#### Screen readers

Editor behavior for assistive reading tools.

- **Screen-reader support:** Detect screen-reader use automatically, or explicitly enable or disable editor accessibility support.

#### Visual comfort

Reduce motion and transparency when needed.

- **Reduce interface motion:** Choose whether interface motion is reduced, or follow the operating system's preference.
- **Reduce interface transparency:** Choose whether interface transparency is reduced, or follow the operating system's preference.

### Remote development

Working with remote environments. This starting selection covers port restoration and SSH connections.

#### Ports

Restore forwarded ports after reconnecting.

- **Restore forwarded ports:** Restore previously forwarded ports when a remote connection is reopened.

#### SSH connections

Connection preferences supplied by the Remote - SSH extension.

- **Show SSH login terminal:** Show the terminal used during SSH login so connection prompts and progress are visible.
- **SSH connection timeout:** Set how many seconds to wait for an SSH connection.

## 9. Matching Markdown documentation

Documentation mirrors the catalog's categories, subcategories, readable preference labels, and explanations. Technical setting identifiers, machine field names, and typed values belong only in the JSON.

## 10. Growing and reorganizing the hierarchy

The hierarchy supports adding and reorganizing parents, children, and individual preferences, rather than only appending entries. Category nodes remain separate from actual settings and may contain both direct preferences and deeper categories.

Each actual preference must have a verified identifier, a typed value, a readable label, and an explanation in the catalog. Preserve booleans, numbers, strings, arrays, and objects rather than converting every value to text. A genuine empty or null default is different from a missing or unverified value.

Individual choices inside a compound preference have their own property paths. Their identity includes both the containing preference and that path, so multiple color choices can share a container without being duplicates. Editing one choice must preserve its siblings, including custom entries that are not yet represented in the catalog.

Inheritance is explicit and is never applied as a null color. Existing shorthand color values are preserved when adding a separate style, and incompatible data is reported rather than silently replaced. Multiple edits to one compound preference are merged before writing. If an application fails, previously written settings are rolled back; rollback failures are reported explicitly.

Before expanding the catalog, verify definitions and record their source versions. Keep each editable choice in one logical location and update its matching documentation when it moves. Basic control hints and validation are implemented. Complete live schema discovery, stable category identifiers, theme-specific editing, and automated documentation generation can be added later.
