#!/usr/bin/env python3
"""Build the Workshop store thumbnail from the five landscape stills."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "wallpaper" / "assets"
OUTS = [
    ROOT / "wallpaper" / "preview.jpg",
    ASSETS / "preview.jpg",
]
# origin X/Y match wallpaper/scenes.js so faces stay in the store strip
SCENES = [
    ("storm", 0.42, 0.38),
    ("sakura", 0.40, 0.40),
    ("hanabi", 0.28, 0.42),
    ("tide", 0.38, 0.46),
    ("moonlit", 0.50, 0.42),
]
W, H = 1280, 720
STRIP = W // len(SCENES)


def cover(im: Image.Image, w: int, h: int, ox: float = 0.5, oy: float = 0.4) -> Image.Image:
    im = im.convert("RGB")
    scale = max(w / im.width, h / im.height)
    nw, nh = int(im.width * scale), int(im.height * scale)
    im = im.resize((nw, nh), Image.Resampling.LANCZOS)
    left = min(max(0, int(nw * ox) - w // 2), nw - w)
    top = min(max(0, int(nh * oy) - h // 2), nh - h)
    return im.crop((left, top, left + w, top + h))


def main() -> None:
    canvas = Image.new("RGB", (W, H), (6, 8, 14))
    for i, (name, ox, oy) in enumerate(SCENES):
        strip = cover(Image.open(ASSETS / f"{name}.jpg"), STRIP, H, ox, oy)
        strip = ImageEnhance.Contrast(strip).enhance(1.06)
        strip = ImageEnhance.Color(strip).enhance(1.08)
        canvas.paste(strip, (i * STRIP, 0))

    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(shade)
    for x in range(1, len(SCENES)):
        draw.rectangle((x * STRIP - 1, 0, x * STRIP + 1, H), fill=(0, 0, 0, 90))
    draw.rectangle((0, H - 140, W, H), fill=(0, 0, 0, 0))
    fade = Image.new("RGBA", (W, 160), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fade)
    for y in range(160):
        fd.line((0, y, W, y), fill=(0, 0, 0, int(170 * (y / 159))))
    shade.paste(fade, (0, H - 160), fade)
    canvas = Image.alpha_composite(canvas.convert("RGBA"), shade).convert("RGB")
    canvas = canvas.filter(ImageFilter.UnsharpMask(radius=1.2, percent=80, threshold=2))

    overlay = ImageDraw.Draw(canvas)
    font_path = Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    title = ImageFont.truetype(str(font_path), 42) if font_path.exists() else ImageFont.load_default()
    sub = ImageFont.truetype(str(font_path), 18) if font_path.exists() else ImageFont.load_default()
    overlay.text((36, H - 92), "NIGHTFALL", font=title, fill=(255, 255, 255))
    overlay.text((38, H - 42), "Anime Girl Collection  ·  Wallpaper Engine", font=sub, fill=(210, 214, 224))

    for dest in OUTS:
        canvas.save(dest, quality=90, optimize=True)
        print(f"wrote {dest} {canvas.size}")

    for name, _ox, _oy in SCENES:
        Image.open(ASSETS / f"{name}.jpg").resize((320, 180), Image.Resampling.LANCZOS).save(
            ASSETS / f"{name}-thumb.jpg", quality=82, optimize=True
        )
        Image.open(ASSETS / f"{name}-p.jpg").resize((180, 320), Image.Resampling.LANCZOS).save(
            ASSETS / f"{name}-p-thumb.jpg", quality=82, optimize=True
        )


if __name__ == "__main__":
    main()
