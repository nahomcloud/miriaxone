# Miriaxone Worker and Cloudflare Containers

`src/index.ts` exports the `MiriaxBackend` Container class and the public Worker.
FastAPI runs from `backend/Dockerfile` on port 7576. Static assets come from
`frontend/dist`; `/api/*`, `/media/*`, and health requests go to the container.
The old `LEGACY_API_URL` proxy has been removed.

See [the deployment runbook](../docs/DEPLOYMENT.md) for secrets, Pages integration,
Workers Paid requirements, validation, and live smoke tests.
