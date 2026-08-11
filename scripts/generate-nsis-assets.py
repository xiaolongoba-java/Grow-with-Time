"""Optional HiDPI NSIS installer bitmaps for Grow with Time.

NOTE: Current releases use the standard Tauri NSIS template without
headerImage/sidebarImage. Run this script only if you manually re-wire
custom branding in src-tauri/tauri.conf.json.

NSIS welcome/finish sidebar is ~164x314 and header ~150x57 at 100% scale.
On HiDPI Windows scales these controls larger, so we ship 3x assets and let
MUI stretch them down — looks sharp at 125%–200% scaling.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "windows" / "nsis"
ICON_CANDIDATES = [
    ROOT / "src-tauri" / "icons" / "icon.png",
    ROOT / "src-tauri" / "icons" / "128x128@2x.png",
    ROOT / "src-tauri" / "icons" / "128x128.png",
]

# Logical NSIS sizes × scale
SCALE = 3
SIDEBAR = (164 * SCALE, 314 * SCALE)  # 492 × 942
HEADER = (150 * SCALE, 57 * SCALE)  # 450 × 171

ACCENT = (52, 120, 238)
ACCENT_DARK = (35, 91, 198)
BG_TOP = (204, 222, 251)
BG_BOTTOM = (248, 216, 224)
TEXT = (17, 27, 49)
TEXT_MUTED = (72, 88, 113)
WHITE = (255, 255, 255)


def app_version() -> str:
    try:
        data = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        return str(data.get("version", "1.0.0"))
    except OSError:
        return "1.0.0"


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw_gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    width, height = size
    img = Image.new("RGB", size)
    px = img.load()
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        for x in range(width):
            px[x, y] = color
    return img


def dawn_background(size: tuple[int, int]) -> Image.Image:
    img = draw_gradient(size, BG_TOP, BG_BOTTOM).convert("RGBA")
    w, h = size
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-w * .22, h * .62, w * .72, h * 1.22), fill=(238, 31, 83, 190))
    gd.ellipse((w * .28, h * .72, w * 1.22, h * 1.24), fill=(255, 111, 105, 145))
    gd.ellipse((-w * .08, -h * .15, w * .82, h * .42), fill=(255, 255, 255, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(max(8, int(w * .045))))
    return Image.alpha_composite(img, glow).convert("RGB")


def load_icon() -> Image.Image | None:
    for path in ICON_CANDIDATES:
        if path.exists():
            return Image.open(path).convert("RGBA")
    return None


def paste_icon(base: Image.Image, box: tuple[int, int, int, int]) -> None:
    icon = load_icon()
    if icon is None:
        return
    x0, y0, x1, y1 = box
    target = (x1 - x0, y1 - y0)
    icon = icon.resize(target, Image.Resampling.LANCZOS)
    base.paste(icon, (x0, y0), icon)


def save_bmp(img: Image.Image, path: Path) -> None:
    # NSIS expects classic 24-bit BMP (no alpha).
    img.convert("RGB").save(path, format="BMP")


def make_header() -> None:
    w, h = HEADER
    img = dawn_background((w, h))
    draw = ImageDraw.Draw(img)

    pad = 18
    icon_box = 96
    draw.rounded_rectangle(
        (pad, (h - icon_box) // 2, pad + icon_box, (h + icon_box) // 2),
        radius=22,
        fill=WHITE,
    )
    paste_icon(
        img,
        (
            pad + 8,
            (h - icon_box) // 2 + 8,
            pad + icon_box - 8,
            (h + icon_box) // 2 - 8,
        ),
    )

    text_x = pad + icon_box + 20
    draw.text((text_x, 42), "日进 · 拾光", fill=TEXT, font=load_font(42, bold=True))
    draw.text((text_x, 100), "Grow with Time", fill=TEXT_MUTED, font=load_font(27))
    save_bmp(img, OUT / "header.bmp")


def make_sidebar() -> None:
    w, h = SIDEBAR
    img = dawn_background((w, h))
    draw = ImageDraw.Draw(img)

    # Soft accent blob behind icon
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((55, 38, 435, 418), fill=(255, 255, 255, 90))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Icon card
    card = (126, 110, 366, 350)
    draw.rounded_rectangle(card, radius=48, fill=(248, 252, 255))
    draw.rounded_rectangle(card, radius=48, outline=(255, 255, 255), width=5)
    paste_icon(img, (150, 134, 342, 326))

    # Titles
    draw.text((w // 2, 400), "日进 · 拾光", fill=TEXT, font=load_font(38, bold=True), anchor="mm")
    draw.text((w // 2, 454), "Grow with Time", fill=TEXT_MUTED, font=load_font(26), anchor="mm")

    # Pill
    pill = (90, 520, 402, 590)
    draw.rounded_rectangle(pill, radius=35, fill=WHITE)
    draw.rounded_rectangle(pill, radius=35, outline=(255, 255, 255), width=3)
    draw.text((w // 2, 555), "日进有迹 · 拾光有声", fill=ACCENT_DARK, font=load_font(28, bold=True), anchor="mm")

    draw.line([(80, 680), (w - 80, 680)], fill=(255, 255, 255), width=3)
    draw.text((w // 2, 760), f"v{app_version()}", fill=TEXT_MUTED, font=load_font(26), anchor="mm")

    save_bmp(img, OUT / "sidebar.bmp")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_header()
    make_sidebar()
    print(f"Generated {SCALE}x NSIS assets in {OUT}")
    print(f"  sidebar: {SIDEBAR[0]}x{SIDEBAR[1]}")
    print(f"  header:  {HEADER[0]}x{HEADER[1]}")


if __name__ == "__main__":
    main()
