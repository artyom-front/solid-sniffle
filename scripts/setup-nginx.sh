#!/usr/bin/env bash
# ============================================================
# SCORESBOX · setup-nginx.sh — настройка nginx под домен.
# Домен — ПАРАМЕТР: смена домена не требует правки файлов.
#
# Запуск на сервере (из /opt/scoresbox):
#   sudo ./scripts/setup-nginx.sh footballday.ru     # текущий домен
#   sudo ./scripts/setup-nginx.sh scoresbox.ru       # после смены домена
#
# Что делает:
#   1. пишет /etc/nginx/sites-available/scoresbox под указанный домен
#   2. включает сайт, удаляет старые конфиги проекта (scores21, default)
#   3. проверяет конфиг (nginx -t) и перечитывает nginx
# SSL-сертификат добавляет certbot (см. DEPLOY.md, шаг про SSL).
# ============================================================
set -euo pipefail

DOMAIN="${1:?Использование: ./scripts/setup-nginx.sh <домен, например footballday.ru>}"

# валидация: похоже ли на домен (footballday.ru, scoresbox.ru, www тоже ок)
if ! [[ "$DOMAIN" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$ ]]; then
  echo "!! «$DOMAIN» не похоже на домен (ожидается вида footballday.ru)"
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "!! Запустите от root: sudo ./scripts/setup-nginx.sh $DOMAIN"
  exit 1
fi

SITE_FILE=/etc/nginx/sites-available/scoresbox

# ---------- конфиг nginx (шаблон + подстановка домена) ----------
cat > "$SITE_FILE" <<'TPL'
# SCORESBOX · nginx — генерируется scripts/setup-nginx.sh <домен>.
# НЕ редактировать руками: для смены домена запустите скрипт заново.
upstream scoresbox_app {
    server 127.0.0.1:3000;
    keepalive 32;          # задел под WebSocket (live-счёт) и 2-й инстанс
}

server {
    listen 80;
    server_name __DOMAIN__ www.__DOMAIN__;

    # SSL добавит: certbot --nginx -d __DOMAIN__ -d www.__DOMAIN__
    # (certbot сам перепишет этот блок на редирект 301 -> https)

    # безопасность
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # gzip для текстовых ассетов (HTML/JSON/JS/CSS)
    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;
    gzip_min_length 1024;

    client_max_body_size 2m;

    location / {
        proxy_pass http://scoresbox_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # статика Next.js иммутабельна — кэшируем на 30 дней
    location /_next/static/ {
        proxy_pass http://scoresbox_app;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }
}
TPL

sed -i "s/__DOMAIN__/$DOMAIN/g" "$SITE_FILE"

# ---------- включаем сайт, чистим старьё ----------
ln -sf "$SITE_FILE" /etc/nginx/sites-enabled/scoresbox
rm -f /etc/nginx/sites-enabled/scores21 /etc/nginx/sites-available/scores21
rm -f /etc/nginx/sites-enabled/default   # заглушка nginx «Welcome to nginx»

# ---------- проверка и перезагрузка ----------
nginx -t
systemctl reload nginx

echo ""
echo "==> nginx готов: принимает $DOMAIN и www.$DOMAIN (HTTP)."
echo "    Следующий шаг: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
