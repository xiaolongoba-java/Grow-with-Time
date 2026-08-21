# -*- coding: utf-8 -*-
"""Compose the checkmark mark onto a light rounded plate for OS icons."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MARK = ROOT / "design" / "branding" / "grow-with-time-mark-final.png"
OUT = ROOT / "src-tauri" / "icons" / "app-icon-source.png"
SIZE = 1024
PAD = 52
RADIUS = 226
FILL = "#F8FBFF"
STROKE = "#DCE8F7"
STROKE_W = 20


def trim(im: Image.Image) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    return im.crop(bbox) if bbox else im


def main() -> None:
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    box = [PAD, PAD, SIZE - PAD, SIZE - PAD]
    draw.rounded_rectangle(box, radius=RADIUS, fill=FILL)
    inner = [PAD + 10, PAD + 10, SIZE - PAD - 10, SIZE - PAD - 10]
    draw.rounded_rectangle(inner, radius=RADIUS - 10, outline=STROKE, width=STROKE_W)

    mark = trim(Image.open(MARK).convert("RGBA"))
    target = int(SIZE * 0.72)
    mark.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (SIZE - mark.width) // 2
    y = (SIZE - mark.height) // 2
    canvas.alpha_composite(mark, (x, y))
    # Keep the rounded-plate corners transparent. Flattening to RGB fills them black,
    # which shows up as a black square behind desktop/taskbar icons.
    canvas.save(OUT, "PNG")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes mode={canvas.mode}")


if __name__ == "__main__":
    main()
