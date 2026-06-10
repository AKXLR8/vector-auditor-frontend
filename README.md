# Vector Auditor Frontend

RAG-powered document auditor frontend built with React + TypeScript + Vite.

## Getting Started

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://127.0.0.1:8000` | Backend API base URL |

The config is loaded at runtime via `public/config.js` (if present) or from `VITE_API_URL` at build time. See `src/api/config.ts`.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |

## Caching Strategy

Three-tier caching for instant UI rendering with background refresh:

- **Document list** — cached in `localStorage` (5 min TTL). On page load, cached docs render immediately while fresh data is fetched from the API.
- **Session list** — cached in `localStorage`. Rendered instantly from cache; API response merged in the background.
- **Chat messages** — cached per session in IndexedDB (via Dexie.js, 5 min TTL). When switching chats, cached messages display instantly while the API call completes in the background.

Cache is stored under `va_cache_*` keys in localStorage and the `vector_auditor_messages` IndexedDB database.

## Project Structure

```
src/
├── api/          # API client functions
├── components/   # Reusable UI components
├── context/      # React context providers
├── hooks/        # Custom React hooks
├── lib/          # Utilities and caching
├── pages/        # Route-level pages
└── types/        # TypeScript types
```
