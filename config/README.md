# Configuration

Runtime secrets stay outside Git. Copy `config/.env.local.api.example` to `.env.local` for Docker Compose and copy `config/.env.local.frontend.example` to `frontend/.env.local` for native Vite development. Production templates document the required hosting variables; configure public frontend values in Cloudflare Pages and server-only values in the API host's secret manager.

The frontend only accepts public `VITE_*` values. Never place MongoDB credentials, JWT secrets, or administrator passwords in frontend environment files because Vite embeds them in the browser bundle.

The FastAPI process reads `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`, and `JWT_SECRET` from its runtime environment. Set `DB_HOST` as a regular API environment value, or provide a server-only `MONGODB_URI` instead. Cloudflare Pages cannot provide runtime secrets to the static browser bundle; deploy the API separately and set `VITE_API_URL` in Pages to its public URL.
