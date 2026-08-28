export type NativeWidgetSnapshot = Record<string, unknown>;

declare global {
  interface Window {
    __GWT_NATIVE_WIDGET__?: boolean;
    __GWT_NATIVE_SNAPSHOT__?: NativeWidgetSnapshot;
    ipc?: { postMessage(message: string): void };
  }
}

export function isNativeWidget(): boolean {
  return window.__GWT_NATIVE_WIDGET__ === true;
}

export function nativeSnapshot(): NativeWidgetSnapshot {
  return window.__GWT_NATIVE_SNAPSHOT__ ?? {};
}

export function nativeSnapshotList<T>(key: string): T[] {
  const value = nativeSnapshot()[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function postNativeWidgetCommand(payload: Record<string, unknown>): void {
  if (!isNativeWidget() || !window.ipc) {
    throw new Error("原生桌面组件通信不可用");
  }
  window.ipc.postMessage(JSON.stringify(payload));
}
