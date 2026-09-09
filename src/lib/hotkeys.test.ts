import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HOTKEY_ACTIONS,
  acceleratorFromKeyboardEvent,
  displayAccelerator,
  findHotkeyConflict,
  matchesAccelerator,
  resolveAccelerator,
  type HotkeyDraft,
} from "./hotkeys";

function keyEvent(partial: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "k",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...partial,
  } as KeyboardEvent;
}

describe("hotkey registry", () => {
  it("gives every shortcut-backed feature a unique default accelerator", () => {
    const defaults = HOTKEY_ACTIONS.map((action) => action.defaultAccelerator);
    expect(new Set(defaults).size).toBe(defaults.length);
    expect(HOTKEY_ACTIONS.map((action) => action.id).sort()).toEqual(
      ["command_palette", "inspiration", "ledger_quick_add", "quick_add"].sort(),
    );
  });

  it("detects conflicts only among enabled actions", () => {
    const drafts = {
      quick_add: { enabled: true, accelerator: "CommandOrControl+Shift+N" },
      inspiration: { enabled: true, accelerator: "CommandOrControl+Shift+N" },
      ledger_quick_add: { enabled: false, accelerator: "CommandOrControl+Shift+N" },
      command_palette: { enabled: true, accelerator: "CommandOrControl+K" },
    } satisfies Record<string, HotkeyDraft>;
    expect(findHotkeyConflict("quick_add", drafts)?.id).toBe("inspiration");
    expect(findHotkeyConflict("ledger_quick_add", drafts)).toBeNull();
  });

  it("maps Space and letters into Tauri accelerators", () => {
    expect(
      acceleratorFromKeyboardEvent(
        keyEvent({ key: " ", ctrlKey: true, shiftKey: true }),
      ),
    ).toBe("CommandOrControl+Shift+Space");
    expect(acceleratorFromKeyboardEvent(keyEvent({ key: "n", metaKey: true, shiftKey: true }))).toBe(
      "CommandOrControl+Shift+N",
    );
    expect(acceleratorFromKeyboardEvent(keyEvent({ key: "N", ctrlKey: false }))).toBeNull();
  });

  it("matches in-app accelerators including Ctrl/Cmd+K", () => {
    expect(
      matchesAccelerator(keyEvent({ key: "k", ctrlKey: true }), "CommandOrControl+K"),
    ).toBe(true);
    expect(
      matchesAccelerator(keyEvent({ key: "k", metaKey: true }), "CommandOrControl+K"),
    ).toBe(true);
    expect(
      matchesAccelerator(keyEvent({ key: "k", ctrlKey: true, shiftKey: true }), "CommandOrControl+K"),
    ).toBe(false);
  });

  it("falls back to the action default accelerator", () => {
    const action = HOTKEY_ACTIONS[0];
    expect(resolveAccelerator(action, null)).toBe(action.defaultAccelerator);
    expect(displayAccelerator("CommandOrControl+Shift+N")).toContain("Ctrl/⌘");
  });
});

describe("settings surface", () => {
  it("registers every global hotkey from the shared catalog", () => {
    const source = readFileSync("src/app/MainApp.tsx", "utf8");
    expect(source).toContain("HOTKEY_ACTIONS.filter");
    expect(source).toContain("handlers[action.id]");
  });

  it("renders the shared hotkey registry in settings", () => {
    const source = readFileSync("src/components/SettingsView.tsx", "utf8");
    expect(source).toContain("HOTKEY_ACTIONS");
    expect(source).toContain("findHotkeyConflict");
  });
});
