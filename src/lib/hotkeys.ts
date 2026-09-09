export type HotkeyScope = "global" | "app";

export type HotkeyActionId =
  | "quick_add"
  | "inspiration"
  | "ledger_quick_add"
  | "command_palette";

export type HotkeyAction = {
  id: HotkeyActionId;
  label: string;
  hint: string;
  scope: HotkeyScope;
  enabledKey: string;
  acceleratorKey: string;
  defaultAccelerator: string;
};

export const HOTKEYS_CHANGED_EVENT = "hotkeys:changed";

export const HOTKEY_ACTIONS: readonly HotkeyAction[] = [
  {
    id: "quick_add",
    label: "快速新建任务",
    hint: "弹出快速添加窗口，在其他应用中也可唤起",
    scope: "global",
    enabledKey: "hotkey.quick_add.enabled",
    acceleratorKey: "hotkey.quick_add.accelerator",
    defaultAccelerator: "CommandOrControl+Shift+N",
  },
  {
    id: "inspiration",
    label: "拾念",
    hint: "弹出拾念窗口，随时记下灵感",
    scope: "global",
    enabledKey: "hotkey.inspiration.enabled",
    acceleratorKey: "hotkey.inspiration.accelerator",
    defaultAccelerator: "CommandOrControl+Shift+Space",
  },
  {
    id: "ledger_quick_add",
    label: "快速记一笔",
    hint: "打开观流账本并聚焦金额输入框",
    scope: "global",
    enabledKey: "hotkey.ledger.quick_add.enabled",
    acceleratorKey: "hotkey.ledger.quick_add.accelerator",
    defaultAccelerator: "CommandOrControl+Shift+B",
  },
  {
    id: "command_palette",
    label: "命令面板",
    hint: "在主窗口搜索任务或跳转页面",
    scope: "app",
    enabledKey: "hotkey.command_palette.enabled",
    acceleratorKey: "hotkey.command_palette.accelerator",
    defaultAccelerator: "CommandOrControl+K",
  },
];

export type HotkeyDraft = {
  enabled: boolean;
  accelerator: string;
};

export function hotkeyActionById(id: HotkeyActionId): HotkeyAction {
  const action = HOTKEY_ACTIONS.find((item) => item.id === id);
  if (!action) throw new Error(`未知快捷键动作：${id}`);
  return action;
}

export function isHotkeyEnabled(raw: string | null | undefined): boolean {
  return raw !== "false";
}

export function resolveAccelerator(
  action: HotkeyAction,
  raw: string | null | undefined,
): string {
  return raw?.trim() || action.defaultAccelerator;
}

export function displayAccelerator(accelerator: string): string {
  return accelerator
    .replaceAll("CommandOrControl", "Ctrl/⌘")
    .replaceAll(" ", "Space")
    .replaceAll("+", " + ");
}

export function acceleratorFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (["Escape", "Tab", "Backspace"].includes(event.key)) return null;
  const hasModifier = event.ctrlKey || event.metaKey;
  if (!hasModifier) return null;
  if (["Control", "Meta", "Shift", "Alt"].includes(event.key)) return null;
  const key = keyToken(event.key);
  if (!key) return null;
  return ["CommandOrControl", event.altKey ? "Alt" : "", event.shiftKey ? "Shift" : "", key]
    .filter(Boolean)
    .join("+");
}

export function matchesAccelerator(event: KeyboardEvent, accelerator: string): boolean {
  const parts = accelerator.split("+").filter(Boolean);
  const wantCtrl = parts.includes("CommandOrControl") || parts.includes("Control") || parts.includes("CmdOrCtrl");
  const wantAlt = parts.includes("Alt");
  const wantShift = parts.includes("Shift");
  const key = parts
    .filter(
      (part) =>
        !["CommandOrControl", "Control", "CmdOrCtrl", "Alt", "Shift", "Super", "Meta"].includes(part),
    )
    .join("+");
  if (wantCtrl !== (event.ctrlKey || event.metaKey)) return false;
  if (wantAlt !== event.altKey) return false;
  if (wantShift !== event.shiftKey) return false;
  return keyToken(event.key).toLowerCase() === key.toLowerCase();
}

export function findHotkeyConflict(
  id: HotkeyActionId,
  drafts: Record<HotkeyActionId, HotkeyDraft>,
): HotkeyAction | null {
  const current = drafts[id];
  if (!current?.enabled || !current.accelerator) return null;
  for (const action of HOTKEY_ACTIONS) {
    if (action.id === id) continue;
    const other = drafts[action.id];
    if (!other?.enabled) continue;
    if (other.accelerator === current.accelerator) return action;
  }
  return null;
}

export function notifyHotkeysChanged() {
  window.dispatchEvent(new Event(HOTKEYS_CHANGED_EVENT));
}

function keyToken(key: string): string {
  if (key === " " || key === "Spacebar") return "Space";
  if (key.length === 1) return key.toUpperCase();
  return key;
}
