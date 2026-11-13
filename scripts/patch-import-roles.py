#!/usr/bin/env python3
"""v1.0.34: точечные правки import route (замена строк 288-308)."""
import io

P = "/home/z/my-project/src/app/api/admin/import/route.ts"
src = io.open(P, encoding="utf-8").read()
lines = src.split("\n")  # 0-based; файл-строка N = lines[N-1]

# Проверяем опорные строки (1-based): 288 = комментарий «Заявка (players)…»
assert "Заявка (players)" in lines[287], lines[287]
assert lines[298].startswith("    const mergeConflict"), lines[298]
assert lines[304].strip() == "}", lines[304]

replacement = """    // Заявка (players): роль «Игрок» НЕ пишется на карточку судьи —
    // игроком человек становится через саму заявку (Registration.role),
    // карточка остаётся судьёйской (кросс-лиговый сценарий: судит лигу B,
    // играет в лигу A). Сезонная проверка заявки — ниже, перед create.
    // v1.0.34: принадлежность корпусу — любая роль корпуса (карточка
    // REFEREE либо легаси-должность до нормализации миграцией 05);
    // карточный конфликт «судья × игрок» удалён — запрет только сезонный.
    const incomingRoles =
      entity === "players" && hasRefereeCorpsRole(person.roles)
        ? roles.filter((c) => c !== "PLAYER")
        : roles;
    const mergedRoles = [...new Set([...person.roles, ...incomingRoles])];""".split("\n")

lines[287:305] = replacement
io.open(P, "w", encoding="utf-8").write("\n".join(lines))
print("OK, новые строки 288+:")
print("\n".join(lines[287:300]))
