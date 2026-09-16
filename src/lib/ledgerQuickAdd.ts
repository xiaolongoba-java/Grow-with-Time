const LEDGER_OPEN_EVENT = "ledger:open-entry";
let pendingOpenRequest = false;

export function requestLedgerEntryOpen(): void {
  pendingOpenRequest = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LEDGER_OPEN_EVENT));
  }
}

export function subscribeLedgerEntryOpen(open: () => void): () => void {
  const consume = () => {
    if (!pendingOpenRequest) return;
    pendingOpenRequest = false;
    open();
  };
  window.addEventListener(LEDGER_OPEN_EVENT, consume);
  consume();
  return () => window.removeEventListener(LEDGER_OPEN_EVENT, consume);
}
