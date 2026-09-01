import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rust = readFileSync("src-tauri/src/lib.rs", "utf8");
const mainApp = readFileSync("src/app/MainApp.tsx", "utf8");

describe("desktop widget reliability contract", () => {
  it("does not demote visible widgets when the main window closes", () => {
    expect(rust).not.toContain("refresh_visible_desktop_widgets");
  });

  it("opens a replacement mode before hiding the current mode", () => {
    const classic = rust.slice(
      rust.indexOf("fn show_desktop_widgets"),
      rust.indexOf("fn show_dashboard_strip"),
    );
    expect(classic.indexOf("pin_desktop_widget")).toBeLessThan(
      classic.indexOf('hide_labeled_windows(&app, &["widget-dashboard"])'),
    );

    const dashboard = rust.slice(
      rust.indexOf("fn show_dashboard_strip"),
      rust.indexOf("fn toggle_desktop_widgets"),
    );
    expect(dashboard.indexOf("pin_desktop_widget")).toBeLessThan(
      dashboard.indexOf('hide_labeled_windows(&app, &["widget-calendar"'),
    );
  });

  it("validates widget navigation and targets only the main window", () => {
    expect(rust).toContain("widget_nav_allowed(value)");
    expect(rust).toContain('emit_to("main", "widget:navigate"');
  });

  it("keeps the saved layer when widgets are opened from the tray", () => {
    expect(rust).toContain('emit("tray:desktop-widgets", "dashboard")');
    expect(rust).toContain('emit("tray:desktop-widgets", "classic")');
    expect(rust).not.toContain('show_dashboard_strip(app.clone(), Some("bottom".into()))');
    expect(rust).not.toContain('show_desktop_widgets(app.clone(), Some("bottom".into()))');
    expect(mainApp).toContain("current.desktopWidgetLayer");
  });
});
