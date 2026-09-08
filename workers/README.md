# Miriaxone Workers migration

This Worker is the Cloudflare API boundary for the migration from FastAPI to TypeScript. During the compatibility phase it keeps all existing FastAPI routes working by proxying `/api/*` to `LEGACY_API_URL`.

## Deploy

From the repository root:

```powershell
npx wrangler deploy --config wrangler.toml
```

Configure these Worker variables in Cloudflare:

```text
LEGACY_API_URL=https://api.miriaxone.com
FRONTEND_URL=https://miriaxone.com
```

The Worker does not contain MongoDB credentials and does not connect to MongoDB yet. Migrate and test each FastAPI route before removing the compatibility proxy.

## Local smoke test

```powershell
npx wrangler dev --config wrangler.toml
```

Then request `/health` and `/api/health`.
