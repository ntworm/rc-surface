# -*- coding: utf-8 -*-
# Copyright © 2026 Gabriel Worm
# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
"""Generate docs/og-image.png in the operator-sheet visual system.

The card is 1200x630 with a carbon ground, ordered-dither grain, Departure
Mono, one amber accent, hairline rules, and a miniature PERF plan drawing.
It has no gradients, rounded corners, or blur. The displayed release comes
from package.json so the committed card and package metadata cannot drift.
"""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, PngImagePlugin


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
OTF = SCRIPT_DIR / "assets" / "fonts" / "DepartureMono-Regular.otf"
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "og-image.png"

W, H = 1200, 630
CARBON = (20, 20, 20)
PANEL = (26, 26, 26)
CELL = (42, 42, 42)
RULE = (51, 51, 51)
HAIR = (58, 58, 58)
INK = (192, 192, 192)
ASH = (142, 142, 142)
CLAY = (108, 108, 88)
AMBER = (255, 161, 51)
PUMPKIN = (228, 123, 26)
FLUX = (200, 190, 80)


def package_release():
    with (REPO_ROOT / "package.json").open(encoding="utf-8") as package_file:
        package = json.load(package_file)
    return f"v{package['version']}"


def render(output_path):
    release = package_release()
    img = Image.new("RGB", (W, H), CARBON)
    draw = ImageDraw.Draw(img)

    def font(px):
        return ImageFont.truetype(OTF, px)

    # Same 8x8 ordered pattern the page uses, at a weight felt more than seen.
    grain = [(0, 0), (4, 1), (2, 2), (6, 3), (1, 4), (5, 5), (3, 6), (7, 7)]
    pixels = img.load()
    for tile_y in range(0, H, 8):
        for tile_x in range(0, W, 8):
            for offset_x, offset_y in grain:
                x, y = tile_x + offset_x, tile_y + offset_y
                if x < W and y < H:
                    red, green, blue = pixels[x, y]
                    pixels[x, y] = (
                        min(red + 7, 255), min(green + 7, 255), min(blue + 7, 255)
                    )

    margin = 64
    draw.line([(margin, 74), (W - margin, 74)], fill=RULE, width=1)
    font_11 = font(17)
    draw.text((margin, 50), "RC SURFACE", font=font_11, fill=AMBER)
    draw.text((margin + 300, 50), release, font=font_11, fill=INK)
    draw.text((margin + 420, 50), "SOURCE-AVAILABLE", font=font_11, fill=ASH)
    right = "OPERATOR SHEET"
    draw.text((W - margin - draw.textlength(right, font=font_11), 50), right,
              font=font_11, fill=ASH)

    left_max = 620 - margin - 24
    chip_pad, title_gap = 10, 20
    size = 86
    while size > 40:
        font_big = font(size)
        rc_width = draw.textlength("RC", font=font_big)
        surface_width = draw.textlength("SURFACE", font=font_big)
        if rc_width + chip_pad * 2 + title_gap + surface_width <= left_max:
            break
        size -= 2
    font_big = font(size)
    rc_width = int(draw.textlength("RC", font=font_big))
    line_height = int(size * 1.12)
    ascender = int(size * 0.10)

    chip_top = 116 + line_height
    chip_height = line_height - 6
    draw.rectangle(
        [margin, chip_top, margin + rc_width + chip_pad * 2, chip_top + chip_height],
        fill=AMBER,
    )
    text_box = draw.textbbox((0, 0), "RC", font=font_big)
    draw.text(
        (margin + chip_pad,
         chip_top + (chip_height - (text_box[3] - text_box[1])) // 2 - text_box[1]),
        "RC",
        font=font_big,
        fill=CARBON,
    )
    draw.text(
        (margin + rc_width + chip_pad * 2 + title_gap, chip_top + ascender),
        "SURFACE",
        font=font_big,
        fill=INK,
    )

    font_18 = font(21)

    def wrap(text, selected_font, max_width):
        words, lines, current = text.split(), [], ""
        for word in words:
            candidate = (current + " " + word).strip()
            if draw.textlength(candidate, font=selected_font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines

    strap_y = 362
    for index, line in enumerate(wrap(
        "A phone browser, used as a controller surface for Ableton Live.",
        font_18,
        left_max,
    )):
        draw.text((margin, strap_y), line, font=font_18, fill=INK if index == 0 else ASH)
        strap_y += 28

    spec_width = left_max
    spec_top = max(430, strap_y + 10)
    draw.line([(margin, spec_top), (margin + spec_width, spec_top)], fill=RULE, width=1)
    rows = [
        ("REQUIRES", "Live 12.4.5+ Suite"),
        ("HELD", "Landscape"),
        ("NETWORK", "LAN only"),
        ("LICENCE", "PolyForm Noncommercial 1.0.0"),
    ]
    row_y = spec_top + 16
    for key, value in rows:
        draw.text((margin, row_y), key, font=font_11, fill=CLAY)
        draw.text((margin + 130, row_y), value, font=font_11, fill=INK)
        row_y += 26
        draw.line([(margin, row_y - 6), (margin + spec_width, row_y - 6)],
                  fill=(37, 37, 37), width=1)

    panel_x, panel_y, panel_width, panel_height = 620, 116, W - margin - 620, 380
    draw.rectangle(
        [panel_x, panel_y, panel_x + panel_width, panel_y + panel_height],
        outline=ASH,
        width=1,
        fill=PANEL,
    )
    inner = 12
    inner_x, inner_y = panel_x + inner, panel_y + inner
    inner_width, inner_height = panel_width - inner * 2, panel_height - inner * 2

    tabs = ["PERF", "MIX", "SNP", "SNS", "AUD", "VID"]
    font_10 = font(15)
    tab_width, tab_gap = 62, 6
    for index, tab in enumerate(tabs):
        tab_x = inner_x + index * (tab_width + tab_gap)
        selected = index == 0
        draw.rectangle(
            [tab_x, inner_y, tab_x + tab_width, inner_y + 26],
            fill=AMBER if selected else CELL,
            outline=None if selected else HAIR,
            width=1,
        )
        text_offset = (tab_width - draw.textlength(tab, font=font_10)) / 2
        draw.text((tab_x + text_offset, inner_y + 5), tab, font=font_10,
                  fill=CARBON if selected else INK)
    draw.line([(inner_x, inner_y + 38), (inner_x + inner_width, inner_y + 38)],
              fill=HAIR, width=1)

    body_y = inner_y + 50
    body_height = inner_height - 50
    grid_width = int(inner_width * 0.46)
    cell_width = (grid_width - 3 * 6) // 4
    cell_height = (body_height - 2 * 6) // 3
    gap = 6
    lit = {(0, 0): PUMPKIN, (1, 2): PUMPKIN, (2, 1): FLUX}
    font_9 = font(13)
    for row in range(3):
        for column in range(4):
            x0 = inner_x + column * (cell_width + gap)
            y0 = body_y + row * (cell_height + gap)
            fill = lit.get((row, column), CELL)
            draw.rectangle([x0, y0, x0 + cell_width, y0 + cell_height],
                           fill=fill, outline=HAIR, width=1)
            number = row * 4 + column + 1
            draw.text((x0 + 6, y0 + 5), str(number), font=font_9,
                      fill=CARBON if (row, column) in lit else ASH)

    xy_width = int(inner_width * 0.28)
    xy_x = inner_x + grid_width + 12
    for index in range(2):
        y0 = body_y + index * (body_height // 2 + 4)
        height = body_height // 2 - 8
        draw.rectangle([xy_x, y0, xy_x + xy_width, y0 + height],
                       fill=CELL, outline=HAIR, width=1)
        draw.line([(xy_x + xy_width // 2, y0),
                   (xy_x + xy_width // 2, y0 + height)], fill=(48, 48, 48), width=1)
        draw.line([(xy_x, y0 + height // 2),
                   (xy_x + xy_width, y0 + height // 2)], fill=(48, 48, 48), width=1)
        handle_x = xy_x + xy_width - 34 if index == 0 else xy_x + 22
        handle_y = y0 + 20 if index == 0 else y0 + height - 28
        draw.rectangle([handle_x, handle_y, handle_x + 9, handle_y + 9], fill=AMBER)

    strip_x = xy_x + xy_width + 12
    strip_width = inner_x + inner_width - strip_x
    column_width = (strip_width - 6) // 2
    bars = [0.42, 0.74, 0.55, 0.86]
    for column in range(2):
        for row in range(2):
            x0 = strip_x + column * (column_width + 6)
            y0 = body_y + row * (body_height // 2 + 4)
            height = body_height // 2 - 8
            draw.rectangle([x0, y0, x0 + column_width, y0 + height],
                           fill=CELL, outline=HAIR, width=1)
            bar_height = int((height - 8) * bars[row * 2 + column])
            draw.rectangle(
                [x0 + 4, y0 + height - 4 - bar_height,
                 x0 + column_width - 4, y0 + height - 4],
                fill=FLUX if column == 0 else PUMPKIN,
            )

    draw.text((panel_x, panel_y + panel_height + 12),
              "PERF PAGE — PLAN, NOT A SCREENSHOT", font=font_11, fill=CLAY)

    draw.line([(margin, H - 58), (W - margin, H - 58)], fill=RULE, width=1)
    draw.text((margin, H - 44), "ntworm.github.io/ableton-rc-surface",
              font=font_11, fill=AMBER)
    tail = "INDEPENDENT · NOT AFFILIATED WITH ABLETON AG"
    draw.text((W - margin - draw.textlength(tail, font=font_11), H - 44),
              tail, font=font_11, fill=CLAY)

    assert row_y < H - 70, "spec block collides with the footer rule"
    assert (margin + rc_width + chip_pad * 2 + title_gap
            + draw.textlength("SURFACE", font=font_big) <= 620 - 24), \
        "title overruns the panel"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Release", release)
    img.save(output_path, "PNG", optimize=True, pnginfo=metadata)
    print(f"written: {output_path} {output_path.stat().st_size} bytes {img.size} {release}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="PNG destination (defaults to docs/og-image.png)",
    )
    args = parser.parse_args()
    render(args.output.resolve())


if __name__ == "__main__":
    main()
