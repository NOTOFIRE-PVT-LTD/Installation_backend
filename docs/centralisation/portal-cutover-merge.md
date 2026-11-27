# Portal cutover — merge checklist

Do this with the other developer when ready to ship.

## Installation_frontend (`dev` → `main`)

```bash
cd Installation_frontend
git checkout dev
git pull
# ensure portal pages + LoginPage → /apps are present
git checkout main
git pull
git merge dev
git push origin main
```

## Installation_backend (`dev` → `main`)

```bash
cd Installation_backend
git checkout dev
git pull
# ensure /central/portal routes + SSO mint + .env.example
git checkout main
git pull
git merge dev
git push origin main
```

## Centralisation (`main`)

Push P&L-only changes (SSO consume, portal redirects, stripped `/apps` UI):

```bash
cd Centralisation   # Price-master-sheet-main - Copy locally
git push centralisation main
```

## Server rebuild

Follow `docs/deploy-ec2-asap.md` sections 3–6 (env, nginx path split, pm2 restart).
