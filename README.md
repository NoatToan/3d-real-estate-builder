# 3D Real Estate Builder

Browser-based house designer: define a lot (trace it from a photo/scan with OCR of the dimensions, or enter it manually), draw walls, rooms, doors, windows and stairs per floor on a 2D plan, then walk around the result in 3D.

- **Stack:** Next.js (App Router, static export) · React 19 · TypeScript · Tailwind CSS v4
- **2D plan:** Konva / react-konva · **3D viewer:** Babylon.js · **OCR:** tesseract.js (Vietnamese + English, assets served locally)
- **State:** Zustand + Immer + zundo (undo/redo) · **Persistence:** IndexedDB (`idb-keyval`), projects can be exported/imported as `.reb.json`

The app is fully client-side — there is no backend or database; projects are stored in the user's browser.

## Getting started

Requires Node ≥ 20.9 and pnpm (version pinned in `packageManager`; `corepack enable` picks it up).

```bash
pnpm install                # also copies the tesseract assets into public/tesseract
cp .env.example .env.local  # optional, see below
pnpm dev                    # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` | Static build into `out/` |
| `pnpm start` | Serve `out/` locally |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | Unit tests (Vitest) for geometry, domain, store, persistence, OCR parsing |
| `pnpm test:coverage` | Tests with coverage thresholds |

## Project layout

```
src/
  app/          routes: / (projects home), /editor
  features/     home, lot wizard, 2D plan, 3D viewer, editor shell
  domain/       types, zod schema, factories, validation, stats
  geometry/     polygon/segment math, wall graph, snapping, openings, stairs, hit testing
  store/        Zustand stores (project + editor UI)
  persistence/  IndexedDB, autosave, import/export
  ocr/          image helpers, tesseract wrapper, dimension parsing
  components/ui shared UI primitives
```

## Environment variables

See `.env.example`. Only `NEXT_PUBLIC_BASE_PATH` (optional) — set it when the site is hosted under a sub-path so the OCR assets resolve.

## Deploy

Deployed on Vercel as a static Next.js export (`output: "export"`); install/build commands are pinned in `vercel.json`. Every merge to `main` deploys production. No env vars are required.
