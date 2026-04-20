# Blog

## Next.js Version Note

This project uses Next.js 16, which has breaking changes from earlier versions. Before writing any Next.js-specific code, read the relevant guide in `node_modules/next/dist/docs/`. Key changes: Turbopack is default, Tailwind 4 uses CSS-based config (no `tailwind.config.js`), ESLint uses flat config (`eslint.config.mjs`).

Personal blog with MDX posts, tags, reactions, and an admin panel.

See SPEC.md for full feature and architecture details.

## Stack

- Next.js (App Router), Tailwind, shadcn/ui, Auth.js (GitHub OAuth)
- AWS Lambda (Function URLs), DynamoDB (single table), S3 + CloudFront
- MDX via `next-mdx-remote`, Shiki for syntax highlighting

## Conventions

- TypeScript strict mode
- Tailwind for all styling — no CSS modules or inline styles
- No default exports except Next.js pages and layouts
- Prefer `async/await` over `.then()` chains
- Lambda functions live in `backend/functions/` — one file per endpoint group
- DynamoDB access only through `backend/lib/db.ts` — never call the SDK directly in handlers
- All environment variables documented in `.env.example`
- Never commit `.env.local`

## Testing

- Coverage target: >90% — enforced in CI
- Tests are behavioral — test observable outputs, not internal implementation details
- Shared test factories live in `__tests__/factories/` (e.g. `createPost()`, `createDynamoRecord()`)
- Every function, Lambda handler, and component has a corresponding unit test (Jest + React Testing Library)
- Lambda handlers mock all AWS SDK calls — never hit real AWS in tests
- Kill switch logic must be tested in both blocked and unblocked states
- No duplicate assertions between unit and e2e tests — each behavior tested in exactly one layer
- Playwright e2e tests cover all user-facing flows
- Playwright tests use Gherkin-syntax comments (`# Given`, `# When`, `# Then`) above each step block
- Tests live in `__tests__/` (unit) and `e2e/` (Playwright) at the repo root

## Documentation

- Every function, type, constant, and Lambda handler gets a JSDoc block — no exceptions
- Include `@param`, `@returns`, `@throws` where applicable, and `@example` for non-obvious usage
- Inline comments explain the _why_: DynamoDB access patterns, rate limit logic, kill switch checks, AWS SDK quirks
- Every field on every type gets a JSDoc description

## AWS Free Tier Guardrails

- DynamoDB provisioned at 10R/10W — do not change to on-demand
- Lambda reserved concurrency set to 10 at account level
- CloudWatch log retention set to 7 days on all Lambda log groups
- Do not add API Gateway — use Lambda Function URLs only

## Hard Shutdown (Kill Switch)

- Every Lambda caches the kill switch in module-level memory with a 60-second TTL — never call SSM on every invocation
- Every write Lambda checks the cached kill switch at handler start, before any business logic
- Return 503 if `killswitch.writes` or `killswitch.all` is true
- Never skip this check in new write Lambda handlers
- See SPEC.md for full alarm thresholds and trigger logic

## AWS Cost Rules

- DynamoDB must stay on provisioned mode — never switch to on-demand
- Lambda reserved concurrency capped at 10 across all functions
- CloudWatch log retention set to 7 days on every Lambda log group — set this immediately on creation
- Log only `info`, `warn`, `error` — never log request/response bodies or debug noise (CloudWatch Logs charges for ingestion above 5GB/month)
- No API Gateway — Lambda Function URLs only
- SSM standard parameters only — never Secrets Manager (costs money)
- S3 GET requests served via CloudFront — never expose S3 origin URLs directly

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
- How to run locally (including Docker for DynamoDB Local)
- First-time setup steps: create GitHub OAuth app, generate AUTH_SECRET, create SSM parameter `/blog/killswitch` with value `{"writes":false,"all":false}`
- Required environment variables (reference `.env.example`)
- How to run tests

## Auth

- Auth.js with GitHub OAuth
- Admin access gated by `ADMIN_EMAIL` env var (whitelisted email)
- All `/admin` routes and admin Lambda endpoints require valid session
- GitHub OAuth app setup: create at github.com/settings/developers, callback URL is `https://{vercel-domain}/api/auth/callback/github` (and `http://localhost:3000/api/auth/callback/github` for local dev), scopes: `read:user`, `user:email`
- `AUTH_SECRET` generated via `openssl rand -base64 32` — document this in README setup steps
