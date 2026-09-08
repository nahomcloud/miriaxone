# Local development

## Prerequisites

- Node.js 20 or newer
- Python 3.12 or newer
- MongoDB Atlas access or a local MongoDB instance
- Docker Desktop, if using the container workflow

## Native workflow

From the repository root:

```powershell
Copy-Item config\.env.local.api.example .env.local
Copy-Item config\.env.local.frontend.example frontend\.env.local
npm install
& .venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
```

Set real database values and a random `JWT_SECRET` in `.env`. Start the API in one terminal:

```powershell
& .venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 7576 --reload
```

Start Vite in a second terminal:

```powershell
npm run dev
```

Open `http://127.0.0.1:5174`. Vite proxies `/api` to the API. Run `npm test` and `npm run build` before opening a pull request.

## Docker workflow

Docker Compose builds both images locally. The frontend build runs inside the frontend image build stage, and Nginx serves the resulting static files:

```powershell
Copy-Item config\.env.local.api.example .env.local
docker compose up --build
```

Open `http://localhost:8080`. Stop the stack with `docker compose down`.
