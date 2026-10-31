import type { Theme, ThemeBg, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

/** A static conversation, restyled with the active theme on every render. No tools are executed. */
export function renderPreview(theme: Theme, width: number): string[] {
  const fg = (token: ThemeColor, text: string) => theme.fg(token, text);
  const fit = (line: string) => truncateToWidth(line, width);
  const panel = (bg: ThemeBg, content: string) => {
    const line = fit(` ${content}`);
    return theme.bg(bg, line + " ".repeat(Math.max(0, width - visibleWidth(line))));
  };
  const rule = (token: ThemeColor) => fg(token, "─".repeat(Math.max(0, width)));
  const code = (content: string) => fg("mdCodeBlockBorder", "│ ") + content;

  return [
    rule("borderAccent"),
    fg("muted", "you"),
    panel("userMessageBg", fg("userMessageText", "Please fix the failing login test and show the change.")),
    "",
    fg("customMessageLabel", "session note") + fg("muted", " · project context"),
    panel("customMessageBg", fg("customMessageText", "Run the focused test before editing auth.ts.")),
    "",
    fg("accent", "assistant") + fg("thinkingText", "  Checking the failing assertion first…"),
    fg("mdHeading", "## Login test"),
    fg("text", "The request is missing its ") + fg("mdCode", "`Authorization`") + fg("text", " header."),
    fg("mdListBullet", "• ") + fg("text", "Add the bearer token to the test request."),
    fg("mdListBullet", "• ") + fg("text", "Re-run the focused suite after the edit."),
    fg("mdQuoteBorder", "│ ") + fg("mdQuote", "Keep the production auth flow unchanged."),
    fg("text", "See ") + fg("mdLink", "auth guide") + fg("dim", " (") + fg("mdLinkUrl", "https://docs.example.test/auth") + fg("dim", ")"),
    fg("mdHr", "────────────────────────"),
    fg("text", "Patch in ") + fg("mdCode", "`auth.spec.ts`") + fg("text", ":"),
    fg("mdCodeBlockBorder", "```typescript"),
    code(fg("syntaxComment", "// Authenticate the request")),
    code(fg("syntaxKeyword", "const ") + fg("syntaxVariable", "token") + fg("syntaxOperator", " = ") +
      fg("syntaxFunction", "signIn") + fg("syntaxPunctuation", "(") + fg("syntaxString", '"ada@example.test"') + fg("syntaxPunctuation", ");")),
    code(fg("syntaxKeyword", "const ") + fg("syntaxVariable", "status") + fg("syntaxOperator", ": ") +
      fg("syntaxType", "number") + fg("syntaxOperator", " = ") + fg("syntaxNumber", "200") + fg("syntaxPunctuation", ";")),
    code(fg("mdCodeBlock", "expect(response.status).toBe(status);")),
    fg("mdCodeBlockBorder", "```"),
    "",
    fg("toolTitle", "● bash") + fg("muted", "  npm test -- auth.spec.ts"),
    panel("toolPendingBg", fg("warning", "◌ Running") + fg("toolOutput", " · waiting for test results…")),
    panel("toolErrorBg", fg("error", "✗ Failed") + fg("toolOutput", " · expected 200, received 401")),
    fg("toolTitle", "● edit") + fg("muted", "  auth.spec.ts"),
    fg("toolDiffContext", "  const response = await request(app)"),
    fg("toolDiffRemoved", "-   .get('/login');"),
    fg("toolDiffAdded", "+   .get('/login').set('Authorization', `Bearer ${token}`);"),
    fg("toolDiffContext", "  expect(response.status).toBe(200);"),
    fg("toolTitle", "● bash") + fg("muted", "  npm test -- auth.spec.ts"),
    panel("toolSuccessBg", fg("success", "✓ Passed") + fg("toolOutput", " · 4 tests passed (1.2s)")),
    fg("text", "Fixed the test request; ") + fg("success", "4 tests pass") + fg("text", "."),
    "",
    rule("border"),
    fg("dim", "Session controls · examples"),
    theme.bg("selectedBg", fg("accent", "  › auth.spec.ts  ")) + "  " +
      theme.bg("searchMatchBg", fg("searchMatchText", "login")) + fg("muted", "  1 match"),
    fg("borderMuted", "──────────────────") + fg("scrollbarTrack", "░░░") + fg("scrollbarThumb", "█") + fg("scrollbarTrack", "░░"),
    fg("muted", "Thinking: ") + (["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const)
      .map(level => fg((`thinking${level[0].toUpperCase()}${level.slice(1)}`) as ThemeColor, level)).join("  "),
    fg("bashMode", "❯") + fg("text", " npm test -- auth.spec.ts"),
  ].map(fit);
}
