#!/usr/bin/env python3
"""Split approved transparent dragon sheets into optimized per-level WebP assets."""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageFilter


SPECIES = ("star", "forest", "ember", "moon")
CANVAS_SIZE = 512
LEVEL_MAX_SIZES = (292, 322, 278, 326, 356, 382, 406, 430, 452, 474)


def connected_components(mask: Image.Image):
    width, height = mask.size
    pixels = mask.load()
    visited = bytearray(width * height)
    components = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= 32:
                continue

            queue = deque([(x, y)])
            visited[index] = 1
            min_x = max_x = x
            min_y = max_y = y
            total_x = total_y = area = 0

            while queue:
                current_x, current_y = queue.popleft()
                total_x += current_x
                total_y += current_y
                area += 1
                min_x = min(min_x, current_x)
                max_x = max(max_x, current_x)
                min_y = min(min_y, current_y)
                max_y = max(max_y, current_y)

                for next_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for next_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        next_index = next_y * width + next_x
                        if visited[next_index] or pixels[next_x, next_y] <= 32:
                            continue
                        visited[next_index] = 1
                        queue.append((next_x, next_y))

            if area >= 3:
                components.append({
                    "area": area,
                    "cx": total_x / area,
                    "cy": total_y / area,
                    "box": (min_x, min_y, max_x + 1, max_y + 1),
                })

    return components


def stage_boxes(image: Image.Image):
    scale = 4
    small_alpha = image.getchannel("A").resize(
        (image.width // scale, image.height // scale),
        Image.Resampling.BILINEAR,
    )
    components = connected_components(small_alpha)
    anchors = sorted(components, key=lambda item: item["area"], reverse=True)[:10]
    if len(anchors) != 10:
        raise RuntimeError("ten main subjects were not found")
    anchors = sorted(anchors, key=lambda item: (item["cy"] >= small_alpha.height / 2, item["cx"]))
    groups = [[anchor["box"]] for anchor in anchors]

    def box_distance(left_box, right_box):
        left, top, right, bottom = left_box
        other_left, other_top, other_right, other_bottom = right_box
        gap_x = max(0, left - other_right, other_left - right)
        gap_y = max(0, top - other_bottom, other_top - bottom)
        return gap_x * gap_x + gap_y * gap_y

    anchor_ids = {id(anchor) for anchor in anchors}
    for component in components:
        if id(component) in anchor_ids:
            continue
        distances = [box_distance(component["box"], anchor["box"]) for anchor in anchors]
        nearest_index = min(range(10), key=distances.__getitem__)
        # Egg-shell pieces and separated tail emblems remain close to their main subject.
        # Distant antialiasing specks are intentionally discarded.
        if distances[nearest_index] <= 24 * 24:
            groups[nearest_index].append(component["box"])

    boxes = []
    for level_index, group in enumerate(groups):
        if not group:
            raise RuntimeError(f"level {level_index + 1}: subject not found")
        left = min(box[0] for box in group) * scale
        top = min(box[1] for box in group) * scale
        right = max(box[2] for box in group) * scale
        bottom = max(box[3] for box in group) * scale
        padding = 10
        boxes.append((
            max(0, left - padding),
            max(0, top - padding),
            min(image.width, right + padding),
            min(image.height, bottom + padding),
        ))
    return boxes


def render_level(image: Image.Image, box, level: int):
    crop = image.crop(box)
    if level >= 4:
        crop = retain_largest_subject(crop)
    alpha_box = crop.getchannel("A").getbbox()
    if alpha_box:
        crop = crop.crop(alpha_box)

    max_size = LEVEL_MAX_SIZES[level - 1]
    ratio = min(max_size / crop.width, max_size / crop.height)
    resized = crop.resize(
        (max(1, round(crop.width * ratio)), max(1, round(crop.height * ratio))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = (CANVAS_SIZE - resized.width) // 2
    bottom = 492 if level >= 6 else 476
    y = max(8, bottom - resized.height)
    canvas.alpha_composite(resized, (x, y))
    return canvas


def retain_largest_subject(image: Image.Image):
    """Drop neighboring sprites that overlap a late-stage rectangular crop."""
    alpha = image.getchannel("A")
    width, height = alpha.size
    pixels = alpha.load()
    visited = bytearray(width * height)
    largest = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if visited[index] or pixels[x, y] <= 32:
                continue
            queue = deque([(x, y)])
            visited[index] = 1
            current = []
            while queue:
                current_x, current_y = queue.popleft()
                current.append((current_x, current_y))
                for next_y in range(max(0, current_y - 1), min(height, current_y + 2)):
                    for next_x in range(max(0, current_x - 1), min(width, current_x + 2)):
                        next_index = next_y * width + next_x
                        if visited[next_index] or pixels[next_x, next_y] <= 32:
                            continue
                        visited[next_index] = 1
                        queue.append((next_x, next_y))
            if len(current) > len(largest):
                largest = current

    keep = Image.new("L", alpha.size, 0)
    keep_pixels = keep.load()
    for x, y in largest:
        keep_pixels[x, y] = 255
    keep = keep.filter(ImageFilter.MaxFilter(5))
    cleaned = image.copy()
    cleaned.putalpha(ImageChops.multiply(alpha, keep))
    return cleaned


def save_webp(image: Image.Image, output_path: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    for quality in (82, 78, 74, 70):
        image.save(output_path, "WEBP", quality=quality, method=6, exact=True)
        if output_path.stat().st_size <= 150 * 1024:
            return
    raise RuntimeError(f"asset exceeds 150 KiB: {output_path}")


def process_species(source_path: Path, output_root: Path, species: str):
    image = Image.open(source_path).convert("RGBA")
    boxes = stage_boxes(image)
    for level, box in enumerate(boxes, start=1):
        level_image = render_level(image, box, level)
        save_webp(level_image, output_root / species / f"level-{level}.webp")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--species", choices=SPECIES, action="append")
    args = parser.parse_args()

    for species in args.species or SPECIES:
        process_species(
            args.input_dir / f"{species}-alpha.png",
            args.output_dir,
            species,
        )


if __name__ == "__main__":
    main()
