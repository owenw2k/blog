# Blog

## Next.js Version Note

This project uses Next.js 16, which has breaking changes from earlier versions. Before writing any Next.js-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Key changes: Turbopack is default, Tailwind 4 uses CSS-based config (no `tailwind.config.js`), ESLint uses flat config (`eslint.config.mjs`).

Personal blog with MDX posts, tags, reactions, and an admin panel.

See SPEC.md for full feature and architecture details.

## Stack

- Next.js (App Router), Tailwind, shadcn/ui, Auth.js (GitHub OAuth)
- Vercel Postgres (Neon), Vercel KV (Upstash Redis), Vercel Blob, Vercel Edge Config
- MDX via `next-mdx-remote`, Shiki for syntax highlighting

## Conventions

- TypeScript strict mode
- Tailwind for all styling — no CSS modules or inline styles
- No default exports except Next.js pages and layouts
- Prefer `async/await` over `.then()` chains
- All API routes live in `src/app/api/` as Next.js Route Handlers
- Database access only through `src/lib/db.ts` — never call `@vercel/postgres` directly in route handlers
- All environment variables documented in `.env.example`
- Never commit `.env.local`

## Testing

- Coverage target: >90% — enforced in CI
- Tests are behavioral — test observable outputs, not internal implementation details
- Shared test factories live in `__tests__/factories/` (e.g. `createPost()`)
- Every function, route handler, and component has a corresponding unit test (Jest + React Testing Library)
- Route handlers mock `@vercel/postgres`, `@vercel/kv`, `@vercel/blob`, and `@vercel/edge-config` — never hit real Vercel services in tests
- Kill switch logic must be tested in both blocked and unblocked states
- Rate limit logic must cover allow, same-type reject, and type-replace paths
- No duplicate assertions between unit and e2e tests — each behavior tested in exactly one layer
- Playwright e2e tests cover all user-facing flows
- Playwright tests use Gherkin-syntax comments (`# Given`, `# When`, `# Then`) above each step block
- Tests live in `__tests__/` (unit) and `e2e/` (Playwright) at the repo root

## Documentation

- Every function, type, constant, and route handler gets a JSDoc block — no exceptions
- Include `@param`, `@returns`, `@throws` where applicable, and `@example` for non-obvious usage
- Inline comments explain the _why_: Postgres query patterns, rate limit logic, kill switch checks
- Every field on every type gets a JSDoc description

## Kill Switch

- Every write route handler reads the Edge Config kill switch at the top of the handler, before any business logic
- Return 503 if the `writes` flag is `true`
- Edge Config reads are edge-cached — sub-millisecond, no cost concern
- Never skip this check in new write route handlers
- See SPEC.md for full kill switch details

## UI

- shadcn/ui for all components — do not build primitives from scratch
- Dark mode via Tailwind `dark:` classes, toggled via next-themes, persisted in localStorage
- All pages have a skeleton loader — use the shared `<Skeleton>` component from shadcn
- Errors surface as shadcn Toast notifications for async failures; `error.tsx` boundaries per route segment for hard failures
- All interactive elements keyboard-navigable; ARIA labels required on all icon-only buttons
- CI runs GitHub Actions (lint → typecheck → test → build) on every push and PR
- Vercel deploys: `main` → production, feature branches → preview URLs

## README

`README.md` must always be kept up to date with:

- What the project is
- Architecture diagram (Mermaid)
- How to run locally
- First-time setup steps: create GitHub OAuth app, generate AUTH_SECRET, create Neon dev branch for local Postgres
- Required environment variables (reference `.env.example`)
- How to run tests

## Auth

- Auth.js with GitHub OAuth
- Admin access gated by `ADMIN_EMAIL` env var (whitelisted email)
- All `/admin` routes and admin API endpoints require valid session
- GitHub OAuth app setup: create at github.com/settings/developers, callback URL is `https://{vercel-domain}/api/auth/callback/github` (and `http://localhost:3000/api/auth/callback/github` for local dev), scopes: `read:user`, `user:email`
- `AUTH_SECRET` generated via `openssl rand -base64 32` — document this in README setup steps
