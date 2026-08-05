#!/usr/bin/env python3
"""Crop transparent dragon decor sources into lightweight 512px WebP assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ASSETS = {
    "chronicle.png": "left-chronicle-lectern.webp",
    "crystals.png": "left-dragonheart-crystals.webp",
    "brazier.png": "left-guardian-brazier.webp",
    "runestone.png": "left-ancestor-runestone.webp",
    "shrine.png": "right-bond-shrine.webp",
    "orrery.png": "right-celestial-orrery.webp",
    "vault.png": "right-treasure-vault.webp",
    "nest.png": "right-hatchling-nest.webp",
}

CANVAS_SIZE = 512
SUBJECT_MAX = 472
MAX_BYTES = 100 * 1024


def render_asset(source: Path) -> Image.Image:
    image = Image.open(source).convert("RGBA")
    bounds = image.getchannel("A").getbbox()
    if not bounds:
        raise RuntimeError(f"transparent source has no visible subject: {source}")

    subject = image.crop(bounds)
    ratio = min(SUBJECT_MAX / subject.width, SUBJECT_MAX / subject.height)
    subject = subject.resize(
        (max(1, round(subject.width * ratio)), max(1, round(subject.height * ratio))),
        Image.Resampling.LANCZOS,
    )

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - subject.width) // 2
    y = min(24, CANVAS_SIZE - subject.height)
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
