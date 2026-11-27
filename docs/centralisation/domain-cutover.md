# Domain cutover (EC2) — Elastic IP + HTTPS

Live layout on `13.201.19.145` today (keep the same paths on the domain):

| Path | App |
|------|-----|
| `/` | P&L (Next.js :3000) |
| `/ws/` | Installation Workspace (static `workspace-web/dist`) |
| `/ws-api/` | Installation API (:5000) |
| `/ship-app/` | Shipping (:3002) |

Replace `YOUR_DOMAIN` below with e.g. `app.atlantatelecables.com`.

---

## 1) Elastic IP — do this **before** DNS

**You need a stable public IP.** A normal EC2 public IP can change if the instance is stopped/started. An **Elastic IP** stays fixed.

### Check in AWS Console (Mumbai `ap-south-1`)

1. **EC2 → Elastic IP addresses**
2. Look for `13.201.19.145`

| What you see | Action |
|--------------|--------|
| That IP is listed and **Associated** to this instance | You already have an Elastic IP — skip allocate |
| IP not listed / instance has a different public IP | **Allocate** Elastic IP → **Associate** to this instance |

### If you must allocate

1. EC2 → Elastic IPs → **Allocate Elastic IP address** (Amazon’s pool) → Allocate  
2. Actions → **Associate Elastic IP address** → choose this instance / primary ENI  
3. Note the new IP (may still be `13.201.19.145` if that was already Elastic)

**Security group** (same instance): inbound **22** (your IP), **80**, **443** from `0.0.0.0/0`.

Do **not** point DNS until the Elastic IP is associated and you can open `http://ELASTIC_IP/` in a browser.

---

## 2) DNS (after Elastic IP is confirmed)

At your DNS host (Route53 / GoDaddy / Cloudflare):

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `YOUR_DOMAIN` (or `@` / `app`) | **Elastic IP** | 300 |

Optional: `www` → CNAME → `YOUR_DOMAIN`.

Wait until:

```text
nslookup YOUR_DOMAIN
```

returns the Elastic IP.

---

## 3) Nginx — ready for domain + Certbot

On the server, replace `server_name _;` with:

```nginx
server_name YOUR_DOMAIN;
```

Full site file to use (same paths as production today): see `nginx/centralisatian-domain.conf` in this repo.

Then HTTPS:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d YOUR_DOMAIN
sudo nginx -t && sudo systemctl reload nginx
```

---

## 4) Env URL swap (then rebuild)

Change every `http://13.201.19.145` → `https://YOUR_DOMAIN` (keep path suffixes).

### `/var/www/pnl/.env`

```env
NEXT_PUBLIC_APP_URL=https://YOUR_DOMAIN
AUTH_URL=https://YOUR_DOMAIN
NEXTAUTH_URL=https://YOUR_DOMAIN
PNL_PUBLIC_URL=https://YOUR_DOMAIN
PORTAL_PUBLIC_URL=https://YOUR_DOMAIN/ws
NEXT_PUBLIC_PORTAL_PUBLIC_URL=https://YOUR_DOMAIN/ws
WORKSPACE_PUBLIC_URL=https://YOUR_DOMAIN/ws
WORKSPACE_API_URL=https://YOUR_DOMAIN/ws-api
```

Do **not** change `SSO_SECRET` / `AUTH_SECRET` / `DATABASE_URL`.

### `/var/www/workspace-api/.env`

```env
CLIENT_URL=https://YOUR_DOMAIN/ws
PNL_PUBLIC_URL=https://YOUR_DOMAIN
```

Same `SSO_SECRET` as P&L.

### `/var/www/workspace-web/.env.production`

```env
VITE_API_BASE_URL=https://YOUR_DOMAIN/ws-api
VITE_PNL_PUBLIC_URL=https://YOUR_DOMAIN
VITE_SHIPPING_APP_URL=https://YOUR_DOMAIN/ship-app
```

Shipping app: set public / embed parent URLs to `https://YOUR_DOMAIN` as needed.

---

## 5) Rebuild + restart

```bash
cd /var/www/pnl && export NODE_OPTIONS=--max-old-space-size=2048 && npm run build && pm2 restart pnl
cd /var/www/workspace-api && pm2 restart workspace-api
cd /var/www/workspace-web && npm ci && npm run build
# if shipping present:
# cd /path/to/shipping && npm run build && pm2 restart shipping-app
pm2 save
```

---

## 6) Smoke test

- `https://YOUR_DOMAIN/` → P&L / Dashboard  
- `https://YOUR_DOMAIN/ws/` → Workspace  
- `https://YOUR_DOMAIN/ship-app/` → Shipping  
- Login / SSO does not bounce back to the old IP  
- Hard refresh after cutover  

---

## Order (short)

1. Confirm or create **Elastic IP** and associate  
2. Open **80/443** on SG  
3. Create **DNS A** → Elastic IP  
4. Update nginx `server_name` + **Certbot**  
5. Update **.env** URLs → **rebuild** apps  
6. Smoke test  

Amplify is not part of this cutover.
