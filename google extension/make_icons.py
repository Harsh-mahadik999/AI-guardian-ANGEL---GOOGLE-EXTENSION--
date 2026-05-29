"""
Generate minimal PNG icons for the Chrome extension.
Uses only Python standard library: struct + zlib.
"""

import os
import struct
import zlib


def make_png(size, color_bg=(0, 0, 0), color_fg=(255, 255, 255)):
    stem_width = max(1, size // 10)
    cx = size // 2
    stem_x1, stem_x2 = cx - stem_width, cx + stem_width
    stem_y1, stem_y2 = size // 3, size - size // 4
    bar_x1, bar_x2 = size // 5, size - size // 5
    bar_y1, bar_y2 = size // 5, size // 3

    rows = []
    for y in range(size):
        row = bytearray(b"\x00")  # filter type 0
        for x in range(size):
            is_foreground = (
                stem_x1 <= x <= stem_x2 and stem_y1 <= y <= stem_y2
            ) or (
                bar_x1 <= x <= bar_x2 and bar_y1 <= y <= bar_y2
            )
            row.extend(color_fg if is_foreground else color_bg)
            row.append(255)
        rows.append(bytes(row))

    compressed = zlib.compress(b"".join(rows), 9)

    def chunk(name, data):
        packed = struct.pack(
            ">I", len(data)
        ) + name + data
        return packed + struct.pack(
            ">I", zlib.crc32(name + data) & 0xFFFFFFFF
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(
        b"IHDR",
        struct.pack(
            ">IIBBBBB",
            size,
            size,
            8,
            6,
            0,
            0,
            0,
        ),
    )
    png += chunk(b"IDAT", compressed)
    png += chunk(b"IEND", b"")
    return png


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "icons")
    os.makedirs(out_dir, exist_ok=True)

    for size in (16, 48, 128):
        path = os.path.join(out_dir, f"icon{size}.png")
        with open(path, "wb") as file:
            file.write(make_png(size))
        print(f"Created {path} ({os.path.getsize(path)} bytes)")

    print("All icons created successfully!")

