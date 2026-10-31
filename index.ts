import { createHash, randomBytes } from "node:crypto";
import { readFileSync, mkdirSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, type ExtensionAPI, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { renderPreview } from "./preview.ts";

export type Appearance = "dark" | "light";
type Mode = Appearance | "system";
type Preferences = { mode: Mode; saturation: number };
type Palette = {
  $schema: string;
  name: string;
  appearance: Appearance;
  vars: Record<string, string>;
  colors: Record<string, string>;
  export: Record<string, string>;
};

const templates: Record<Appearance, Palette> = {
  dark: JSON.parse(readFileSync(fileURLToPath(new URL("./dark.json", import.meta.url)), "utf8")),
  light: JSON.parse(readFileSync(fileURLToPath(new URL("./light.json", import.meta.url)), "utf8")),
};
const colorPattern = /^okhsl\((\d{1,3}) (\d{1,3})% (\d{1,3})%\)$/;

function palettePath(cwd: string): string { return join(cwd, ".pi", "pi-rnd-theme.json"); }
function preferencesPath(): string { return join(getAgentDir(), "pi-rnd-theme.json"); }
function nameFor(cwd: string): string {
  return `pi-rnd-${createHash("sha256").update(cwd).digest("hex").slice(0, 12)}`;
}

function readJson(path: string): unknown | undefined {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function saveJson(path: string, value: unknown): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const temp = join(dir, `.pi-rnd-theme-${randomBytes(8).toString("hex")}.tmp`);
  try {
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temp, path);
  } finally {
    try { unlinkSync(temp); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function validPreferences(value: unknown): value is Preferences {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Preferences>;
  return (p.mode === "system" || p.mode === "dark" || p.mode === "light") &&
    Number.isInteger(p.saturation) && p.saturation! >= 0 && p.saturation! <= 100;
}

function loadPreferences(cwd: string): Preferences {
  const stored = readJson(preferencesPath());
  if (stored !== undefined) {
    if (!validPreferences(stored)) throw new Error("invalid global theme preferences");
    if (stored.saturation < 20) {
      stored.saturation = 20;
      saveJson(preferencesPath(), stored);
    }
    return stored;
  }
  // Migrate the old project-local mode on first use; leave the old file untouched.
  const legacy = readJson(join(cwd, ".pi", "pi-rnd-theme-mode.json"));
  const mode = legacy && typeof legacy === "object" && "mode" in legacy &&
    (legacy.mode === "system" || legacy.mode === "dark" || legacy.mode === "light") ? legacy.mode : "system";
  const preferences: Preferences = { mode, saturation: 50 };
  saveJson(preferencesPath(), preferences);
  return preferences;
}

/** Preserve the conventional hues for errors, warnings, and success. */
function rotate(value: string, degrees: number): string {
  const match = colorPattern.exec(value);
  if (!match) return value;
  const hue = Number(match[1]);
  if ((hue >= 0 && hue <= 95) || (hue >= 145 && hue <= 170)) return value;
  return `okhsl(${(hue + degrees) % 360} ${match[2]}% ${match[3]}%)`;
}

export function generatePalette(cwd: string, appearance: Appearance, salt = "initial"): Palette {
  const base = templates[appearance];
  const degrees = createHash("sha256").update(`${cwd}\0${salt}`).digest().readUInt16BE(0) % 360;
  const transform = (values: Record<string, string>) =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, rotate(value, degrees)]));
  return { $schema: base.$schema, name: nameFor(cwd), appearance,
    vars: transform(base.vars), colors: transform(base.colors), export: transform(base.export) };
}

export function withAppearance(base: Palette, appearance: Appearance): Palette {
  if (base.appearance === appearance) return base;
  const target = templates[appearance];
  const adapt = (group: "vars" | "colors" | "export") => Object.fromEntries(Object.entries(base[group]).map(([key, value]) => {
    const original = colorPattern.exec(value);
    const next = colorPattern.exec(target[group][key]);
    // Keep every chosen hue; only adapt saturation/lightness for the new background.
    return [key, original && next ? `okhsl(${original[1]} ${next[2]}% ${next[3]}%)` : value];
  }));
  return { ...base, appearance, vars: adapt("vars"), colors: adapt("colors"), export: adapt("export") };
}

export function withSaturation(base: Palette, saturation: number): Palette {
  saturation = Math.max(20, Math.min(100, saturation));
  const transform = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).map(([key, value]) => {
    const match = colorPattern.exec(value);
    return [key, match ? `okhsl(${match[1]} ${Math.min(100, Math.round(Number(match[2]) * saturation / 50))}% ${match[3]}%)` : value];
  }));
  return { ...base, vars: transform(base.vars), colors: transform(base.colors), export: transform(base.export) };
}

function validPalette(value: unknown, cwd: string): value is Palette {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<Palette>;
  if (p.name !== nameFor(cwd) || (p.appearance !== "dark" && p.appearance !== "light")) return false;
  const base = templates[p.appearance];
  return (["vars", "colors", "export"] as const).every(group => {
    const entries = p[group];
    return !!entries && typeof entries === "object" &&
      Object.keys(entries).sort().join("|") === Object.keys(base[group]).sort().join("|") &&
      Object.values(entries).every(color => typeof color === "string" &&
        (colorPattern.test(color) || (group === "colors" && !!p.vars && color in p.vars)));
  });
}

function loadBase(cwd: string): Palette | undefined {
  const path = palettePath(cwd);
  const parsed = readJson(path);
  if (parsed === undefined) return undefined;
  if (typeof parsed === "object" && parsed !== null && "base" in parsed && "palette" in parsed) {
    if (!validPalette(parsed.base, cwd) || !validPalette(parsed.palette, cwd)) throw new Error(`invalid palette: ${path}`);
    return parsed.base;
  }
  // Read the former two-file layout once; future writes use the single local document.
  if (!validPalette(parsed, cwd)) throw new Error(`invalid palette: ${path}`);
  const legacyBase = readJson(join(cwd, ".pi", "pi-rnd-theme-base.json"));
  if (legacyBase === undefined) return parsed;
  if (!validPalette(legacyBase, cwd)) throw new Error("invalid legacy base palette");
  return legacyBase;
}

function themeCache(palette: Palette): { name: string; path: string } {
  // Versioned names prevent Pi's registered-theme cache from serving an older palette.
  const version = createHash("sha256").update(JSON.stringify(palette)).digest("hex").slice(0, 16);
  const name = `${palette.name}-${version}`;
  return { name, path: join(getAgentDir(), "themes", `${name}.json`) };
}

type UI = ExtensionUIContext;
function systemAppearance(ui: UI): Appearance {
  return ui.getTheme("system")?.appearance === "light" ? "light" : "dark";
}

function apply(cwd: string, ui: UI, preferences: Preferences, regenerate = false): void {
  const appearance = preferences.mode === "system" ? systemAppearance(ui) : preferences.mode;
  const prior = loadBase(cwd);
  let base = prior;
  if (!base || regenerate) {
    do {
      base = generatePalette(cwd, appearance, regenerate ? randomBytes(16).toString("hex") : "initial");
    } while (regenerate && prior && base.vars.violet === prior.vars.violet);
  }
  base = withAppearance(base, appearance);
  const palette = withSaturation(base, preferences.saturation);
  saveJson(palettePath(cwd), { base, palette });
  const cached = themeCache(palette);
  saveJson(cached.path, { ...palette, name: cached.name });
  // Selecting by name updates Pi's controller and persisted theme setting, not just the in-memory theme.
  const result = ui.setTheme(cached.name);
  if (!result.success) throw new Error(result.error ?? "failed to apply theme");
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    try { apply(ctx.cwd, ctx.ui, loadPreferences(ctx.cwd)); }
    catch (error) { ctx.ui.notify(`pi-rnd-theme: ${String(error)}`, "error"); }
  });

  pi.registerCommand("rnd-theme", {
    description: "Regenerate the palette, select a global mode, or adjust global saturation",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("pi-rnd-theme requires interactive mode", "error");
        return;
      }
      try {
        let preferences = loadPreferences(ctx.cwd);
        const perform = (next: Preferences, regenerate = false) => {
          apply(ctx.cwd, ctx.ui, next, regenerate);
          if (next.mode !== preferences.mode || next.saturation !== preferences.saturation) {
            saveJson(preferencesPath(), next);
          }
          preferences = next;
        };
        const argument = args.trim().toLowerCase();
        if (argument) {
          if (argument === "randomize" || argument === "new") perform(preferences, true);
          else if (argument === "system" || argument === "dark" || argument === "light") {
            perform({ ...preferences, mode: argument });
          } else ctx.ui.notify("Usage: /rnd-theme [randomize|system|dark|light]", "error");
          return;
        }
        await ctx.ui.custom<void>((tui, _theme, keys, done) => {
          let selected = 0;
          let demo: "show" | "hide" = "show";
          let previewOffset = 0;
          let previewPageSize = 1;
          let previewLength = 0;
          const main = ["randomize", "mode", "saturation", "demo"];
          const modes: Mode[] = ["system", "dark", "light"];
          const redraw = () => tui.requestRender();
          return {
            render(width: number): string[] {
              const theme = ctx.ui.theme;
              const modeLabel = (mode: Mode) => mode === "system" ? `system (${systemAppearance(ctx.ui)})` : mode;
              const items = ["randomize", `mode: ${modeLabel(preferences.mode)}  ← →`, `saturation: ${preferences.saturation}  ← →`, `demo: ${demo}  ← →`];
              const innerWidth = Math.max(1, width - 4);
              const menu = [theme.fg("accent", "Random theme"),
                ...items.map((item, i) => theme.fg(i === selected ? "accent" : "text", `${i === selected ? ">" : " "} ${item}`)),
                ...(demo === "show" ? ["", theme.fg("accent", "Live theme preview")] : [])];
              const samples = demo === "show" ? renderPreview(theme, innerWidth) : [];
              previewLength = samples.length;
              const height = Math.floor(tui.terminal.rows * 0.9);
              previewPageSize = Math.max(1, height - menu.length - 4);
              previewOffset = Math.max(0, Math.min(previewOffset, samples.length - previewPageSize));
              const body = [...menu, ...samples.slice(previewOffset, previewOffset + previewPageSize),
                ...(demo === "show" ? [theme.fg("dim", `PgUp/PgDn preview (${previewOffset + 1}–${Math.min(samples.length, previewOffset + previewPageSize)}/${samples.length})`)] : []),
                theme.fg("dim", "↑↓ navigate · ←→ adjust · Enter select · Esc close")];
              const edge = "─".repeat(Math.max(0, width - 2));
              return [theme.fg("border", `┌${edge}┐`), ...body.map(line => {
                const content = truncateToWidth(line, innerWidth);
                return theme.fg("border", "│ ") + content + " ".repeat(Math.max(0, innerWidth - visibleWidth(content))) + theme.fg("border", " │");
              }), theme.fg("border", `└${edge}┘`)].map(line => truncateToWidth(line, width));
            },
            handleInput(data: string): void {
              try {
                const size = main.length;
                if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown)) {
                  const direction = matchesKey(data, Key.pageDown) ? 1 : -1;
                  previewOffset = Math.max(0, Math.min(Math.max(0, previewLength - previewPageSize), previewOffset + direction * previewPageSize));
                } else if (keys.matches(data, "tui.select.up")) selected = (selected + size - 1) % size;
                else if (keys.matches(data, "tui.select.down")) selected = (selected + 1) % size;
                else if (keys.matches(data, "tui.select.cancel")) { done(); return; }
                else if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
                  const direction = matchesKey(data, Key.right) ? 1 : -1;
                  if (selected === 1) {
                    const mode = modes[(modes.indexOf(preferences.mode) + direction + modes.length) % modes.length];
                    perform({ ...preferences, mode });
                  } else if (selected === 2) {
                    const value = Math.max(20, Math.min(100, preferences.saturation + direction * 5));
                    if (value !== preferences.saturation) perform({ ...preferences, saturation: value });
                  } else if (selected === 3) {
                    demo = demo === "show" ? "hide" : "show";
                  } else return;
                } else if (keys.matches(data, "tui.select.confirm")) {
                  if (selected === 0) perform(preferences, true);
                } else return;
                redraw();
              } catch (error) { ctx.ui.notify(`pi-rnd-theme: ${String(error)}`, "error"); }
            },
            invalidate() {},
          };
        }, { overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "90%" } });
      } catch (error) { ctx.ui.notify(`pi-rnd-theme: ${String(error)}`, "error"); }
    },
  });
}
