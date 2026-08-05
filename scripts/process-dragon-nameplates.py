#!/usr/bin/env python3
"""Crop transparent nameplate sources into lightweight 640x256 WebP assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ASSETS = {
    "simple.png": "nameplate-simple.webp",
    "oak.png": "nameplate-oak.webp",
    "brass.png": "nameplate-brass.webp",
    "crystal.png": "nameplate-crystal.webp",
    "rune.png": "nameplate-rune.webp",
    "celestial.png": "nameplate-celestial.webp",
    "ember.png": "nameplate-ember.webp",
    "legend.png": "nameplate-legend.webp",
}

CANVAS_SIZE = (640, 256)
SUBJECT_MAX = (616, 228)
MAX_BYTES = 90 * 1024


def render_asset(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise RuntimeError(f"transparent source has no visible subject: {source}")

    subject = image.crop(bounds)
    ratio = min(SUBJECT_MAX[0] / subject.width, SUBJECT_MAX[1] / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio))),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
    x = (CANVAS_SIZE[0] - subject.width) // 2
    y = (CANVAS_SIZE[1] - subject.height) // 2
    canvas.alpha_composite(subject, (x, y))
    return canvas


def save_asset(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    for quality in (84, 80, 76, 72, 68):
        image.save(destination, "WEBP", quality=quality, method=6, exact=True)
        if destination.stat().st_size <= MAX_BYTES:
            return
    raise RuntimeError(f"asset exceeds {MAX_BYTES} bytes: {destination}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()

    for source_name, output_name in ASSETS.items():
        save_asset(render_asset(args.input_dir / source_name), args.output_dir / output_name)


if __name__ == "__main__":
    main()
