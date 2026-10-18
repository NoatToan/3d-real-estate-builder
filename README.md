# 3D Real Estate Builder

Browser-based house designer: define a lot (trace it from a photo/scan with OCR of the dimensions, or enter it manually), draw walls, rooms, doors, windows and stairs per floor on a 2D plan, then walk around the result in 3D.

- **Stack:** Next.js (App Router, static export) · React 19 · TypeScript · Tailwind CSS v4
- **2D plan:** Konva / react-konva · **3D viewer:** Babylon.js · **OCR:** tesseract.js (Vietnamese + English, assets served locally)
- **State:** Zustand + Immer + zundo (undo/redo) · **Persistence:** IndexedDB (`idb-keyval`), projects can be exported/imported as `.reb.json`

**Getting started is guided:** the side panel opens with a 5-step checklist (lot → walls → doors/stairs → furniture → floors/3D/finance) with one-click actions, the left toolbar has text labels, and **Hướng dẫn** (or `?`) opens a plain-language manual with the jargon explained. **Tạo nhanh** lays out a whole townhouse floor from a template (ground floor, 2 bedrooms, office, shop, worship + laundry, open) as bands from the street to the back: walls, doors, facade window/door, a U stair with a WC beside it, and furniture, fitted to the lot, road cut and setbacks. A **furniture library** (24 pieces: living, bedroom, kitchen, bath, office, car/motorbike…) can be placed, dragged, rotated (R) and resized; each piece is one part list drawn as the 2D symbol and built as the 3D model. In 3D, the top visible floor shows 1.2 m walls (toggle) so rooms and furniture are visible.

The **Tài chính** view (shortcut `4`) turns the drawn floors into a feasibility study: equivalent floor area (móng + floors + mái) × turnkey price, extra cost items, own capital vs. bank loan, rental income lines, and a 20-year cash flow with break-even / loan-payoff year under low / base / high scenarios. Money is in million VND; inputs are saved with the project.

Lots can carry a **road cut** (giải phóng mặt bằng / lộ giới): pick the edge on the road and the depth taken; the plan and 3D show the strip in orange, and coverage, FAR, exterior walls, setbacks and the "outside the lot" check all use the land that is left.

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
  features/     home, lot wizard, 2D plan, 3D viewer, finance, editor shell
  domain/       types, zod schema, factories, validation, stats, finance model
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
