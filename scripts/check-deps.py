#!/usr/bin/env python3
"""SCORESBOX · check-deps — аудит соответствия импортов и зависимостей.

Ищет ДВЕ проблемы:
  1. MISSING  — пакет импортируется из кода, но отсутствует в package.json
     (тот класс бага, что уронил v1.0.25: sonner снесли как «мёртвый»).
  2. DEAD     — пакет объявлен в package.json, но никем не импортируется
     (информационно; sonner после фикса должен НЕ попасть сюда).

Учитывает: src/, tests/, scripts/ (.ts/.tsx/.js/.mjs), prisma/seed.
Игнорирует: относительные импорты, алиас @/ (tsconfig paths),
bun:* / node:* / worklet-специфику, devDeps-потребители (eslint-конфиг и пр.).
"""
import json
import re
import sys
from pathlib import Path

# Node/Bun builtins: резолвятся рантаймом, пакетами не являются
NODE_BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "cluster",
    "constants", "crypto", "dgram", "diagnostics_channel", "dns",
    "domain", "events", "fs", "http", "http2", "https", "inspector",
    "module", "net", "os", "path", "perf_hooks", "process", "punycode",
    "querystring", "readline", "repl", "stream", "string_decoder",
    "test", "timers", "tls", "trace_events", "tty", "url", "util",
    "v8", "vm", "worker_threads", "zlib", "node", "bun", "ws",
    "node:test", "bun:test", "server-only",
}

ROOT = Path(__file__).resolve().parent.parent

# --- 1. Все импорты из кода ------------------------------------------
IMPORT_RE = re.compile(
    r"""(?:import\s+(?:type\s+)?[\w*\s{},]+\s+from\s+|  # import X from "..."
        import\s+|                                        # import "..."
        export\s+[\w*\s{},]+\s+from\s+|                   # export X from "..."
        require\s*\(\s*|                                  # require("...")
        import\s*\(\s*                                    # dynamic import("...")
       )["']([^"']+)["']""",
    re.VERBOSE,
)

SCAN_DIRS = ["src", "tests", "scripts", "prisma"]
SCAN_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}

imported = {}  # pkg -> [файлы]
for d in SCAN_DIRS:
    base = ROOT / d
    if not base.exists():
        continue
    for f in base.rglob("*"):
        if f.suffix not in SCAN_EXT or not f.is_file():
            continue
        try:
            text = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for m in IMPORT_RE.finditer(text):
            spec = m.group(1)
            if spec.startswith((".", "/", "@/", "bun:", "node:")):
                continue
            if spec in NODE_BUILTINS:
                continue
            # scoped: @org/pkg -> @org/pkg; обычный: pkg (без подпути)
            parts = spec.split("/")
            pkg = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
            imported.setdefault(pkg, set()).add(str(f.relative_to(ROOT)))

# корневые конфиги (tailwind.config.ts, next.config.ts, postcss/eslint) —
# именно там прятался TS2307 на tailwindcss-animate в v1.0.25
for f in list(ROOT.glob("*.ts")) + list(ROOT.glob("*.mjs")):
    if f.name == "next-env.d.ts" or not f.is_file():
        continue
    try:
        text = f.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    for m in IMPORT_RE.finditer(text):
        spec = m.group(1)
        if spec.startswith((".", "/", "@/", "bun:", "node:")) or spec in NODE_BUILTINS:
            continue
        parts = spec.split("/")
        pkg = "/".join(parts[:2]) if spec.startswith("@") else parts[0]
        imported.setdefault(pkg, set()).add(f.name)

# --- 2. Зависимости package.json --------------------------------------
pkg_json = json.loads((ROOT / "package.json").read_text())
deps = set(pkg_json.get("dependencies", {}))
devdeps = set(pkg_json.get("devDependencies", {}))

# пакеты, чьи типы/плагины резолвятся без прямого импорта из кода
RESOLVED_IMPLICITLY = {
    "tailwindcss", "@tailwindcss/postcss", "tw-animate-css",  # CSS-пайплайн
    "eslint", "eslint-config-next",                            # .eslintrc
    "typescript", "bun-types", "@types/*",                     # tsc/tsconfig
    "prisma", "@prisma/client",                                # schema.prisma + генерация
}

missing = {p: files for p, files in imported.items()
           if p not in deps and p not in devdeps}
dead = {p for p in deps if p not in imported and p not in RESOLVED_IMPLICITLY}

print("=== ИМПОРТИРУЕТСЯ, НО НЕТ В package.json (MISSING) ===")
if missing:
    for p, files in sorted(missing.items()):
        print(f"  !! {p}  ({len(files)} файлов)")
        for ff in sorted(files)[:20]:
            print(f"       {ff}")
else:
    print("  ок: все импортируемые пакеты объявлены")

print("\n=== В package.json, НИКЕМ НЕ ИМПОРТИРУЕТСЯ (DEAD) ===")
if dead:
    for p in sorted(dead):
        print(f"  -- {p}")
else:
    print("  ок: мёртвых нет (или скрыты неявным резолвом)")

print(f"\nИтого: импортируется {len(imported)} пакетов; deps {len(deps)}, devDeps {len(devdeps)}")

if missing:
    # ровно тот класс бага, что уронил сборку v1.0.25 (снесённый sonner)
    sys.exit(1)
