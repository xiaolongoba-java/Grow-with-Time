"""Generate macOS DMG background PNG for Grow with Time.

Tauri default DMG window is 660x400 points. Finder adds internal margins, so the
background should be 724x464 (= window + 64px) to avoid cropping/offset artifacts.
Icon positions in tauri.conf.json stay in window coordinates (180,170 / 480,170).
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src-tauri" / "macos" / "dmg"

# Logical window (points) — must match tauri.conf.json bundle.macOS.dmg.windowSize
WIN_W, WIN_H = 660, 400
# Finder margin compensation (+64 total width/height)
IMG_W, IMG_H = WIN_W + 64, WIN_H + 64
MARGIN = 32

ACCENT = (91, 143, 249)
ACCENT_DARK = (61, 120, 245)
BG_TOP = (245, 247, 250)
BG_BOTTOM = (228, 236, 248)
TEXT = (31, 42, 55)
TEXT_MUTED = (91, 107, 124)

APP_X, APP_Y = 180, 170
APPS_X, APPS_Y = 480, 170


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
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


def wx(x: int) -> int:
    return x + MARGIN


def wy(y: int) -> int:
    return y + MARGIN


def make_background() -> None:
    img = draw_gradient((IMG_W, IMG_H), BG_TOP, BG_BOTTOM)
    draw = ImageDraw.Draw(img)

    # Header band
    draw.rounded_rectangle((wx(24), wy(18), wx(636), wy(92)), radius=16, fill=(255, 255, 255))
    draw.text((wx(42), wy(34)), "Grow with Time", fill=TEXT, font=load_font(22, bold=True))
    draw.text((wx(42), wy(62)), "与时间一起成长 · 本地优先的待办与时间管理", fill=TEXT_MUTED, font=load_font(13))

    # Drop zones under icons (128px icon footprint)
    for cx in (APP_X + 64, APPS_X + 64):
        draw.rounded_rectangle(
            (wx(cx - 72), wy(150), wx(cx + 72), wy(286)),
            radius=18,
            outline=(200, 214, 235),
            width=2,
            fill=(255, 255, 255),
        )

    # Drag arrow between app and Applications icons
    y_arrow = wy(210)
    x1 = wx(APP_X + 128 + 18)
    x2 = wx(APPS_X - 18)
    draw.line([(x1, y_arrow), (x2 - 16, y_arrow)], fill=ACCENT, width=5)
    draw.polygon(
        [(x2 - 16, y_arrow - 10), (x2, y_arrow), (x2 - 16, y_arrow + 10)],
        fill=ACCENT,
    )

    draw.text((wx(330), wy(118)), "将左侧图标拖入「应用程序」", fill=ACCENT_DARK, font=load_font(14, bold=True), anchor="mm")
    draw.text((wx(330), wy(318)), "松开即可完成安装", fill=TEXT_MUTED, font=load_font(12), anchor="mm")

    # Footer pill
    draw.rounded_rectangle((wx(210), wy(344), wx(450), wy(372)), radius=14, fill=ACCENT)
    draw.text((wx(330), wy(358)), "专注 · 计划 · 复盘", fill=(255, 255, 255), font=load_font(11, bold=True), anchor="mm")

    img.save(OUT / "background.png", format="PNG")
    print(f"Generated {OUT / 'background.png'} ({IMG_W}x{IMG_H})")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_background()


if __name__ == "__main__":
    main()
