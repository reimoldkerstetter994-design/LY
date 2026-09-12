# LY

A modern **Vite + React + TypeScript** starter with a working task board, used to
demonstrate a fully configured Cloud Agent development environment.

## Requirements

- Node.js >= 20 (CI/dev uses Node 22)
- [pnpm](https://pnpm.io) (pinned via the `packageManager` field; run `corepack enable`)

## Getting started

```bash
corepack enable
pnpm install
pnpm dev
```

The dev server runs on [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Vite dev server with hot-module reload |
| `pnpm build` | Type-check and build the production bundle to `dist/` |
| `pnpm preview` | Serve the production build locally |
| `pnpm lint` | Run ESLint over the project |
| `pnpm test` | Run the Vitest unit + component tests |

## Project structure

```
src/
  App.tsx          # Task board UI
  lib/todos.ts     # Pure task-list logic (unit tested)
  lib/todos.test.ts
  App.test.tsx     # Component test (Testing Library + jsdom)
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cloud Agent environment:

- `install` — `pnpm install --frozen-lockfile` to restore dependencies
- `terminals` — runs `pnpm dev` so the app is live on port `5173`
- `ports` — exposes `5173`
