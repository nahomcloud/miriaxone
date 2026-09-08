# Architecture

MIRIAX ONE is a two-service application:

- `frontend/` is a React and TypeScript single-page application built by Vite.
- `backend/` is a FastAPI application that owns authentication, validation, MongoDB access, uploads, and business rules.
- `config/` contains safe environment templates and configuration guidance.
- `docs/` contains development and deployment runbooks.

The browser never connects directly to MongoDB. In local development, Vite proxies `/api` to FastAPI. In Docker, Nginx proxies `/api` to the `api` Compose service. In Cloudflare Pages, `/api` must point to a separately deployed API origin or be routed through a reverse proxy.

Keep React components focused on rendering and user interaction. Keep API calls in `frontend/src/api.ts` and authentication state in `frontend/src/auth.tsx`. Backend route handlers should validate input with Pydantic and keep secrets in environment variables.
