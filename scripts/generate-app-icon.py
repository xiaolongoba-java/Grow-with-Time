# -*- coding: utf-8 -*-
"""Write the filled checkmark brand mark used for desktop/taskbar icons."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MARK = ROOT / "design" / "branding" / "grow-with-time-app-icon-check.png"
OUT = ROOT / "src-tauri" / "icons" / "app-icon-source.png"
SIZE = 1024


def main() -> None:
    im = Image.open(MARK).convert("RGB").resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, "PNG")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
