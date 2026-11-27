# Centralisatian — structure

Folder: `C:\Users\Admin\Desktop\Centralisatian`

| Folder | App |
|--------|-----|
| `Price-master-sheet-main - Copy` | **P&L only** (Next + Prisma/Postgres + SSO consume) — `:3000` |
| `installation-workspace - Copy` | **Portal login + /apps + Workspace** (Vite `:5173`, API `:5000`) |
| `lead-track` | **LeadTrack / Sales Tracker CRM** (Next + Mongo + SSO consume) — `:3010` |
| `../Shipping_App-main` | **Shipping Control** (embedded in Workspace) — `:3002` |
| `../Import_App-main` | **Import Control** (embedded in Workspace) — `:3003` |
| `nginx` | One-server reverse proxy sample |
| `central-app` | Entry notes |

## User flow

1. Open Installation portal → login (email/password or WhatsApp OTP) against **Installation_backend** (Mongo).
2. After login → `/apps` chooser (access via `CENTRAL_*` env lists on Installation_backend).
3. **Open P&L** → backend mints SSO → Centralisation `/api/sso/consume` → P&L NextAuth session (auto-provisions VIEWER if email missing in Postgres).
4. **Open Workspace** → same Installation session (no second hop).
5. **Open LeadTrack** → backend mints SSO → LeadTrack `/api/sso/consume` → LeadTrack session (Sales Tracker CRM).
6. Old Centralisation `/login` and `/apps` bookmarks redirect to the Installation portal.

## Local URLs (nginx path split)

- `http://HOST/` → Installation portal + Workspace UI
- `http://HOST/ws-api/` → Installation API
- `http://HOST/pnl/` → P&L (set `NEXT_BASE_PATH=/pnl`, `AUTH_URL`/`PNL_PUBLIC_URL` accordingly)
- `http://HOST/lead-track/` → LeadTrack (set `basePath`/`LEADTRACK_PUBLIC_URL` when path-mounted)

Dev without nginx: portal `http://localhost:5173`, API `:5000`, P&L `:3000`, LeadTrack `:3010`.

`SSO_SECRET` must match on Installation_backend and Centralisation.
