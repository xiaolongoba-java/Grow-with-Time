# -*- coding: utf-8 -*-
"""Compose the latest brand mark onto a filled square for Windows/macOS app icons."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MARK = ROOT / "design" / "branding" / "grow-with-time-logo-concept-v1.png"
OUT = ROOT / "src-tauri" / "icons" / "app-icon-source.png"
SIZE = 1024
TOP = (42, 108, 224)
BOTTOM = (24, 78, 188)


def vertical_gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (size, size), BOTTOM)
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(size - 1, 1)
        color = tuple(int(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
        draw.line((0, y, size, y), fill=color)
    return img


def trim(im: Image.Image) -> Image.Image:
    alpha = im.split()[-1]
    bbox = alpha.getbbox()
    return im.crop(bbox) if bbox else im


def main() -> None:
    mark = trim(Image.open(MARK).convert("RGBA"))
    canvas = vertical_gradient(SIZE).convert("RGBA")
    target = int(SIZE * 0.78)
    mark.thumbnail((target, target), Image.Resampling.LANCZOS)
    x = (SIZE - mark.width) // 2
    y = (SIZE - mark.height) // 2 - int(SIZE * 0.015)
    canvas.alpha_composite(mark, (x, y))
    canvas.convert("RGB").save(OUT, "PNG")
    print(f"wrote {OUT} {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
