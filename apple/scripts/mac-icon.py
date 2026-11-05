#!/usr/bin/env python3
"""Makes the Mac app icon from the iOS one (#281).

iOS masks a full-bleed square itself; macOS shows the PNG as drawn. So the
Mac icon is the iOS artwork scaled into Apple's macOS icon grid: an 824 pt
rounded square, 100 pt in from each edge of the 1024 pt canvas, with a soft
drop shadow below it, written at every size the asset catalog lists.

Run it from apple/ after changing the iOS icon:

    python3 scripts/mac-icon.py

It needs Pillow (`pip install pillow`). The PNGs it writes are committed, so
building the app doesn't run it.
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent.parent
SOURCE = HERE / "Resources/iOS/Assets.xcassets/AppIcon.appiconset/icon-1024.png"
OUT = HERE / "Resources/macOS/Assets.xcassets/AppIcon.appiconset"

CANVAS = 1024
BODY = 824
RADIUS = 185
INSET = (CANVAS - BODY) // 2
# Pixels and the @1x/@2x sizes macOS asks for.
SIZES = [16, 32, 128, 256, 512]


def master() -> Image.Image:
    art = Image.open(SOURCE).convert("RGBA").resize((BODY, BODY), Image.LANCZOS)
    mask = Image.new("L", (BODY, BODY), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, BODY - 1, BODY - 1), RADIUS, fill=255)
    art.putalpha(mask)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (INSET, INSET + 12, INSET + BODY - 1, INSET + BODY + 11), RADIUS, fill=(0, 0, 0, 90)
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)))
    canvas.alpha_composite(art, (INSET, INSET))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    icon = master()
    images = []
    for size in SIZES:
        for scale in (1, 2):
            pixels = size * scale
            name = f"icon-{size}@{scale}x.png"
            icon.resize((pixels, pixels), Image.LANCZOS).save(OUT / name, optimize=True)
            images.append(
                {"filename": name, "idiom": "mac", "scale": f"{scale}x", "size": f"{size}x{size}"}
            )
    contents = {"images": images, "info": {"author": "xcode", "version": 1}}
    (OUT / "Contents.json").write_text(json.dumps(contents, indent=2) + "\n")
    (OUT.parent / "Contents.json").write_text(
        json.dumps({"info": {"author": "xcode", "version": 1}}, indent=2) + "\n"
    )


if __name__ == "__main__":
    main()
