class Theme {
  constructor(fg, bg, _mode, options) {
    for (const color of Object.values({ ...fg, ...bg })) {
      if (!/^okhsl\(\d+ \d+% \d+%\)$/.test(color)) throw Error(`invalid color: ${color}`);
    }
    this.appearance = options.appearance;
    this.colors = { ...fg, ...bg };
  }
  getColorMode() { return "truecolor"; }
  fg(_color, text) { return text; }
}
module.exports = { Theme, getAgentDir: () => process.env.PI_CODING_AGENT_DIR };
