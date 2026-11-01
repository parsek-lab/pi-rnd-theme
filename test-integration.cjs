// Exercise Pi's real theme controller, including the settings reapplication after session_start.
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const { createJiti } = require("jiti");

(async () => {
  const packagePath = process.argv[2];
  if (!packagePath) throw new Error("Usage: node test-integration.cjs /path/to/@earendil-works/pi-coding-agent");
  const root = mkdtempSync(join(tmpdir(), "pi-rnd-integration-"));
  process.env.PI_CODING_AGENT_DIR = join(root, "agent");
  mkdirSync(process.env.PI_CODING_AGENT_DIR, { recursive: true });
  const cwd = join(root, "project");
  mkdirSync(cwd);
  let controller;
  try {
    const moduleUrl = file => pathToFileURL(join(resolve(packagePath), "dist/modes/interactive/theme", file)).href;
    const themeModule = await import(moduleUrl("theme.js"));
    const { InteractiveThemeController } = await import(moduleUrl("theme-controller.js"));
    // Use Pi's real Theme class so ui.setTheme() recognises the generated instances.
    globalThis.__realPiTheme = themeModule.Theme;
    const shim = join(root, "pi-shim.cjs");
    writeFileSync(shim, "module.exports = { Theme: globalThis.__realPiTheme, getAgentDir: () => process.env.PI_CODING_AGENT_DIR };");
    const { default: extension } = createJiti(__filename, {
      alias: {
        "@earendil-works/pi-coding-agent": shim,
        "@earendil-works/pi-tui": join(__dirname, "tui-stub.cjs"),
      },
    })("./index.ts");
    let setting = "dark";
    const tui = {
      invalidate() {}, requestRender() {}, setTerminalColorSchemeNotifications() {},
      onTerminalColorSchemeChange() { return () => {}; },
    };
    const makeController = () => {
      controller?.dispose();
      controller = new InteractiveThemeController(tui, {
        getSettingsManager: () => ({ getThemeSetting: () => setting }),
        onChanged() {}, showError(message) { throw new Error(message); },
      });
      // Terminal IO is irrelevant to restoring a saved named theme.
      controller.queryTerminalColors = () => {};
    };
    makeController();
    const ui = {
      get theme() { return themeModule.theme; },
      getTheme: name => themeModule.getThemeByName(name),
      setTheme(theme) {
        if (typeof theme !== "string") return controller.setThemeInstance(theme);
        const result = controller.setThemeName(theme);
        if (result.success) setting = theme;
        return result;
      },
      notify(message, type) { if (type === "error") throw new Error(message); },
    };
    let start, command;
    const loadExtension = () => extension({
      on(event, handler) { if (event === "session_start") start = handler; },
      registerCommand(_name, definition) { command = definition.handler; },
    });
    loadExtension();
    const ctx = { mode: "tui", cwd, ui };
    start({ reason: "startup" }, ctx);
    const tuiModule = await import(pathToFileURL(join(resolve(packagePath), "../pi-tui/dist/index.js")).href);
    const { renderPreview } = createJiti(__filename, {
      alias: {
        "@earendil-works/pi-coding-agent": shim,
        "@earendil-works/pi-tui": join(resolve(packagePath), "../pi-tui/dist/index.js"),
      },
    })("./preview.ts");
    for (const width of [1, 4, 8, 20, 32, 90]) {
      assert.ok(renderPreview(ui.theme, width).every(line => tuiModule.visibleWidth(line) <= width), `real ANSI preview exceeds ${width} columns`);
    }
    await command("light", ctx);
    await command("randomize", ctx);
    const selectedTheme = ui.theme;
    const selectedAccent = ui.theme.fg("accent", "test");
    const previewBefore = renderPreview(ui.theme, 90).join("\n");
    const localPath = join(cwd, ".pi", "pi-rnd-theme.json");
    const selectedDocument = readFileSync(localPath, "utf8");
    const themesDir = join(process.env.PI_CODING_AGENT_DIR, "themes");
    assert.equal(existsSync(themesDir), false, "no theme files in the discovered directory");
    assert.match(ui.theme.name, /^pi-rnd-[0-9a-f]{12}$/);
    await command("dark", ctx);
    assert.notEqual(renderPreview(ui.theme, 90).join("\n"), previewBefore, "mode changes must restyle the open preview");
    await command("light", ctx);
    assert.equal(renderPreview(ui.theme, 90).join("\n"), previewBefore);
    assert.equal(readFileSync(localPath, "utf8"), selectedDocument, "mode changes must not reset the selected colors");
    for (const reason of ["reload", "new"]) {
      loadExtension();
      if (reason === "new") makeController();
      start({ reason }, ctx);
      controller.applyFromSettings(); // Pi re-applies settings.theme after session_start
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.equal(ui.theme.name, selectedTheme.name);
      assert.equal(ui.theme.appearance, "light");
      assert.equal(ui.theme.fg("accent", "test"), selectedAccent);
      assert.equal(readFileSync(localPath, "utf8"), selectedDocument);
    }
    for (let i = 0; i < 3; i++) await command("randomize", ctx);
    assert.notEqual(renderPreview(ui.theme, 90).join("\n"), previewBefore, "preview must use the newly selected theme immediately");
    const nextAccent = ui.theme.fg("accent", "test");
    assert.notEqual(nextAccent, selectedAccent);
    assert.equal(existsSync(themesDir), false, "randomize must not create theme files");
    assert.equal(setting, "dark", "settings.theme must never name a generated theme");
    console.log("OK: real Pi controller, immediate preview restyling, ANSI widths, reload/new, no discovered theme files");
  } finally {
    controller?.dispose();
    const themeModule = await import(pathToFileURL(join(resolve(packagePath), "dist/modes/interactive/theme/theme.js")).href);
    themeModule.stopThemeWatcher();
    rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
