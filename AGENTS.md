<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Feature showcase rule (every feature update)

Each change that adds or changes something a user can see must also update the README demo. A feature is not done until:

1. **E2E step** — `e2e/demo.spec.ts` walks the feature like a user would (role/label selectors, Vietnamese UI text) and asserts the visible result. Add a new numbered step, or edit the existing step if the feature changed. Calls to paid or external services (Claude via `/api/ai-layout`, the local image→3D server) are mocked with `page.route`, so the tour runs without keys.
2. **Screenshot** — the step calls `shot(page, "NN-feature-name")`, which writes `docs/demo/NN-feature-name.png` when capturing.
3. **Regenerate** — run `pnpm demo` (production build on port 3217, tour recorded, then `docs/demo/tour.gif` is rebuilt; needs ffmpeg). Look at the new PNGs before committing: no stray toasts or overlays hiding the feature, no validation errors that the demo itself caused.
4. **README** — add or update the matching row in the "Demo" section of `README.md`: one line in Vietnamese saying what the user does and gets, plus the screenshot. Remove rows for features that were removed.
5. **Checks** — `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build` all pass. Commit the PNGs and `tour.gif` together with the code (`tour.webm` is gitignored).

Bug fixes and refactors with no visible change don't need new screenshots, but `pnpm test:e2e` must still pass. If the tour breaks because the UI changed, fix the tour in the same change.
