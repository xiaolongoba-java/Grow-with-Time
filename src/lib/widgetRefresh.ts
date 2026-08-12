import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export const DATA_CHANGED_EVENT = "app:data-changed";

/** Broadcast so desktop widgets / float can refresh without blind polling. */
export async function emitDataChanged(reason = "update"): Promise<void> {
  try {
    await emit(DATA_CHANGED_EVENT, { reason, at: Date.now() });
  } catch {
    /* non-tauri / early boot */
  }
}

type RefreshFn = () => void | Promise<void>;

/**
 * Event-driven refresh with a slow fallback poll only while the window is visible.
 * Hidden windows pause both the event work and the fallback timer.
 */
export function bindVisibleDataRefresh(
  refresh: RefreshFn,
  options?: { fallbackMs?: number },
): () => void {
  const fallbackMs = options?.fallbackMs ?? 30_000;
  let unlistenEvent: UnlistenFn | undefined;
  let unlistenVisibility: UnlistenFn | undefined;
  let pollId = 0;
  let disposed = false;

  const run = () => {
    if (disposed) return;
    void Promise.resolve(refresh());
  };

  const clearPoll = () => {
    if (pollId) {
      window.clearInterval(pollId);
      pollId = 0;
    }
  };

  const armPoll = () => {
    clearPoll();
    if (disposed || document.visibilityState === "hidden") return;
    pollId = window.setInterval(run, fallbackMs);
  };

  void listen(DATA_CHANGED_EVENT, () => {
    if (document.visibilityState === "hidden") return;
    run();
  }).then((fn) => {
    if (disposed) {
      fn();
      return;
    }
    unlistenEvent = fn;
  });

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      run();
      armPoll();
    } else {
      clearPoll();
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const current = getCurrentWebviewWindow();
  void current
    .onFocusChanged(({ payload: focused }) => {
      if (focused) {
        run();
        armPoll();
      }
    })
    .then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenVisibility = fn;
    })
    .catch(() => {
      /* ignore */
    });

  run();
  armPoll();

  return () => {
    disposed = true;
    clearPoll();
    document.removeEventListener("visibilitychange", onVisibility);
    unlistenEvent?.();
    unlistenVisibility?.();
  };
}
