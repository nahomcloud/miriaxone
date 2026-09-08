# Deployment

## Cloudflare Pages frontend

The `miriaxone_cloudflare` branch is prepared for Cloudflare Pages. It keeps the
existing React application and does not move the FastAPI/MongoDB backend into a
Worker.

Use the repository root as the Pages project directory:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `frontend/dist`
- Node version: `20`
- `VITE_API_URL`: the public API origin, or `/api` when a reverse proxy is configured

Recommended Pages settings for this branch:

```text
Production branch: miriaxone_cloudflare
Root directory: /
Build command: npm run build
Build output directory: frontend/dist
Environment variable: VITE_API_URL=https://<api-domain>
```

The root `package.json` delegates the build to the frontend workspace. The
frontend `public/_redirects` file preserves client-side routes and `public/_headers`
adds baseline response security headers. Do not put database credentials or
`JWT_SECRET` in Pages variables.

The committed `frontend/public/_redirects` file preserves client-side routes. Do not upload `.env` files or put private API values in `VITE_*` variables.

## FastAPI backend

## Cloudflare Workers migration

The `miriaxone_workers_migration` branch adds a TypeScript Worker at
`workers/src/index.ts`. During migration, the Worker owns the public API
boundary and proxies `/api/*` to the existing FastAPI service. This keeps the
React client and public domain stable while routes are migrated incrementally.

Deploy it with:

```powershell
npx wrangler deploy --config wrangler.toml
```

Configure these Worker variables:

```text
LEGACY_API_URL=https://api.miriaxone.com
FRONTEND_URL=https://miriaxone.com
```

The Worker currently does not connect to MongoDB or replace FastAPI. Do not
remove the FastAPI service until authentication, checkout, uploads, admin,
tracking, and all public catalog routes have been ported and tested.

## FastAPI backend

Deploy `backend/` with `backend/Dockerfile`, or use any Python 3.12 runtime with:

```text
uvicorn backend.main:app --host 0.0.0.0 --port 7576
```

Configure the variables documented in `config/.env.production.api.example` in the API server environment. Put `DB_USERNAME`, `DB_PASSWORD`, and `JWT_SECRET` in the API provider's secret manager. Configure `DB_NAME` and `DB_HOST` as runtime environment values, or use one server-only `MONGODB_URI` secret instead. `JWT_SECRET` must contain at least 32 random bytes. Add the deployed Pages origin to `FRONTEND_URL`.

Cloudflare Pages is a static frontend host. Its secret variables are available to the Pages build/runtime environment, not to the browser after Vite bundles the app. Do not add database values to Pages or `VITE_*` variables. Set only `VITE_API_URL=https://<api-domain>` in Pages, and configure the four server values on the separately deployed FastAPI service.

## Container deployment

`docker compose --env-file .env.local up --build` is the local production-like check. The frontend image builds the React artifact during `docker build`, then serves it with Nginx. The API image installs pinned Python dependencies and runs Uvicorn. Build artifacts, `node_modules`, credentials, and runtime uploads are excluded by `.dockerignore`.

Before pushing a release:

```powershell
npm test
npm run build
docker compose config
docker compose build
```
