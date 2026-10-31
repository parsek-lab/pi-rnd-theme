# pi-rnd-theme

Pi extension: generate a random color palette for each working directory (`ctx.cwd`). The first palette is deterministic based on the directory path; subsequent palettes are random. Brightness values come from Pi's built-in dark and light themes. Semantic error, warning, and success hues are preserved.

## Install

```bash
pi install git:github.com/parsek-lab/pi-rnd-theme
```

To try it for one invocation without changing settings:

```bash
pi -e git:github.com/parsek-lab/pi-rnd-theme
```

From a local clone, use `pi -e ./index.ts` or `pi install ./path/to/pi-rnd-theme`. Run `/reload` after installing.

## Menu

Run `/rnd-theme` to open a centered modal with the controls and a live, contextual preview. It shows a **static sample Pi session**: a user request, session note, assistant Markdown (heading, list, quote, link, and inline code), a TypeScript code block with syntax highlighting, pending/failed/successful tool output, a test fix as a diff, and a final response. A small session-controls footer demonstrates selection, search, scroll, thinking levels, and bash mode. All theme color roles are represented in context rather than as a token-name list. This sample never executes tools or changes project files. The preview is restyled on every render as you change the palette, mode, or saturation; no restart is needed. Use PgUp/PgDn to browse it on short terminals.

- **randomize** — regenerate the palette and keep the menu open. Press Esc to close it.
- **mode** — press ←/→ to cycle through `system`, `dark`, and `light`, or press Enter to open the submenu. The submenu also supports ←/→. `system` detects the terminal appearance through Pi and falls back to dark. The label shows the resolved appearance: `system (dark)` or `system (light)`. Changing mode preserves the chosen hues and only adapts the palette to the new background.
- **saturation: 50** — select this row and press ←/→ to decrease/increase color intensity in steps of 5, from 20 to 100. The default is 50; it preserves the original saturation of Pi's built-in themes.

- **demo: show** — press ←/→ to toggle `show`/`hide` for the preview without changing the palette. Each menu opens with the demo visible; hiding also removes the preview scroll hint.

You can also use `/rnd-theme randomize`, `/rnd-theme system`, `/rnd-theme dark`, or `/rnd-theme light` directly. `/rnd-theme new` remains an alias for backwards compatibility.

## Storage

- Global `mode` and `saturation`: `<agent-dir>/pi-rnd-theme.json`, where the agent directory defaults to `~/.pi/agent` and honors `PI_CODING_AGENT_DIR`.
- Single working-directory configuration: `<cwd>/.pi/pi-rnd-theme.json` contains both `base` (the original colors) and `palette` (the applied colors). Keeping the base prevents saturation adjustments from losing the original colors. Existing saturation preferences below 20 are automatically raised to 20.
- Pi-compatible theme cache: `<agent-dir>/themes/pi-rnd-<directory-hash>-<palette-hash>.json`. The extension selects this theme by name, updating Pi's theme setting so `/reload` and `/new` preserve it. Versioned names prevent stale registered-theme instances from overriding regenerated colors.

Existing local palette and base files are read automatically and merged into the single local configuration on the next application. Legacy files are left untouched but no longer written. An existing `<cwd>/.pi/pi-rnd-theme-mode.json` initializes the global mode only when no global preferences exist. System mode is reevaluated on session start or reload.

## Tests

```bash
npm install --no-save jiti
node test.cjs
```

Alternatively, set `NODE_PATH` to a `node_modules` directory containing `jiti` (for example the one shipped with your Pi installation). Unit tests check the sample transcript, role coverage, scrolling, narrow widths, hide/show, and the existing palette and persistence controls.

To test against Pi's actual theme controller, pass the installed coding-agent package directory:

```bash
node test-integration.cjs <path-to>/node_modules/@earendil-works/pi-coding-agent
```

## Attribution

`dark.json` and `light.json` are based on Pi's built-in themes (`@earendil-works/pi-coding-agent`, declared as MIT-licensed in its `package.json`). See `THIRD_PARTY_NOTICES.md` for the upstream MIT notice. This repository does not yet declare its own license.
