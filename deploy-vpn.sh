#!/bin/bash
set -e

# ── 환경변수 설정 ──────────────────────────────────
mkdir -p /var/www/vpn-backend/data
cat > /var/www/vpn-backend/.env << 'ENVEOF'
DATABASE_URL=file:/var/www/vpn-backend/data/vpn.db
JWT_SECRET=29fd20c43e54bff761e758ff70cd8271a95c8011ae155da7bc7c63ada149762b4365f77fd826bb0b93ba03cfdc0b75f3
JWT_EXPIRES_IN=7d
ENC_KEY=08fc19d3fcd342a46cf3fbeab1e3fd24ca8bda6c0054a582a9d1d4f6d495d5f4
TELEGRAM_BOT_TOKEN=8932674421:AAHQbJeOdjO70aDbOtqxomP9Kr5gL1zMgUU
TELEGRAM_CHAT_ID=8385868332
HEARTBEAT_TIMEOUT_MS=60000
SWEEP_INTERVAL_MS=30000
STOP_LIMIT=5
ABUSE_STOPS=3
ABUSE_WINDOW_MS=300000
PORT=4000
ENVEOF

# ── 백엔드 설치 및 빌드 ────────────────────────────
mkdir -p /var/www/vpn-backend/data
cp -r /var/www/mypcbang-vpn/backend/. /var/www/vpn-backend/
cd /var/www/vpn-backend
npm install
npx prisma generate
npx prisma db push
npx ts-node prisma/seed.ts
npm run build

# ── PM2로 백엔드 실행 ──────────────────────────────
pm2 delete vpn-backend 2>/dev/null || true
pm2 start dist/main.js --name vpn-backend
pm2 save

# ── 관리자 웹 빌드 ─────────────────────────────────
cp -r /var/www/mypcbang-vpn/admin-web/. /var/www/vpn-admin/
cd /var/www/vpn-admin
npm install
npm run build
mkdir -p /var/www/html/admin
cp -r dist/. /var/www/html/admin/

# ── Nginx 설정 ────────────────────────────────────
cat > /etc/nginx/sites-available/vpn-admin << 'NGINXEOF'
server {
    listen 80;
    server_name admin.mypcbang.com;

    root /var/www/html/admin;
    index index.html;

    # API 요청 → 백엔드 (4000)
    location /api/ {
        proxy_pass http://127.0.0.1:4000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # SPA 라우팅
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/vpn-admin /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "✅ 배포 완료!"
echo "   관리자 패널: http://admin.mypcbang.com"
echo "   기본 계정: admin / admin1234"
