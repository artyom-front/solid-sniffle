#!/usr/bin/env python3
"""Генерация TS-таблиц декодирования cp1251 и koi8-r для src/lib/csvEncoding.ts.
Таблицы берутся из встроенных кодеков Python — точность гарантирована стандартом.
"""
chars = "                "  # placeholder, real generation below

def table(codec: str) -> list[str]:
    out = []
    for b in range(128, 256):
        try:
            ch = bytes([b]).decode(codec)
        except UnicodeDecodeError:
            ch = "\ufffd"  # undefined byte (только 0x98 в cp1251)
        out.append(f"\\u{ord(ch):04x}" if ord(ch) > 126 else repr(ch)[1:-1] if ch not in ('"', "\\") else f"\\u{ord(ch):04x}")
    return out

for codec, name in (("cp1251", "CP1251"), ("koi8_r", "KOI8R")):
    tbl = table(codec)
    print(f"// {codec}: 0x80..0xFF")
    rows = []
    for i in range(0, 128, 8):
        rows.append("  " + ", ".join(f'"{tbl[i+j]}"' for j in range(8)) + ",")
    print("\n".join(rows))
    print()
