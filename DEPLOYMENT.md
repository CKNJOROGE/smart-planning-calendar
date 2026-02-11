# Production Deployment

## Files added
- `docker-compose.prod.yml`
- `deploy/nginx/nginx.conf`
- `deploy/nginx/Dockerfile`
- `backend/Dockerfile`
- `backend/requirements.txt`
- `.env.prod.example`
- `backend/.env.example`

## 1. Prepare environment files

From repo root:

```powershell
Copy-Item .env.prod.example .env
Copy-Item backend/.env.example backend/.env
```

Then edit:
- `.env` for Postgres credentials.
  - set `RUN_MIGRATIONS_ON_START=true` only when you intentionally want migrations to run during backend startup
- `backend/.env` for production values:
  - `APP_ENV=production`
  - `DATABASE_URL=postgresql+psycopg2://<user>:<pass>@db:5432/<db>`
  - strong `JWT_SECRET`
  - `CORS_ORIGINS` with your real frontend domain
  - `TRUSTED_HOSTS` with your real host(s)
  - `ALLOW_CREATE_FIRST_ADMIN=false` (after bootstrap)
  - `ENABLE_AUTO_SCHEMA_CREATE=false`

## 2. Start stack

```powershell
docker compose --env-file .env -f docker-compose.prod.yml up -d --build
```

## 3. Bootstrap first admin (one-time)

Temporarily set in `backend/.env`:
- `ALLOW_CREATE_FIRST_ADMIN=true`
- `FIRST_ADMIN_BOOTSTRAP_TOKEN=<one_time_token>`

Restart backend:

```powershell
docker compose --env-file .env -f docker-compose.prod.yml up -d backend
```

Create admin:

```powershell
curl -X POST http://localhost/api/admin/create-first-admin `
  -H "Content-Type: application/json" `
  -H "X-Bootstrap-Token: <one_time_token>" `
  -d "{\"name\":\"Platform Admin\",\"email\":\"admin@yourcompany.com\",\"password\":\"<strong_password_min_12_chars>\"}"
```

Then set `ALLOW_CREATE_FIRST_ADMIN=false` and restart backend again.

## 4. Verify

- Frontend: `http://localhost/`
- API via nginx: `http://localhost/api/me` (with token)
- Health: `http://localhost/api/healthz`
- WebSocket: `ws://localhost/ws?token=<jwt>`

## Notes

- Nginx serves frontend static assets and reverse-proxies:
  - `/api/*` -> backend
  - `/ws` -> backend websocket
- Frontend uses `VITE_API_BASE` default `/api`.
- Vite dev proxy is configured for local development.
