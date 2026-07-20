"""Generate NSIS installer bitmap assets (BMP) for Grow with Time."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "windows" / "nsis"
ICON = ROOT / "src-tauri" / "icons" / "128x128.png"

ACCENT = (91, 143, 249)
ACCENT_DARK = (61, 120, 245)
BG_LIGHT = (245, 247, 250)
TEXT = (31, 42, 55)
TEXT_MUTED = (91, 107, 124)


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
    draw = ImageDraw.Draw(img)
    for y in range(height):
        ratio = y / max(height - 1, 1)
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return img


def paste_icon(base: Image.Image, box: tuple[int, int, int, int]) -> None:
    if not ICON.exists():
        return
    icon = Image.open(ICON).convert("RGBA")
    x0, y0, x1, y1 = box
    icon.thumbnail((x1 - x0, y1 - y0), Image.Resampling.LANCZOS)
    ix = x0 + ((x1 - x0) - icon.width) // 2
    iy = y0 + ((y1 - y0) - icon.height) // 2
    base.paste(icon, (ix, iy), icon)


def make_header() -> None:
    img = draw_gradient((150, 57), ACCENT, ACCENT_DARK)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((8, 10, 44, 46), radius=10, fill=(255, 255, 255, 255))
    paste_icon(img, (10, 12, 42, 44))
    draw.text((52, 14), "Grow with Time", fill=(255, 255, 255), font=load_font(14, bold=True))
    draw.text((52, 34), "与时间一起成长", fill=(230, 240, 255), font=load_font(11))
    img.save(OUT / "header.bmp", format="BMP")


def make_sidebar() -> None:
    img = draw_gradient((164, 314), BG_LIGHT, (228, 236, 248))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle((42, 36, 122, 116), radius=24, fill=(255, 255, 255))
    draw.rounded_rectangle((42, 36, 122, 116), radius=24, outline=ACCENT, width=2)
    paste_icon(img, (50, 44, 114, 108))
    draw.text((82, 138), "Grow with Time", fill=TEXT, font=load_font(13, bold=True), anchor="mm")
    draw.text((82, 158), "本地优先的", fill=TEXT_MUTED, font=load_font(11), anchor="mm")
    draw.text((82, 176), "待办与时间管理", fill=TEXT_MUTED, font=load_font(11), anchor="mm")
    draw.rounded_rectangle((28, 210, 136, 236), radius=12, fill=ACCENT)
    draw.text((82, 223), "专注 · 计划 · 复盘", fill=(255, 255, 255), font=load_font(10, bold=True), anchor="mm")
    draw.line([(24, 268), (140, 268)], fill=(210, 220, 235), width=1)
    draw.text((82, 286), "v1.0.0", fill=TEXT_MUTED, font=load_font(10), anchor="mm")
    img.save(OUT / "sidebar.bmp", format="BMP")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_header()
    make_sidebar()
    print(f"Generated NSIS assets in {OUT}")


if __name__ == "__main__":
    main()
