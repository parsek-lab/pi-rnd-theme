module.exports = {
  Key: { left: "left", right: "right", pageUp: "pageUp", pageDown: "pageDown" },
  matchesKey: (data, key) => data === key,
  truncateToWidth: (line, width) => line.slice(0, width),
  visibleWidth: line => line.length,
};
