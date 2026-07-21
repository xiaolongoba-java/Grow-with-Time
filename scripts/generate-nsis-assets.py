"""Generate HiDPI NSIS installer bitmaps for Grow with Time.

NSIS welcome/finish sidebar is ~164x314 and header ~150x57 at 100% scale.
On HiDPI Windows scales these controls larger, so we ship 3x assets and let
MUI stretch them down — looks sharp at 125%–200% scaling.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

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

ACCENT = (91, 143, 249)
ACCENT_DARK = (61, 120, 245)
BG_TOP = (248, 250, 253)
BG_BOTTOM = (226, 235, 248)
TEXT = (31, 42, 55)
TEXT_MUTED = (91, 107, 124)
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
    img = draw_gradient((w, h), ACCENT, ACCENT_DARK)
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
    draw.text((text_x, 42), "Grow with Time", fill=WHITE, font=load_font(42, bold=True))
    draw.text((text_x, 100), "与时间一起成长", fill=(230, 240, 255), font=load_font(28))
    save_bmp(img, OUT / "header.bmp")


def make_sidebar() -> None:
    w, h = SIDEBAR
    img = draw_gradient((w, h), BG_TOP, BG_BOTTOM)
    draw = ImageDraw.Draw(img)

    # Soft accent blob behind icon
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((60, 40, 430, 420), fill=(*ACCENT, 28))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Icon card
    card = (126, 110, 366, 350)
    draw.rounded_rectangle(card, radius=48, fill=WHITE)
    draw.rounded_rectangle(card, radius=48, outline=ACCENT, width=4)
    paste_icon(img, (150, 134, 342, 326))

    # Titles
    draw.text((w // 2, 400), "Grow with Time", fill=TEXT, font=load_font(36, bold=True), anchor="mm")
    draw.text((w // 2, 456), "本地优先的待办与时间管理", fill=TEXT_MUTED, font=load_font(26), anchor="mm")

    # Pill
    pill = (90, 520, 402, 590)
    draw.rounded_rectangle(pill, radius=35, fill=ACCENT)
    draw.text((w // 2, 555), "专注 · 计划 · 复盘", fill=WHITE, font=load_font(28, bold=True), anchor="mm")

    draw.line([(80, 680), (w - 80, 680)], fill=(200, 214, 232), width=2)
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
