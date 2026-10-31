// Exercise Pi's real theme controller, including the settings reapplication after session_start.
const assert = require("node:assert/strict");
const { mkdtempSync, mkdirSync, readFileSync, rmSync } = require("node:fs");
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
    const { default: extension } = createJiti(__filename, {
      alias: {
        "@earendil-works/pi-coding-agent": join(__dirname, "theme-stub.cjs"),
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
      setTheme(name) {
        const result = controller.setThemeName(name);
        if (result.success) setting = name;
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
        "@earendil-works/pi-coding-agent": join(__dirname, "theme-stub.cjs"),
        "@earendil-works/pi-tui": join(resolve(packagePath), "../pi-tui/dist/index.js"),
      },
    })("./preview.ts");
    for (const width of [1, 4, 8, 20, 32, 90]) {
      assert.ok(renderPreview(ui.theme, width).every(line => tuiModule.visibleWidth(line) <= width), `real ANSI preview exceeds ${width} columns`);
    }
    await command("light", ctx);
    await command("randomize", ctx);
    const selectedName = setting;
    const selectedAccent = ui.theme.fg("accent", "test");
    const previewBefore = renderPreview(ui.theme, 90).join("\n");
    const localPath = join(cwd, ".pi", "pi-rnd-theme.json");
    const selectedDocument = readFileSync(localPath, "utf8");
    await command("dark", ctx);
    assert.notEqual(renderPreview(ui.theme, 90).join("\n"), previewBefore, "mode changes must restyle the open preview");
    await command("light", ctx);
    assert.equal(renderPreview(ui.theme, 90).join("\n"), previewBefore);
    assert.equal(setting, selectedName, "mode changes must not reset the selected colors");
    assert.equal(readFileSync(localPath, "utf8"), selectedDocument);
    // Match resource discovery retaining Theme instances from the cached files.
    themeModule.setRegisteredThemes([themeModule.getThemeByName(selectedName)]);
    for (const reason of ["reload", "new"]) {
      loadExtension();
      if (reason === "new") makeController();
      start({ reason }, ctx);
      controller.applyFromSettings();
      assert.equal(setting, selectedName);
      assert.equal(ui.theme.name, selectedName);
      assert.equal(ui.theme.appearance, "light");
      assert.equal(ui.theme.fg("accent", "test"), selectedAccent);
      assert.equal(readFileSync(localPath, "utf8"), selectedDocument);
    }
    await command("randomize", ctx);
    assert.notEqual(setting, selectedName, "new palettes must bypass registered-theme cache");
    assert.notEqual(renderPreview(ui.theme, 90).join("\n"), previewBefore, "preview must use the newly selected theme immediately");
    const nextAccent = ui.theme.fg("accent", "test");
    controller.applyFromSettings();
    assert.equal(ui.theme.fg("accent", "test"), nextAccent);
    console.log("OK: real Pi controller, immediate preview restyling, ANSI widths, reload/new and theme cache");
  } finally {
    controller?.dispose();
    const themeModule = await import(pathToFileURL(join(resolve(packagePath), "dist/modes/interactive/theme/theme.js")).href);
    themeModule.stopThemeWatcher();
    rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
