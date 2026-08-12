import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("capability split", () => {
  it("keeps privileged APIs off desktop widgets", () => {
    const widgets = readFileSync(
      "src-tauri/capabilities/desktop-widgets.json",
      "utf8",
    );
    expect(widgets).toContain("widget-dashboard");
    expect(widgets).not.toContain("http:default");
    expect(widgets).not.toContain("fs:allow-write-text-file");
    expect(widgets).not.toContain("global-shortcut");
    expect(widgets).not.toContain("dialog:default");

    const main = readFileSync("src-tauri/capabilities/main.json", "utf8");
    expect(main).toContain('"main"');
    expect(main).toContain("fs:allow-write-text-file");
    expect(main).toContain("http:default");
  });

  it("enables a non-null CSP in tauri.conf", () => {
    const conf = readFileSync("src-tauri/tauri.conf.json", "utf8");
    expect(conf).toContain('"csp"');
    expect(conf).not.toMatch(/"csp"\s*:\s*null/);
    expect(conf).toContain("connect-src");
  });
});
