# Frontend structure

The frontend uses React 18, TypeScript, React Router, and Vite.

- `src/App.tsx` owns route composition and shared page shells.
- `src/api.ts` owns HTTP requests and response unwrapping.
- `src/auth.tsx` owns authentication state and guards.
- Page-level components stay in `src/` until a feature becomes large enough to justify a `src/features/<name>/` directory.
- Shared presentational components belong in `src/components/`; shared types belong in `src/types/`.
- Keep effects tied to external systems, include complete dependency lists, and use stable keys from domain IDs.
- Keep browser environment variables public and prefixed with `VITE_`.

Run `npm test`, `npm run build`, and inspect the production bundle before deployment.
