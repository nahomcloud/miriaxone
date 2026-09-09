# MIRIAX ONE React

React + TypeScript client with the FastAPI/MongoDB backend in `backend/`. Account endpoints now require this updated backend; see [the account review](ACCOUNT_REVIEW.md) for fixes, tests, and deployment boundaries.

Project runbooks live in [`docs/`](docs/): start with [local development](docs/LOCAL_DEVELOPMENT.md), [architecture](docs/ARCHITECTURE.md), and [deployment](docs/DEPLOYMENT.md). Environment templates and container configuration live in [`config/`](config/).

Feature coverage and legacy-contract differences are documented in [MIGRATION_PARITY.md](MIGRATION_PARITY.md).

## Project layout

- `frontend/`: React source (`src/`), static assets (`public/`), frontend-only environment, and Vite/TypeScript/test configuration.
- `backend/`: FastAPI, MongoDB access, and backend tests.
- `.env`: existing server credentials, loaded only by the backend. The frontend reads `frontend/.env`.
- Root `package.json` and `package-lock.json`: npm workspace commands and shared dependency lockfile. Run `npm install` here.

`npm run dev` starts the frontend at **http://127.0.0.1:5174**. `/api` proxies to FastAPI at **http://127.0.0.1:7576**. The frontend loads its Vite configuration explicitly and fails if port 5174 is occupied. Override `VITE_PROXY_TARGET` in `frontend/.env` if the backend runs elsewhere. Never put database secrets in that file.

Start the backend in a second terminal from the repository root:

```powershell
& .venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 7576 --reload
```

You may also run frontend commands inside `frontend/`. Build output is `frontend/dist/`. `npm run preview` serves the build on port 4174 with the same local API proxy. A deployed static host needs an API origin or its own `/api` reverse proxy.

## Run

```bash
npm install
cp config/.env.local.api.example .env.local
cp config/.env.local.frontend.example frontend/.env.local
npm run dev
```

Set `VITE_API_URL` to the deployed API origin (or keep `/api` during local development). Build with `npm run build`; deploy `frontend/dist/` as an SPA with unknown routes rewritten to `index.html`.

The browser app must not connect directly to MongoDB. This repository now includes a FastAPI backend in `backend/`. Configure its server-side environment with the `miriax` Atlas cluster and `DB_NAME=miriaxcargo`:

```env
DB_HOST=<the regular MongoDB Atlas cluster host>
DB_USERNAME=<server-side database user>
DB_PASSWORD=<server-side database password>
DB_NAME=miriaxcargo
```

Run the API locally with `pip install -r backend/requirements.txt` and `uvicorn backend.main:app --host 0.0.0.0 --port 7576`. For Cloudflare Pages, set `VITE_API_URL=https://<your-api-domain>` in the Pages environment variables and deploy the FastAPI backend separately. Do not use the Atlas SQL endpoint or put database credentials in `VITE_*` variables.

Create the root and admin accounts from the API environment. Passwords are hashed before they are stored:

```powershell
$env:ROOT_EMAIL="root@example.com"
$env:ROOT_PASSWORD="use-a-unique-password"
$env:ROOT_USERNAME="root"
$env:ADMIN_ACCOUNTS='[{"email":"admin@example.com","password":"use-another-unique-password","name":"Operations Admin","username":"operations"}]'
& ..\.venv\Scripts\python.exe backend\create_admins.py
```

If you are already inside `backend/`, run `& ..\..\.venv\Scripts\python.exe create_admins.py` instead of `python create_admins.py`.

The command is an upsert by email, so it is safe to run again when adding or rotating accounts. The root account uses the reserved `root` username and the database's allowed `admin` role. Root and admin accounts can access `/admin`; ordinary customer accounts cannot.

## Cloudflare Pages

This frontend can be deployed directly to Cloudflare Pages:

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `frontend/dist`
- Environment variable: `VITE_API_URL=https://your-api.example.com`

The `frontend/public/_redirects` file preserves client-side routes on refresh. The FastAPI backend must be deployed separately and configured to allow requests from the Pages domain with CORS. Do not put API secrets in `VITE_*` variables because they are included in the browser bundle.

For a production-like local container check, copy `config/.env.local.api.example` to `.env.local` and run `docker compose --env-file .env.local up --build`. The frontend image builds the Vite bundle during containerization and serves it through Nginx; the API runs as a separate container. Production variable templates are in `config/.env.production.*.example` and should be entered in the hosting dashboards.

The `miriaxone_workers_migration` branch runs the existing FastAPI backend in Cloudflare Containers behind a Worker. The Worker also serves the React build and sends `/api/*` directly to the container. See [Cloudflare deployment](docs/DEPLOYMENT.md) for setup, secrets, and live smoke tests.

## Main routes

- `/place-order` or `/ship` — complete quote, document upload, checkout, and payment flow
- `/track` — public shipment tracking
- `/dashboard` or `/account` — customer order history
- `/admin` — operations and configuration console

## Account flows and tests

Set a server-only `JWT_SECRET` with at least 32 random bytes before starting the API. Registration and password changes require at least 15 characters (at most 72 UTF-8 bytes with bcrypt). Customers use `/account`; admins use `/admin` and can open account settings from its sidebar. Sign out and password changes revoke sessions on all devices.

From the repository root:

```powershell
npm test
npm run build
& ..\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
& ..\.venv\Scripts\python.exe -m unittest backend.test_auth -v
```

Tests use fake data and do not connect to Atlas. To recover a verified legacy account without changing its role, run `python -m backend.reset_password user@example.com` from the repository root and enter the new password at the prompts. Email-based self-service recovery is not configured.

## Admin management

All ten admin sections now use structured forms, paginated lists, and validated APIs. See [ADMIN_FEATURES.md](ADMIN_FEATURES.md) for the feature matrix, archive/restore behavior, private settings, uploads, tests, and external-service boundaries.

Run the complete backend regression suite with `python -m unittest backend.test_auth backend.test_admin -v`.

## MIRIAX ONE ZIP integration

The reviewed ZIP update adds the MIRIAX ONE home page, persistent Services and Routes administration, and server-enforced country/service availability. See [ZIP_MERGE_REVIEW.md](ZIP_MERGE_REVIEW.md) for the integration scope, remaining prototype-only features, and route activation behavior.

Creating the first route enables an explicit allowlist for all new bookings. Configure every supported origin, destination, and service combination before relying on managed routes.

