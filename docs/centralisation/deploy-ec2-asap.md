# Centralisation — deploy on EC2 (portal on Installation, P&L only)

## Ownership

| Path / process | Repo |
|----------------|------|
| `/` portal login + `/apps` + Workspace UI | `NOTOFIRE-PVT-LTD/Installation_frontend` |
| `/ws-api/` API | `NOTOFIRE-PVT-LTD/Installation_backend` |
| `/pnl/` P&L UI + APIs + SSO consume | `MansiCodes/Centralisation` |

## 0) Launch / reuse instance (Mumbai `ap-south-1`)

Same as before: Ubuntu 22.04, t3.micro+, nginx, Node 20, pm2, swap if builds OOM.

## 1) Clone the three repos

```bash
sudo mkdir -p /var/www && sudo chown ubuntu:ubuntu /var/www
cd /var/www

git clone -b main https://github.com/MansiCodes/Centralisation.git pnl
git clone -b main https://github.com/NOTOFIRE-PVT-LTD/Installation_backend.git workspace-api
git clone -b main https://github.com/NOTOFIRE-PVT-LTD/Installation_frontend.git workspace-web
```

### Branch cutover (with the other developer)

1. Land portal work on Installation `dev`, smoke-test.
2. Merge `dev` → `main` on **Installation_frontend** and **Installation_backend**.
3. Deploy Centralisation `main` (SSO consume + `/login`/`/apps` redirects + portal strip).
4. Rebuild all three on the server (section 5).

## 2) Env files (same `SSO_SECRET` everywhere)

### `/var/www/pnl/.env`

```env
DATABASE_URL=postgresql://...
AUTH_URL=http://SERVER_IP/pnl
NEXTAUTH_URL=http://SERVER_IP/pnl
NEXT_PUBLIC_APP_URL=http://SERVER_IP/pnl
PNL_PUBLIC_URL=http://SERVER_IP/pnl
PORTAL_PUBLIC_URL=http://SERVER_IP
NEXT_PUBLIC_PORTAL_PUBLIC_URL=http://SERVER_IP
NEXT_BASE_PATH=/pnl
SSO_SECRET=long-random-shared-secret
CENTRAL_BOTH_EMAILS=your@email.com
AUTH_SECRET=...
```

### `/var/www/workspace-api/.env`

```env
NODE_ENV=production
PORT=5000
CLIENT_URL=http://SERVER_IP
MONGODB_URI=...
SSO_SECRET=long-random-shared-secret
PNL_PUBLIC_URL=http://SERVER_IP/pnl
PRIMARY_SUPER_ADMIN_EMAIL=...
CENTRAL_BOTH_EMAILS=...
CENTRAL_PNL_DEFAULT=true
```

### `/var/www/workspace-web/.env.production`

```env
VITE_API_BASE_URL=http://SERVER_IP/ws-api
VITE_PNL_PUBLIC_URL=http://SERVER_IP/pnl
VITE_APP_NAME=Valuecon Workspace
VITE_BASE_PATH=/
```

## 3) Install + build

```bash
cd /var/www/pnl
npm ci
npx prisma generate
npx prisma db push
# NEXT_BASE_PATH must be set in env before build
npm run build
pm2 start npm --name pnl -- start

cd /var/www/workspace-api
npm ci
pm2 start src/server.js --name workspace-api

cd /var/www/workspace-web
npm ci
npm run build
pm2 save && pm2 startup
```

## 4) Nginx

Use `nginx/centralisatian.conf` from this monorepo, or:

```bash
sudo tee /etc/nginx/sites-available/centralisation <<'EOF'
server {
    listen 80 default_server;
    server_name _;

    location /ws-api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /pnl/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        root /var/www/workspace-web/dist;
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/centralisation /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

For local Vite proxy (no static build), point `/` at `127.0.0.1:5173` instead of `root`.

## 5) Smoke test

| URL | Expect |
|-----|--------|
| `http://SERVER_IP/login` | Installation portal login |
| `http://SERVER_IP/apps` | App launcher |
| `http://SERVER_IP/pnl/` | P&L after Open P&L (SSO) |
| `http://SERVER_IP/pnl/login` | Redirects to portal `/login` |
| Open Workspace from `/apps` | Same session, no second login |

## 6) Re-deploy

```bash
cd /var/www/pnl && git pull && npm ci && npx prisma generate && npm run build && pm2 restart pnl
cd /var/www/workspace-api && git pull && npm ci && pm2 restart workspace-api
cd /var/www/workspace-web && git pull && npm ci && npm run build
```

## Risk note

Emails that exist **only** in P&L Postgres must exist (or be listed) on Installation Mongo before cutover, or login fails at the portal. SSO consume will auto-create a P&L VIEWER row when a Mongo user opens P&L for the first time.
