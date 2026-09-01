import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { openMainWindow, runWidgetAction } from "./openMainWindow";

describe("desktop widget actions", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal("window", { alert: vi.fn() });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("passes the requested view to the native main-window command", async () => {
    invoke.mockResolvedValue(undefined);
    await expect(openMainWindow("calendar")).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("open_main_window", { nav: "calendar" });
    expect(window.alert).not.toHaveBeenCalled();
  });

  it("reports a window command failure without an unhandled rejection", async () => {
    invoke.mockRejectedValue(new Error("主窗口不可用"));
    await expect(openMainWindow("today")).resolves.toBe(false);
    expect(window.alert).toHaveBeenCalledWith("主窗口不可用");
  });

  it("turns database action failures into a visible result", async () => {
    await expect(runWidgetAction(Promise.reject(new Error("数据库忙")), "保存失败"))
      .resolves.toBe(false);
    expect(window.alert).toHaveBeenCalledWith("数据库忙");
  });
});
