# Centralisation deploy (read this first)

This folder is the **ops map** for the Valuecon Centralisation stack. App code lives in separate GitHub repos; **nginx is not an app repo** — the confs here are what you install on the server.

## Repos

| Role | GitHub | Server path | Public path |
|------|--------|-------------|-------------|
| Portal + Workspace UI | `NOTOFIRE-PVT-LTD/Installation_frontend` | `/var/www/workspace-web` | `/ws/` |
| API + portal SSO mint | `NOTOFIRE-PVT-LTD/Installation_backend` | `/var/www/workspace-api` | `/ws-api/` |
| P&L | `MansiCodes/Price-Master-Sheet` (Centralisation) | `/var/www/pnl` | `/` |
| LeadTrack CRM (optional) | `MansiCodes/lead-track` | `/var/www/lead-track` | `/lead-track/` |

## Nginx

- Samples: [`nginx/centralisatian-domain.conf`](./nginx/centralisatian-domain.conf) (domain + TLS) and [`nginx/centralisatian.conf`](./nginx/centralisatian.conf).
- On the server they become `/etc/nginx/sites-available/centralisation` (name may vary).
- Pushing FE/BE **does not** update nginx. After path changes: edit conf → `nginx -t` → reload.
- LeadTrack location snippet: [`nginx/nginx-lead-track.snippet`](./nginx/nginx-lead-track.snippet).

## Docs in this folder

- [`STRUCTURE.md`](./STRUCTURE.md) — apps, ports, login → `/apps` → SSO flow
- [`deploy-ec2-asap.md`](./deploy-ec2-asap.md) — clone, env (`SSO_SECRET` shared), build, pm2
- [`domain-cutover.md`](./domain-cutover.md) — hostname / HTTPS cutover
- [`portal-cutover-merge.md`](./portal-cutover-merge.md) — FE/BE merge notes with Workspace owners

## Day-to-day for Installation owners

1. Change Workspace/portal code in **Installation_frontend** / **Installation_backend** → push → build on EC2 → `pm2 restart`.
2. Need a new URL path or SSL? Update **nginx** from this folder on the server (not via `npm`).
3. P&L / LeadTrack code changes belong in those repos; this backend only mints SSO (`open-pnl` / `open-leadtrack`).
