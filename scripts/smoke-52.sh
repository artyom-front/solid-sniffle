#!/bin/bash
# v1.0.52 · смок фидбека 2026-10-08: тёзки, антидубли, замены, капитан
set -u
BASE=http://localhost:3000
JAR=/tmp/smoke52-cookies.txt
rm -f "$JAR"

login() {
  curl -s -c "$JAR" -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    -d '{"email":"admin@ff21.ru","password":"admin123"}' | head -c 200
  echo ""
}

post() {
  curl -s -b "$JAR" -c "$JAR" -X POST "$BASE$1" -H "Content-Type: application/json" -d "$2"
}

patch() {
  curl -s -b "$JAR" -c "$JAR" -X PATCH "$BASE$1" -H "Content-Type: application/json" -d "$2"
}

echo "=== 1. Логин ==="
login

echo "=== 2. Тёзка №1 (без ДР) — создаётся ==="
post /api/admin/persons '{"firstName":"Тёзкин","lastName":"Тёзков","roles":["PLAYER"]}' | head -c 300; echo ""

echo "=== 3. Тёзка №2 (те же Ф+И, без ДР) — должна СОЗДАТЬСЯ + advisory ==="
post /api/admin/persons '{"firstName":"Тёзкин","lastName":"Тёзков","roles":["PLAYER"]}' | head -c 400; echo ""

echo "=== 4. Тёзка №3 (Ф+И+ДР полностью совпадает с №2) — 409 + дубль ==="
post /api/admin/persons '{"firstName":"Тёзкин","lastName":"Тёзков","birthDate":"1995-05-05","roles":["PLAYER"]}' | head -c 300; echo ""
echo "--- и с force: true — создаётся:"
post /api/admin/persons '{"firstName":"Тёзкин","lastName":"Тёзков","birthDate":"1995-05-05","roles":["PLAYER"],"force":true}' | head -c 200; echo ""

echo "=== 5. Замены/события: матч + состав + проверки ==="
# возьмём существующий матч из сида
MATCH=$(curl -s -b "$JAR" "$BASE/api/admin/matches?take=1" | head -c 200)
echo "матч(сырье): $MATCH"
