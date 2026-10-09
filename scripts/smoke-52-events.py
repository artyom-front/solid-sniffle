#!/usr/bin/env python3
# v1.0.52 · смок правил замены/событий через API (валидатор состояния матча)
# Сценарий: первый матч сезона → подать состав (старт+запас) →
#  ГОЛ запасному → 409; ЗАМЕНА (запас выходит) → ок; ГОЛ вышедшему → ок;
#  замена №2: «выходит» игрок, уже выходивший → 409; «уходит» запасной → 409.
import json
import urllib.request
import http.cookiejar

BASE = "http://localhost:3000"
jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with opener.open(req) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def main():
    print("login:", call("POST", "/api/auth/login", {"email": "admin@ff21.ru", "password": "admin123"})[0])

    # первый незавершённый матч с сезоном
    mid = "cmuzeg7xl00s3olwypx6tcb0r"  # SCHEDULED Химик-НО — Динамо-ЧЕ (seed)
    print(f"матч: {mid} (из сида, SCHEDULED)")

    # протокол (eligible/lineup)
    ok, proto = call("GET", f"/api/admin/matches/{mid}")
    if ok != 200:
        print("!! нет доступа к протоколу:", proto)
        return
    home = proto["match"]["homeTeam"]
    away = proto["match"]["awayTeam"]
    side = "home" if len(proto["eligible"]["home"]) >= len(proto["eligible"]["away"]) else "away"
    team = home if side == "home" else away
    eligible = proto["eligible"][side]
    players = [p for p in eligible if p["regRole"] == "PLAYER" and not p["suspension"]]
    if len(players) < 4:
        print(f"!! мало игроков в заявке ({len(players)}) — пропускаем")
        return

    # подать состав: 2 стартовых, 2 запасных (мини, чтобы не портить чужие данные)
    starters, bench = players[:2], players[2:4]
    body = {
        "action": "lineup", "teamId": team["id"],
        "personIds": [p["personId"] for p in starters + bench],
        "starters": [p["personId"] for p in starters],
        "numbers": [{"personId": p["personId"], "number": i + 1} for i, p in enumerate(starters + bench)],
        "captainId": starters[0]["personId"],
    }
    ok, r = call("POST", f"/api/admin/matches/{mid}", body)
    print(f"lineup подан: {ok}")

    s1, s2, b1, b2 = [p["personId"] for p in starters + bench]
    n = lambda p: next(x["name"] for x in players if x["personId"] == p)

    # 1) ГОЛ запасному → 409
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 10, "type": "GOAL", "personId": b1, "teamId": team["id"]})
    print(f"1. гол ЗАПАСНОМУ [{n(b1)}]: HTTP {ok} — {r.get('error', 'ok')[:110]}")

    # 2) Жёлтая запасному → 409
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 11, "type": "YELLOW_CARD", "personId": b2, "teamId": team["id"]})
    print(f"2. ЖК ЗАПАСНОМУ [{n(b2)}]: HTTP {ok} — {r.get('error', 'ok')[:110]}")

    # 3) ЗАМЕНА: b1 выходит, s1 уходит → ок
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 20, "type": "SUBSTITUTION", "personId": b1, "teamId": team["id"], "assistPersonId": s1})
    print(f"3. замена ▲{n(b1)} ▼{n(s1)}: HTTP {ok} — {'ok' if ok == 200 else r.get('error', '')[:110]}")

    # 4) ГОЛ вышедшему → ок
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 25, "type": "GOAL", "personId": b1, "teamId": team["id"]})
    print(f"4. гол ВЫШЕДШЕМУ [{n(b1)}]: HTTP {ok} — {'ok' if ok == 200 else r.get('error', '')[:110]}")

    # 5) ГОЛ ушедшему → 409
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 30, "type": "GOAL", "personId": s1, "teamId": team["id"]})
    print(f"5. гол УШЕДШЕМУ [{n(s1)}]: HTTP {ok} — {r.get('error', 'ok')[:110]}")

    # 6) замена: «выходит» s1 (уже играл и ушёл) → 409
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 40, "type": "SUBSTITUTION", "personId": s1, "teamId": team["id"], "assistPersonId": s2})
    print(f"6. замена: ▲ушедший повторно [{n(s1)}]: HTTP {ok} — {r.get('error', 'ok')[:110]}")

    # 7) вторая валидная замена: b2 выходит, s2 уходит → 200
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 42, "type": "SUBSTITUTION", "personId": b2, "teamId": team["id"], "assistPersonId": s2})
    print(f"7. замена №2 ▲{n(b2)} ▼{n(s2)}: HTTP {ok} — {'ok' if ok == 200 else r.get('error', '')[:110]}")

    # 8) замена: вышедший уходит И должен уйти с поля — «уходит» уже вышедший b1 → 409? b1 НА поле — можно!
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 50, "type": "SUBSTITUTION", "personId": b2, "teamId": team["id"], "assistPersonId": b1})
    print(f"8. замена ▲{n(b2)} ▼вышедший ранее [{n(b1)}]: HTTP {ok} — {'ok' if ok == 200 else r.get('error', '')[:110]}")

    # 9) третий выход b2 (уже выходил в №7/№8) → 409
    ok, r = call("POST", f"/api/admin/matches/{mid}", {"action": "event", "minute": 60, "type": "SUBSTITUTION", "personId": b2, "teamId": team["id"], "assistPersonId": s2})
    print(f"9. повторный выход [{n(b2)}]: HTTP {ok} — {r.get('error', 'ok')[:110]}")

    # чистка: удалить созданные события и состав, вернуть матч как было
    ok, proto2 = call("GET", f"/api/admin/matches/{mid}")
    ev_ids = [e["id"] for e in proto2["events"]]
    mine = ev_ids[len(proto["events"]):] if len(ev_ids) > len(proto["events"]) else []
    for eid in mine:
        call("POST", f"/api/admin/matches/{mid}", {"action": "deleteEvent", "eventId": eid})
    old_lineup = proto.get("lineup", [])
    if old_lineup:
        team_line = [l for l in old_lineup if l["teamId"] == team["id"]]
        if team_line:
            call("POST", f"/api/admin/matches/{mid}", {
                "action": "lineup", "teamId": team["id"],
                "personIds": [l["personId"] for l in team_line],
                "starters": [l["personId"] for l in team_line if l["isStarter"]],
                "numbers": [{"personId": l["personId"], "number": l["number"]} for l in team_line if l["number"]],
                "captainId": next((l["personId"] for l in team_line if l["isCaptain"]), None),
            })
    else:
        # состав не был подан — снять наш
        call("POST", f"/api/admin/matches/{mid}", {"action": "lineup", "teamId": team["id"], "personIds": [s1], "starters": [s1]})
    print("cleanup: события и состав восстановлены")


if __name__ == "__main__":
    main()
