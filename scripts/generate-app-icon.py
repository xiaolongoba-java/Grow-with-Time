# -*- coding: utf-8 -*-
"""Compose the checkmark mark onto a light rounded plate for OS icons.

`npx tauri icon` writes PNG-compressed frames for every ICO size. Windows
Explorer shortcuts and NSIS installer chrome only decode PNG inside 256x256
entries, so smaller sizes fall back to opaque RGB and show a black square.
This script keeps those sizes as 32-bit BMP + AND mask.
"""
from __future__ import annotations

import argparse
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
MARK = ROOT / "design" / "branding" / "grow-with-time-mark-final.png"
OUT = ROOT / "src-tauri" / "icons" / "app-icon-source.png"
ICO = ROOT / "src-tauri" / "icons" / "icon.ico"
SIZE = 1024
PAD = 52
RADIUS = 226
FILL = "#F8FBFF"
FILL_RGB = (248, 251, 255)
STROKE = "#DCE8F7"
STROKE_W = 20
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def trim(im: Image.Image) -> Image.Image:
    bbox = im.split()[-1].getbbox()
    return im.crop(bbox) if bbox else im


def compose() -> Image.Image:
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
    return canvas


def _png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _bmp_icon_bytes(im: Image.Image) -> bytes:
    """32-bit ICO DIB: BGRA XOR bitmap plus 1-bit AND mask, both bottom-up."""
    w, h = im.size
    pixels = im.load()
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            xor.extend((b, g, r, a))

    row_bytes = ((w + 31) // 32) * 4
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(row_bytes)
        for x in range(w):
            if pixels[x, y][3] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask.extend(row)

    header = struct.pack(
        "<IiiHHIIiiII",
        40,
        w,
        h * 2,
        1,
        32,
        0,
        len(xor) + len(mask),
        0,
        0,
        0,
        0,
    )
    return header + bytes(xor) + bytes(mask)


def bleed_transparent(im: Image.Image, rgb: tuple[int, int, int]) -> Image.Image:
    """Keep alpha, but stop downscales from blending plate edges into black RGB."""
    out = im.copy()
    pixels = out.load()
    r, g, b = rgb
    width, height = out.size
    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] == 0:
                pixels[x, y] = (r, g, b, 0)
    return out


def write_windows_ico(source: Image.Image, dest: Path) -> None:
    frames: list[bytes] = []
    bled = bleed_transparent(source, FILL_RGB)
    for size in ICO_SIZES:
        frame = bled.resize((size, size), Image.Resampling.LANCZOS)
        if size == 256:
            frames.append(_png_bytes(frame))
        else:
            frames.append(_bmp_icon_bytes(frame))

    offset = 6 + 16 * len(frames)
    directory = bytearray()
    payload = bytearray()
    for size, data in zip(ICO_SIZES, frames):
        directory.extend(
            struct.pack(
                "<BBBBHHII",
                0 if size == 256 else size,
                0 if size == 256 else size,
                0,
                0,
                1,
                32,
                len(data),
                offset + len(payload),
            )
        )
        payload.extend(data)

    dest.write_bytes(b"\x00\x00\x01\x00" + struct.pack("<H", len(frames)) + directory + payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ico-only", action="store_true", help="rewrite icon.ico from the existing source PNG")
    args = parser.parse_args()

    if args.ico_only:
        canvas = Image.open(OUT).convert("RGBA")
    else:
        canvas = compose()
        canvas.save(OUT, "PNG")
        print(f"wrote {OUT} {OUT.stat().st_size} bytes mode={canvas.mode}")

    write_windows_ico(canvas, ICO)
    print(f"wrote {ICO} {ICO.stat().st_size} bytes")


if __name__ == "__main__":
    main()
