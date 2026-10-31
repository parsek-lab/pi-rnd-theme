const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createJiti } = require("jiti");

const root = mkdtempSync(join(tmpdir(), "pi-rnd-theme-"));
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
const jiti = createJiti(__filename, {
  alias: {
    "@earendil-works/pi-coding-agent": join(__dirname, "theme-stub.cjs"),
    "@earendil-works/pi-tui": join(__dirname, "tui-stub.cjs"),
  },
});
const { default: extension, generatePalette, withSaturation, withAppearance } = jiti("./index.ts");
const { renderPreview } = jiti("./preview.ts");

(async () => {
  const cwd = join(root, "project");
  const second = join(root, "another-project");
  mkdirSync(join(cwd, ".pi"), { recursive: true });
  mkdirSync(second, { recursive: true });
  try {
    const usedTokens = new Set();
    const sampleTheme = {
      fg(token, text) { usedTokens.add(token); return text; },
      bg(token, text) { usedTokens.add(token); return text; },
    };
    const transcript = renderPreview(sampleTheme, 100).join("\n");
    for (const excerpt of ["you", "assistant", "## Login test", "```typescript", "const token", "Running", "Failed", "Passed", "-   .get", "+   .get", "4 tests pass"]) {
      assert.ok(transcript.includes(excerpt), `missing transcript excerpt: ${excerpt}`);
    }
    assert.ok(transcript.indexOf("you") < transcript.indexOf("assistant"));
    assert.ok(transcript.indexOf("Failed") < transcript.indexOf("Passed"));
    assert.doesNotMatch(transcript, /syntaxKeyword|toolDiffAdded|userMessageBg/, "show content, not token names");
    for (const width of [1, 8, 20, 32, 90]) {
      assert.ok(renderPreview(sampleTheme, width).every(line => line.length <= width), `preview exceeds ${width} columns`);
    }
    const tagged = tag => ({ fg: (token, text) => `<${tag}:${token}>${text}</>`, bg: (token, text) => `<${tag}:${token}>${text}</>` });
    assert.match(renderPreview(tagged("before"), 90).join("\n"), /<before:syntaxKeyword>/);
    assert.match(renderPreview(tagged("after"), 90).join("\n"), /<after:syntaxKeyword>/);
    const themeTokens = Object.keys(JSON.parse(readFileSync(join(__dirname, "dark.json"))).colors);
    assert.deepEqual([...usedTokens].sort(), themeTokens.sort(), "preview must demonstrate every theme token");
    const a = generatePalette(cwd, "dark");
    assert.deepEqual(a, generatePalette(cwd, "dark"));
    assert.notEqual(a.vars.violet, generatePalette(second, "dark").vars.violet);
    assert.deepEqual(withSaturation(a, 50), a);
    assert.deepEqual(withSaturation(a, 0), withSaturation(a, 20));
    assert.deepEqual(withAppearance(withAppearance(a, "light"), "dark"), a);

    const legacy = join(cwd, ".pi", "pi-rnd-theme-mode.json");
    writeFileSync(legacy, JSON.stringify({ mode: "light" }));
    let start, command, screen;
    let terminalAppearance;
    let savedThemeName = "dark";
    let current = { appearance: "dark", getColorMode: () => "truecolor", fg: (_key, text) => text };
    const notices = [];
    const ui = {
      get theme() { return current; },
      getTheme(name) { assert.equal(name, "system"); return terminalAppearance && { appearance: terminalAppearance }; },
      setTheme(name) {
        assert.equal(typeof name, "string", "theme must be selected by name, not just in memory");
        savedThemeName = name;
        const saved = JSON.parse(readFileSync(join(process.env.PI_CODING_AGENT_DIR, "themes", `${name}.json`), "utf8"));
        current = { ...saved, getColorMode: () => "truecolor", fg: (_key, text) => text, bg: (_key, text) => text };
        return { success: true };
      },
      notify(message, type) { notices.push([message, type]); },
      custom: async (factory, options) => {
        assert.equal(options.overlay, true);
        assert.equal(options.overlayOptions.anchor, "center");
        let finish;
        const closed = new Promise(resolve => { finish = resolve; });
        screen = factory({ requestRender() {}, terminal: { rows: 24 } }, null,
          { matches: (data, key) => data === ({ "tui.select.up": "up", "tui.select.down": "down", "tui.select.confirm": "enter", "tui.select.cancel": "escape" })[key] },
          finish);
        await closed;
      },
    };
    extension({ on(event, handler) { if (event === "session_start") start = handler; }, registerCommand(name, config) { assert.equal(name, "rnd-theme"); command = config.handler; } });
    const ctx = { mode: "tui", cwd, ui };
    const palettePath = join(cwd, ".pi", "pi-rnd-theme.json");
    const prefPath = join(process.env.PI_CODING_AGENT_DIR, "pi-rnd-theme.json");
    const prefs = () => JSON.parse(readFileSync(prefPath, "utf8"));
    const local = () => JSON.parse(readFileSync(palettePath, "utf8"));
    const palette = () => local().palette;
    start({ reason: "startup" }, ctx);
    assert.deepEqual(prefs(), { mode: "light", saturation: 50 });
    assert.equal(current.appearance, "light");

    await command("randomize", ctx);
    const chosenBase = local().base;
    const chosenHues = base => Object.fromEntries(["vars", "colors", "export"].map(group => [group,
      Object.entries(base[group]).map(([key, value]) => [key, value.match(/^okhsl\((\d+)/)?.[1] ?? value])
    ]));
    const pending = command("", ctx);
    assert.match(screen.render(90).join("\n"), /randomize/);
    assert.match(screen.render(90).join("\n"), /demo: show/);
    assert.match(screen.render(90).join("\n"), /mode: light/);
    assert.match(screen.render(90).join("\n"), /saturation: 50/);
    assert.match(screen.render(90).join("\n"), /Live theme preview/);
    assert.match(screen.render(90).join("\n"), /Please fix the failing login test/);
    screen.handleInput("pageDown");
    assert.match(screen.render(90).join("\n"), /const token/);
    screen.handleInput("pageDown");
    assert.match(screen.render(90).join("\n"), /Passed|Authorization/);
    screen.handleInput("pageDown");
    assert.match(screen.render(90).join("\n"), /Thinking:/);
    for (const width of [4, 8, 20, 32, 90]) {
      assert.ok(screen.render(width).every(line => line.length <= width), `modal exceeds ${width} columns`);
    }
    screen.handleInput("pageUp");
    screen.handleInput("pageUp");
    screen.handleInput("down"); // mode
    screen.handleInput("enter"); // submenu
    assert.match(screen.render(90).join("\n"), /system/);
    screen.handleInput("up");
    screen.handleInput("up");
    screen.handleInput("enter"); // system, terminal unavailable -> dark
    assert.equal(current.appearance, "dark");
    assert.equal(prefs().mode, "system");
    assert.match(screen.render(90).join("\n"), /system \(dark\)/);
    assert.deepEqual(chosenHues(local().base), chosenHues(chosenBase));
    screen.handleInput("right"); // mode cycles system -> dark
    assert.equal(prefs().mode, "dark");
    screen.handleInput("right"); // dark -> light
    assert.equal(prefs().mode, "light");
    assert.deepEqual(local().base, chosenBase, "switching dark -> light must preserve the selected palette");
    screen.handleInput("right"); // wraps to system
    assert.equal(prefs().mode, "system");
    screen.handleInput("left"); // wraps to light
    assert.equal(prefs().mode, "light");
    screen.handleInput("right");
    screen.handleInput("enter"); // mode submenu also supports arrows
    screen.handleInput("right");
    assert.equal(prefs().mode, "dark");
    screen.handleInput("left");
    assert.equal(prefs().mode, "system");
    screen.handleInput("escape");
    screen.handleInput("down"); // saturation
    screen.handleInput("left");
    assert.equal(prefs().saturation, 45);
    assert.equal(palette().vars.violet, withSaturation(local().base, 45).vars.violet);
    screen.handleInput("right");
    assert.equal(prefs().saturation, 50);
    const fullColor = readFileSync(palettePath, "utf8");
    for (let i = 0; i < 10; i++) screen.handleInput("left");
    assert.equal(prefs().saturation, 20);
    for (let i = 0; i < 6; i++) screen.handleInput("right");
    assert.equal(prefs().saturation, 50);
    assert.equal(readFileSync(palettePath, "utf8"), fullColor);
    screen.handleInput("down"); // demo
    screen.handleInput("left");
    assert.match(screen.render(90).join("\n"), /demo: hide/);
    assert.doesNotMatch(screen.render(90).join("\n"), /Live theme preview|Please fix the failing login test|PgUp\/PgDn preview/);
    screen.handleInput("right");
    assert.match(screen.render(90).join("\n"), /Live theme preview/);
    screen.handleInput("pageUp");
    screen.handleInput("pageUp");
    screen.handleInput("pageUp");
    assert.match(screen.render(90).join("\n"), /Please fix the failing login test/);
    screen.handleInput("up"); // saturation
    const selected = readFileSync(palettePath, "utf8");
    screen.handleInput("up");
    screen.handleInput("up"); // new
    screen.handleInput("enter");
    assert.notEqual(readFileSync(palettePath, "utf8"), selected);
    assert.equal(prefs().mode, "system");
    screen.handleInput("escape");
    await pending;

    terminalAppearance = "light";
    start({ reason: "startup" }, ctx);
    const savedLocal = readFileSync(palettePath, "utf8");
    for (const reason of ["reload", "new"]) {
      start({ reason }, ctx);
      ui.setTheme(savedThemeName); // Pi reapplies its persisted theme setting after session_start
      assert.equal(current.appearance, "light");
      assert.equal(readFileSync(palettePath, "utf8"), savedLocal);
    }
    assert.deepEqual(prefs(), { mode: "system", saturation: 50 });

    const otherCtx = { ...ctx, cwd: second };
    start({ reason: "startup" }, otherCtx);
    assert.equal(current.appearance, "light");
    assert.deepEqual(prefs(), { mode: "system", saturation: 50 });
    assert.notEqual(palette().vars.violet, JSON.parse(readFileSync(join(second, ".pi", "pi-rnd-theme.json"))).palette.vars.violet);
    assert.ok(notices.every(([, type]) => type !== "error"), JSON.stringify(notices));
    assert.deepEqual(readdirSync(join(second, ".pi")), ["pi-rnd-theme.json"]);
    const migration = join(root, "legacy-project");
    mkdirSync(join(migration, ".pi"), { recursive: true });
    const legacyPalette = generatePalette(migration, "light", "saved-selection");
    writeFileSync(join(migration, ".pi", "pi-rnd-theme.json"), JSON.stringify(legacyPalette));
    writeFileSync(join(migration, ".pi", "pi-rnd-theme-base.json"), JSON.stringify(legacyPalette));
    start({ reason: "startup" }, { ...ctx, cwd: migration });
    const migrated = JSON.parse(readFileSync(join(migration, ".pi", "pi-rnd-theme.json")));
    assert.deepEqual(migrated.base, legacyPalette);
    assert.deepEqual(migrated.palette, legacyPalette);
    writeFileSync(prefPath, JSON.stringify({ mode: "system", saturation: 0 }));
    start({ reason: "reload" }, ctx);
    assert.equal(prefs().saturation, 20, "old preferences below the minimum must migrate");
    console.log("OK: contextual preview, narrow widths, scrolling, demo hide/show, randomize, system mode, saturation minimum 20, persistence, reload/new");
  } finally { rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
