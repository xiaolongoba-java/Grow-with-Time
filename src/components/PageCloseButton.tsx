import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppStore } from "@/store/app";

export function PageCloseButton({
  onClose,
  label = "关闭",
}: {
  onClose?: () => void;
  label?: string;
}) {
  const nav = useAppStore((state) => state.nav);
  const setNav = useAppStore((state) => state.setNav);

  const close = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (nav !== "today") {
      setNav("today");
      return;
    }
    void getCurrentWindow().close();
  };

  return (
    <button type="button" className="page-close-btn" aria-label={label} title={label} onClick={close}>
      ×
    </button>
  );
}
