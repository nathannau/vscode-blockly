# Change Log

All notable changes to the "Maker Block Studio" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/).

## [Unreleased]

### Added

- **"Secondary file" toggle** — a checkbox in the blocks editor toolbar marks a `.blk` file as a secondary file: it contributes includes, declarations, and functions to the project, but does not generate its own `setup()`/`loop()`. Useful when a project has multiple `.blk` files in `src/` (PlatformIO/arduino-cli compile every source file together, so more than one `setup()`/`loop()` is a link error). Any top-level block or Setup block dropped on the canvas while the file is marked secondary is greyed out in place (with an explanatory hover) and excluded from generation, rather than blocking the editor. Global variables in a secondary file are declared `static` (internal linkage), so a variable name that happens to match one in another file no longer collides at link time — helper functions are left external, since they're often the file's public interface (e.g. called from `main.cpp`).
- **"Declare variable" block** (Variables category) — declares a variable with an explicit, changeable type and an optional `static`. Placed inside a function or Setup, it's a genuine local variable — reading/writing it elsewhere no longer also declares an unstatic global with the same name — and placed outside any function (e.g. loose in a secondary file), it's a file-scope declaration instead. The category's create-variable button now only asks for a name (like Python already did) — pick/change the type via this block instead of locking it in at creation time.
- **New "Constants" category** (above Variables) with its own **"Create constant…"** button, **"define constant"**, and **"get constant"** blocks. A constant generates as an untyped `#define` — pure preprocessor text substitution, so unlike "declare variable" it's never local (a #define isn't scoped to a function) and has no C++ linkage at all to worry about across secondary files. Constants are tagged with a distinct variable type, so they never show up mixed in with (or get confused for) regular Variables.
- **"Declare array" block** (Arrays category) — declares a new fixed-size, zero-initialized array (element type + size); `array get`/`array set` only ever index into one that already exists. Has its own explicit `static` checkbox, on top of the automatic static-in-a-secondary-file behavior it already had. The Arrays category now has its own **"Create array…"** button too, and arrays are tagged with a distinct variable type — same treatment as Constants — so they never show up mixed in with regular Variables (or Constants) either.
- **Function prototypes** — `cpp_procedures_defnoreturn`/`cpp_procedures_defreturn` (the two "create a function" blocks) now also emit a forward declaration into its own section, ahead of every full definition. Previously, whether "function A calls function B" compiled depended on whether B happened to be generated before A — nothing on the block canvas guaranteed that order.
- **"Clean up unused variables/constants/arrays" buttons**, one in each of the three categories' flyouts. Deletes any variable of that category's type with zero uses left on the canvas — handy after deleting the blocks that used to reference it, without hunting it down in the picker afterwards.

### Changed

- **Plain (untyped) `variables_get`/`variables_set`/`math_change` no longer auto-declare a global.** They used to silently add an `int` global the first time a variable was read/written, which is nearly always wrong for a name-only-created variable and conflicts with blocks that manage a variable's declaration themselves (e.g. "try positions in random order"'s loop variable, or `declare_variable`). Using one of these on a variable nothing has declared is now a compile error instead of silently-wrong generated code — declare it explicitly with `declare_variable` (or the legacy typed-variable modal, for `variables_get_dynamic`/`variables_set_dynamic`, unchanged).
- **Variables category flyout simplified** — one reusable "get"/"set" block (each with its own variable picker) instead of Blockly's default one get+set pair per *existing* variable, which got unwieldy fast with more than a few variables.

## [0.4.1] - 2026-06-25

### Added

- **Create a new catalog from the Project Blocks view** — a **New Catalog…** button (and command) walks you through a short guided prompt (identifier → toolbox category → optional description → runtime) and scaffolds a starter catalog under the project's `.blocks/` folder, ready to open in the Guided Catalog Editor and start adding blocks. Dismissing any prompt with Esc aborts the whole flow.
- **Add Blocks from Community Catalog** — the Project Blocks view now has an inline **+** button to download a community catalog straight into the current project, next to the new-catalog and refresh actions.

### Changed

- **Project Blocks moved to the Explorer** — the **Project Blocks** view now lives in the Explorer panel instead of the activity bar, matching the layout of the sibling Arduino Sketch Studio and Arduino App Studio extensions. The activity-bar view container (now titled **Maker Block Studio**) keeps the **Community Catalog** view.
- Runtime ids (`arduino:cpp`, `arduino:python`) are now defined in one shared module, used by both the webview generator registry and the host's new-catalog runtime picker.

## [0.4.0] - 2026-06-23

### Added

- **Guided Catalog Editor** — a visual editor for block catalogs. Opening any catalog file under a project's `.blocks/` folder (or choosing **"Edit catalog"** on a catalog in the **Community Catalog → Installed Blocks** view) now opens a Blockly surface where the whole catalog — entries, implementations, dependencies, every block, field, and code section — is built by snapping meta-blocks together. Connection rules enforce the catalog schema by construction, so the editor can't produce structurally invalid YAML; problems are surfaced inline and in a summary as you work. The YAML on disk stays the source of truth (imported on open, regenerated on save) with native dirty/save/undo. Catalogs using constructs the visual surface can't represent (a `generator:` block, a Blockly mutator, or multiple documents in one file) fall back automatically to the raw-text editor.

### Changed

- **Renamed to "Maker Block Studio"** — the extension (formerly "Blocks Editor") now shares the `… Studio` naming family with its sibling extensions **Arduino Sketch Studio** and **Arduino App Studio**. The name drops the Arduino lock to leave room for future non-Arduino targets. All technical identifiers are unchanged — the extension ID (`linucs.blocks-editor`), command IDs (`blocks-editor.*`), settings keys (`blocks-editor.*`), and the `blocks-editor.editor` view type stay the same, so existing settings and keybindings keep working. Command-palette titles are now prefixed `Maker Block Studio:`.
- The README now documents authoring and contributing a block with the Guided Catalog Editor, alongside the existing AI-assistant and hand-written-YAML paths.

### Fixed

- **Guided Catalog Editor no longer strips the schema modeline** — saving a catalog from the visual editor preserved every field but dropped the leading `# yaml-language-server: $schema=…` comment (js-yaml discards comments on round-trip), which disabled validation/autocomplete in the raw-text editor and shipped editor-authored catalogs without it. The serializer now re-emits the canonical modeline as the first line of every saved catalog.

## [0.3.3] - 2026-06-16

### Added

- **Arduino UNO Q / App Lab block catalogs** — a set of new built-in catalogs for the dual-brain UNO Q workflow, on both sides of the bridge:
  - **C++ (MCU side):** onboard RGB LED control (`Control`), printing to the App Lab **Monitor** via the Router Bridge (`Control`), and the **MCU→SBC Bridge** — notify, provide, and call services (`Control::Bridge`).
  - **Python (CPU/SBC side):** onboard RGB LED, **Logger** messages (`Control::Logging`), `sleep`/time, and the Python side of the **MCU-SBC Bridge** messaging (`Control::Bridge`).
- **Uno R4 12×8 LED matrix** — a new `Displays` catalog with blocks for the Uno R4's built-in 12×8 LED matrix, plus character helper blocks.
- **Raw Python code & section containers** — the Python `code` catalog gains raw-statement and raw-expression blocks plus **import**, **globals (module)**, and **setup** section containers, so Python projects can target the import / module / setup zones the same way C++ already could.

### Changed

- The webview bundle is now type-checked in CI: `check-types:webview` (strict `tsc` over `webview/`) was added to the `compile` and `package` scripts, and the webview sources were tightened to pass it (custom-field generics, generator casts, theme definition, Blockly plugin type shims).

## [0.3.2] - 2026-06-15

### Added

- **Annotate generated code with block comments** — generated source now carries a comment above each statement identifying the block that produced it, taken from the block's tooltip. Controlled by the new `blocks-editor.annotateGeneratedCode` setting (on by default). Comments you write on blocks yourself are always emitted, regardless of the setting, for both the C++ and Python runtimes. Toggling the setting re-generates the open file when auto-generation is on.

## [0.3.1] - 2026-06-15

### Fixed

- **Project-local `.blocks/` catalogs in multi-root and nested-project workspaces** — catalogs in a project's `.blocks/` directory are now resolved at the workspace folder root containing the open file, matching `gatherLocalCatalogs()` and the catalog tree's `resolveBlocksDir()`, instead of relative to the project config file's directory. Previously, projects whose `platformio.ini` / `sketch.yaml` / `app.yaml` did not sit at the workspace folder root could fail to load their project-local catalogs.

## [0.3.0] - 2026-06-15

### Added

- **Python code generation (Arduino App Lab)** — a new `arduino:python` runtime sits alongside `arduino:cpp`. Projects with an `app.yaml` (Arduino App Lab apps, built around `python/main.py`) now open in the Blocks Editor and generate **Python** instead of C++. App Lab is detected as a third project backend next to PlatformIO and Arduino CLI, with dependencies routed to the right place: pip packages → `python/requirements.txt`, bricks → `app.yaml`, Arduino libraries → `sketch/sketch.yaml` (all add-only).
- **Contribute Catalog** — a new **"Blocks Editor: Contribute Catalog to Community…"** command (also on the right-click menu for `.blocks/*.yaml` files) validates a locally authored catalog and submits it to the community repo, either by opening a **pull request** (native GitHub auth, automatic fork — no git needed) or a **pre-filled issue** in the browser. The destination repo is configurable via `blocks-editor.contributionRepo`.
- **"Open in Blocks Editor" command** — opening a source file no longer requires the "Open With…" submenu. A dedicated command appears directly on the Explorer and editor-title context menus for `.ino`, `.pde`, `.cpp`, and `.py` files.
- **In-editor generation controls** — a **Generate code** split button in the toolbar generates on demand and carries a **"Generate automatically on change"** toggle, surfacing the `blocks-editor.generateOnChange` setting right where you work.
- **switch/case block** — a new Logic block for multi-way branching, with C++ and Python generators.

### Changed

- **AI assistant setup unified** — the GitHub Copilot `@blocks` chat participant and its `/research`, `/design`, `/generate`, `/validate` slash commands have been removed in favor of a single **block-author skill** shared by both hosts. The renamed **"Blocks Editor: Set Up AI Assistants (Copilot & Claude Code)"** command writes `.mcp.json` (Claude Code MCP server), installs the skill under `.claude/skills/block-author/`, and generates `.github/instructions/block-author.instructions.md` so Copilot follows the same workflow. Re-run it after upgrading to refresh the server path and skill files.
- **Generation and project-packaging refactor** — the code-generation engine was restructured around a runtime registry (`<framework>:<language>`) so C++ and Python share the same pipeline, plus internal project-packaging cleanups.
- The custom editor's display name is now **"Blocks Editor (Visual Programming)"**.
- The README has been refreshed to cover Python/App Lab projects, the new toolbar, the AI-assistant setup, and contributing catalogs back to the community.

### Fixed

- Disabled workspace auto-focus in the webview, which was causing the context menu to misbehave.

## [0.2.1] - 2026-06-08

### Changed

- The "Generate C++" button and the corresponding setting are now labelled **"Generate Code"** across all 15 languages, reflecting that the generation engine is selected by runtime rather than by language.

### Fixed

- **Multi-root workspaces** — downloading a community catalog and enabling the Claude Code integration now prompt for which workspace folder to target instead of assuming the first one. Folder resolution is centralized in a new `workspaceRoot` utility.

## [0.2.0] - 2026-06-07

### Added

- **Multi-language support** — the extension is now fully localized in 14 languages besides English: Czech, German, Spanish, French, Hungarian, Italian, Japanese, Korean, Polish, Brazilian Portuguese, Russian, Turkish, Simplified Chinese, and Traditional Chinese. Manifest, extension UI, webview, Blockly's built-in UI, and the custom blocks all follow VS Code's display language.
- **"Compile & upload" walkthrough step** — the welcome walkthrough now includes a step explaining that Blocks Editor focuses on visual programming and pointing to the companion **Arduino CLI IDE** extension for compiling, uploading, and monitoring.

### Changed

- The `sketch.yaml` library merge now reads the file fresh from disk immediately before writing, minimizing the lost-update window when the optional Arduino CLI daemon rewrites the same file.

## [0.1.2] - 2026-06-05

### Added

- **Arduino CLI default environment** — sketches that only declare `default_fqbn` (the common result of `arduino-cli board attach`, with no named profiles) now work out of the box: a default environment is synthesized from the FQBN so the board-aware toolbox loads without requiring a hand-written profile.

### Changed

- When dependencies are merged into a sketch that has no profiles, a profile is now created automatically from `default_fqbn` (named after the board) and set as `default_profile`.

### Fixed

- The environment selector now shows a localized "Default" label for the synthesized default environment instead of a blank entry.

## [0.1.1] - 2026-06-05

### Added

- **Documentation button** — a toolbar icon that opens a QuickPick with documentation links from loaded block catalogs (library references, datasheets, API docs). Links are grouped by catalog entry.
- **Welcome walkthrough** — a 4-step onboarding guide that opens automatically on first install and after updates. Covers opening the editor, authoring custom blocks, browsing community catalogs, and contributing.
- **Catalog metadata** — `author` and `version` fields added to the catalog schema for community attribution.
- **Documentation links** for built-in SPI, Wire, and String catalogs pointing to the official Arduino reference.

### Fixed

- Toolbar dropdown (Environment selector) now renders above the Blockly toolbox instead of falling behind it.

## [0.1.0] - 2026-06-04

### Added

- **Community catalog browser** — a new activity-bar view that lists block catalogs from a community registry. Browse available catalogs, search them, refresh the list, and download a catalog into your workspace with one click.
- **Configurable registry source** — point the browser at any registry index via the `blocks-editor.catalogRegistryUrl` setting (defaults to the official community catalog).

### Changed

- Refinements across the built-in Arduino catalogs (Digital/Analog I/O, Serial, SPI, Wire, Math, Strings, Time, Interrupts, and others).
- Added a **Community** section to the README pointing to GitHub Discussions.

## [0.0.1] - 2026-06-02

First public preview.

### Added

- **Visual block editor for source files** — open any `.cpp`, `.ino`, `.c` (and `.cc`, `.cxx`, `.pde`) file with the Blocks Editor and build your program by dragging blocks instead of typing code.
- **Live C++ code generation** — blocks generate real Arduino/C++ code as you build; `setup()` and `loop()` update automatically.
- **Multi-backend toolchain support** — automatic detection of PlatformIO (`platformio.ini`) and Arduino CLI (`sketch.yaml`) projects, with a chooser when both are present.
- **Board-aware toolbox** — reads the active board and framework from your project config and shows only the blocks that apply.
- **Automatic dependency management** — libraries required by the blocks in use are merged into your project config (add-only): `lib_deps` for PlatformIO, `libraries` for the Arduino CLI.
- **Persistent block state** — your layout is saved in a companion `.blk` file next to the source.
- **Extensible block catalogs** — define blocks in YAML and load them from local directories or remote URLs.
- **Built-in Arduino blocks** — Digital I/O, Analog I/O, Serial, SPI, Wire (I2C), Math, Strings, Time, Interrupts, and more, plus the standard Blockly categories (Logic, Loops, Math, Text, Variables, Arrays, Functions).
- **Workspace conveniences** — optional minimap, toolbox search, and customizable category colors.
- **Block Author chat participant** (`@blocks`) — assists in creating new block catalogs for hardware libraries.

[0.4.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.4.0
[0.3.3]: https://github.com/linucs/vscode-blockly/releases/tag/v0.3.3
[0.3.2]: https://github.com/linucs/vscode-blockly/releases/tag/v0.3.2
[0.3.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.3.1
[0.3.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.3.0
[0.2.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.2.1
[0.2.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.2.0
[0.1.2]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.2
[0.1.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.1
[0.1.0]: https://github.com/linucs/vscode-blockly/releases/tag/v0.1.0
[0.0.1]: https://github.com/linucs/vscode-blockly/releases/tag/v0.0.1
