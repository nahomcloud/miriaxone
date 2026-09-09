# Cloudflare deployment

Miriaxone uses Cloudflare Pages for the existing public frontend and a Worker with
Cloudflare Containers for FastAPI. The Worker also serves the frontend at its own
URL, with `/api/*` routed directly to a container. There is no legacy API origin.

## Prerequisites

- Workers Paid enabled on the target Cloudflare account (Containers is unavailable on Free).
- Node 22 or newer; `npm install` at the repository root.
- Docker running Linux containers, with a modern Docker CLI and Buildx. Wrangler builds
  a `linux/amd64` image from `backend/Dockerfile`, using the repository root as context.
- `npx wrangler login` authorized for Workers and Containers.
- The existing MongoDB Atlas database accessible from the container network.

`wrangler.jsonc` defines the Worker, static assets, container class, SQLite Durable
Object migration, two maximum instances, and an idle timeout of ten minutes.
`LEGACY_API_URL` is no longer used. The Sandbox SDK is not required.

## Server secrets

Bind these from the account Secrets Store in `wrangler.jsonc`:

- `DB_NAME`
- `DB_USERNAME`
- `DB_PASSWORD`
- `JWT_SECRET`: preserve the existing signing secret; at least 32 bytes.

The nonsecret `DB_HOST` and `FRONTEND_URL` allowlist live in `wrangler.jsonc`.
The Worker resolves Secrets Store bindings and passes plain string environment
variables to FastAPI at container startup. For local development, copy
`.dev.vars.example` to `.dev.vars` and fill it privately. Both `.env` and
`.dev.vars` are excluded from Git and the Docker context.

## Validate and deploy

```powershell
npm run worker:types
npm run worker:check
npm run worker:test
npm test
npm run build
npx wrangler deploy --dry-run
npm run worker:deploy
```

Use `npx wrangler containers list` to check initial provisioning; it may take several
minutes after the Worker is published. Check logs with `npx wrangler tail miriaxone-api`.
The expected Worker URL for this account is `https://miriaxone-api.nahom-cloud.workers.dev`.

```powershell
npm run worker:smoke -- https://miriaxone-api.nahom-cloud.workers.dev
```

Both `/health` and `/api/health` reach FastAPI and ping MongoDB. Missing configuration
and container startup failures return JSON 503 responses, never a fake healthy result.

## Connect the existing Pages site

Keep `miriaxone.com` on the existing `miriaxone` Pages project. Set its production
build variable `VITE_API_URL=https://miriaxone-api.nahom-cloud.workers.dev/api`, rebuild,
and deploy `frontend/dist` to the production branch `miriaxone_workers_migration`.
The Worker CORS allowlist includes `https://miriaxone.com` and `https://miriaxone.pages.dev`.
The frontend served directly by the Worker can use `/api` at the same origin.

Changing a Vite variable requires a new frontend build; changing it only at runtime
will not change the JavaScript already deployed to Pages. Never put database secrets
in Pages build variables or in `VITE_*` settings.

## Upload persistence and compatibility

New public images and private order documents are stored in MongoDB's `uploads`
collection, with a maximum of 5 MiB per file. Checkout commits document records and
the order in one transaction. Admin authorization and order ownership of the document
are checked before private downloads. Public media routes cannot read private documents.
This survives container restarts and multiple instances without a filesystem volume.

Existing standalone installations can still read older local media. Existing files
on another server must be migrated before that server is retired; they are not copied
into the image. MongoDB remains the source of truth for accounts, catalog and orders.

## Backend regression tests inside Linux

```powershell
docker build --platform linux/amd64 -t miriaxone-backend:cloudflare -f backend/Dockerfile .
docker run --rm miriaxone-backend:cloudflare sh -c 'pip install -q -r backend/requirements-dev.txt && python -m unittest backend.test_auth backend.test_admin backend.test_network backend.test_storage -v'
```

These tests use an isolated fake database. Live smoke tests perform reads only and
verify that unauthenticated account/admin requests are rejected.
