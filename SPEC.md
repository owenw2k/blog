# Blog Spec

## Features

- Posts with MDX (JSX-in-markdown, rich content)
- Draft / published toggle
- Tags — browse posts by tag
- Client-side full-text search (title, tags, excerpt)
- Image uploads to S3
- Emoji reactions with IP-based rate limiting
- RSS feed at `/feed.xml` — standard XML format, auto-updated on publish
- Private analytics dashboard (admin only) — post views, reaction counts, top posts
- Dark mode (system default + manual toggle, persisted in localStorage)

## Stack

| Layer    | Tech                                  |
| -------- | ------------------------------------- |
| Frontend | Next.js (Vercel), Tailwind, shadcn/ui |
| Backend  | Lambda Function URLs                  |
| Database | DynamoDB (single table)               |
| Auth     | Auth.js + GitHub OAuth (admin only)   |
| Images   | S3 + CloudFront                       |
| Markdown | MDX + `next-mdx-remote`               |

## MDX Component Library

Custom components available inside every post:

- `<Callout type="info|warning|danger">` — highlighted callout block
- `<CodeBlock language="...">` — syntax highlighted code with copy button (via Shiki)
- `<Image src caption alt>` — responsive image with caption
- `<Divider>` — styled section break

## Pages

```
/                    ← published post list
/[slug]              ← single post + reactions
/tag/[tag]           ← posts by tag
/search              ← client-side search
/feed.xml            ← RSS feed
/privacy             ← privacy policy (data storage explanation)
/admin               ← post dashboard — all posts (draft + published) with status indicators (protected)
/admin/new           ← create post
/admin/[slug]        ← edit post — 404 page if slug doesn't exist
/admin/analytics     ← private analytics (protected)
```

### Admin Dashboard (`/admin`)

- Lists all posts regardless of status
- Status indicators: `draft` (muted), `published` (accent color)
- Actions per post: Edit, Unpublish → Draft, Delete
- Unpublish moves a published post back to `draft` status — does not delete
- Delete permanently removes the post and its S3 images
- `/admin/[slug]` for a non-existent slug renders the standard tasteful 404 page

## DynamoDB Single Table

```
PK                        SK                   Attributes
POST#{slug}               META                 title, status, tags[], excerpt, createdAt, publishedAt, reactions, views
POST#{slug}               CONTENT              body (MDX string)
TAG#{tag}                 POST#{publishedAt}   slug, title
RATELIMIT#{ip}#{slug}     REACTION             reactionType (string), ttl (epoch seconds, 24h auto-delete)
ANALYTICS#DAILY           #{date}#{slug}       views (number), ttl (epoch seconds, 30-day auto-delete)
```

**Field details:**

- `status`: `"draft"` | `"published"` — no other values
- `reactions`: `{ "👍": number, "❤️": number, "🔥": number, "💡": number }` — all four keys always present, default 0
- `views`: plain number, atomically incremented via DynamoDB `ADD` expression
- `slug`: lowercase letters, numbers, hyphens only — no spaces or special characters (`[a-z0-9-]+`)
- `tags`: array of strings, lowercase, no spaces

**GSI:** `status-publishedAt-index` → powers homepage post list

## Lambda Endpoints

```
GET    /posts                     ← list published posts
GET    /posts/[slug]              ← single post (queues view increment via SQS)
GET    /tags/[tag]                ← posts by tag
GET    /search?q=                 ← title/slug/excerpt for all published posts
POST   /posts/[slug]/react        ← add/change reaction (1 per IP per post per 24h — 2nd request replaces reaction type, not rejected; returns 429 only if same type submitted again)
POST   /admin/posts               ← create post (auth)
PUT    /admin/posts/[slug]        ← edit post (auth)
DELETE /admin/posts/[slug]        ← delete post (auth)
POST   /admin/images              ← S3 presigned upload URL (auth)
GET    /admin/analytics           ← aggregated view + reaction data (auth)
       /analytics-worker          ← SQS-triggered Lambda, batches view increments into DynamoDB
```

## AWS Resources

- 1 DynamoDB table — `blog`, provisioned 10R/10W (never switch to on-demand)
- ~6 Lambda functions + 1 kill switch Lambda + 1 analytics worker Lambda
- S3 bucket — images, private, via CloudFront
- 8 CloudWatch alarms (see Hard Shutdown below)
- 1 SSM Parameter Store standard parameter — `/blog/killswitch` (free tier)
- 1 SNS topic — routes alarms to kill switch Lambda + email
- 1 SQS queue — buffers view increment events for analytics worker

## Hard Shutdown

All write operations are blocked automatically when any resource approaches its free tier limit. Reads remain available so the blog stays viewable.

### Kill Switch Mechanism

- SSM Parameter `/blog/killswitch` holds a JSON value: `{ "writes": false, "all": false }`
- Every Lambda caches the kill switch value in module-level memory with a 60-second TTL — SSM is only called once per minute per Lambda container, not on every invocation (prevents SSM API call costs at scale)
- Every write Lambda checks the cached kill switch at handler start — returns 503 if `writes` or `all` is true
- A dedicated `killSwitchLambda` is the SNS subscriber — it flips the relevant flag when an alarm fires
- To manually re-enable: update the SSM parameter via AWS console (takes effect within 60 seconds)

### CloudWatch Alarms → Auto-Shutdown Triggers

```
Alarm                              Threshold        Action
Lambda invocations > 800K/month    → SNS            → set killswitch.all = true (full shutdown)
Lambda duration > 320K GB-seconds  → SNS            → set killswitch.all = true
DynamoDB consumed WCU > 80% (8/10) → SNS            → set killswitch.writes = true
DynamoDB consumed RCU > 80% (8/10) → SNS + email    → email only (reads stay up)
S3 PUT requests > 1,600/month      → SNS            → set killswitch.writes = true (blocks image uploads)
CloudFront requests > 8M/month     → SNS + email    → email only (CDN managed by AWS)
SNS publishes > 800K/month         → SNS + email    → email only
SQS messages > 800K/month          → SNS + email    → email only
```

AWS Budget alert: $0.01 threshold → immediate email (set in AWS Billing console, separate from CloudWatch)

### What "shutdown" means per layer

- **Writes blocked** (`killswitch.writes = true`): POST/PUT/DELETE Lambda endpoints return 503. GET endpoints unaffected. Blog is read-only.
- **Full shutdown** (`killswitch.all = true`): all Lambda endpoints return 503. Frontend still loads from Vercel (static shell), posts cached by CloudFront still serve.

## Design System

### Palette

| Token        | Light     | Dark      |
| ------------ | --------- | --------- |
| Background   | `#f5f0eb` | `#1a1714` |
| Surface      | `#ede6dd` | `#232019` |
| Border       | `#d4c9bc` | `#3a342c` |
| Text primary | `#1a1714` | `#f0e8de` |
| Text muted   | `#6b5f54` | `#9e8f82` |
| Accent       | `#5b21b6` | `#7c3aed` |
| Accent hover | `#4c1d95` | `#6d28d9` |

### Typography

- **Body/UI:** Inter
- **Headings:** Fraunces (warm editorial serif)
- **Code:** JetBrains Mono

### Notes

- All colors defined as Tailwind config tokens — never hardcode hex values in components
- Dark mode via Tailwind `dark:` classes + next-themes, persisted in localStorage
- Shared with hub (same palette and fonts)

## CI/CD

- **GitHub Actions** runs on every push and PR: lint → typecheck → unit tests → build
- **Vercel** handles all deployments automatically:
  - `main` branch → production deployment
  - Any feature branch → unique preview URL (e.g. `blog-git-feature-foo.vercel.app`)
- PRs must pass GitHub Actions before merge

## Error Pages

All error pages follow the shared playful theme (see Global CLAUDE.md → Error Pages):

- `404` — shown for unknown slugs, unknown admin slugs, unknown tags
- `500` — shown for unexpected server errors
- `503` — shown when kill switch is active (friendly "we'll be back" message, not a technical error)
- All include a home link

## UI Standards

- **shadcn/ui** for all UI components — do not build primitives from scratch
- **Dark mode** — system preference default, manual toggle persisted in localStorage
- **Accessibility** — all interactive elements keyboard-navigable, ARIA labels on icons, color contrast AA compliant minimum
- **Error handling** — Next.js `error.tsx` boundary per route segment + toast notifications for async failures (shadcn Toast)
- **Loading states** — custom animated skeleton loader component used consistently across all data-fetching pages

## Linting & Pre-commit

- ESLint + Prettier enforced in CI
- Husky + lint-staged runs ESLint + Prettier + typecheck on staged files before every commit
- Commit blocked if any check fails

## Local Development

- `docker-compose` runs DynamoDB Local for offline development
- `.env.local` points backend at local DynamoDB by default
- Set `DYNAMO_ENDPOINT=remote` in `.env.local` to point at real AWS DynamoDB instead
- All env vars documented in `.env.example`

## Testing Standards

- **Unit tests** (Jest + React Testing Library) for everything:
  - All Lambda handlers (mocking DynamoDB, SSM, S3, SQS SDK calls)
  - All utility functions (`backend/lib/`)
  - All React components (render, interaction, edge cases)
  - Kill switch logic — test both blocked and unblocked states
  - Analytics batching logic
  - Target 100% coverage on Lambda handlers and lib utilities
- **Playwright e2e tests** for all user-facing flows:
  - Written with Gherkin-syntax comments (`# Given`, `# When`, `# Then`) above each step
  - Cover: reading a post, reacting to a post (and changing reaction type), rate limit rejection, browsing by tag, searching, RSS feed valid XML, admin login, creating/editing/publishing a post, unpublishing to draft, deleting a post, image upload (valid + invalid format + oversized), analytics page, kill switch 503 page, dark mode toggle, 404 page for unknown slug
- Tests live in `__tests__/` (unit) and `e2e/` (Playwright) at repo root

## Error Monitoring

- Sentry (free tier) integrated on both frontend and Lambda backend
- Captures runtime errors with full stack traces
- Frontend: `@sentry/nextjs` — initialized in `sentry.client.config.ts` and `sentry.server.config.ts`
- Backend: `@sentry/serverless` on each Lambda handler
- Sentry only active in production — check `process.env.NODE_ENV === 'production'` before init; preview branches do not report to Sentry
- DSN sourced from `SENTRY_DSN` env var — only set this in Vercel production environment settings, not preview
- Never send PII or secrets to Sentry — scrub before capture
- Filter out 4xx client errors (404, 429) — only report 5xx server errors

## Documentation Standards

- **JSDoc on everything**: all functions, types, constants, and Lambda handlers must have JSDoc blocks
  - `@param` and `@returns` for every function
  - `@throws` where a function can throw
  - `@example` for any non-obvious usage (especially DynamoDB helpers, auth utilities)
- **Inline comments** explain the _why_, not the _what_ — DynamoDB access patterns, rate limit logic, kill switch checks, SQS batching, and any AWS SDK quirks must be commented
- Types in `types.ts` get JSDoc descriptions on every field
- No comment-free Lambda handler — every handler gets a top-level JSDoc describing its endpoint, auth requirements, and side effects

## S3 Image Storage

- Bucket name: `owenw-blog-images` (private, not public)
- File path structure: `/posts/{slug}/{filename}` — scoped per post
- Allowed formats: JPEG, PNG, WebP, GIF — max 5MB per upload
- Validation happens in the Lambda before issuing presigned URL (reject wrong MIME type or size > 5MB with 400)
- Client also validates before upload for fast feedback — server validation is the source of truth
- S3 bucket CORS policy must allow PUT from Vercel domain (set on bucket, not Lambda)
- Images are deleted from S3 when their parent post is deleted
- CloudFront invalidation triggered on upload success — single path invalidation (`/posts/{slug}/*`)
- Presigned URL expires after 5 minutes

## SQS Analytics Queue

- Queue type: Standard (not FIFO — ordering not required for view counts)
- Visibility timeout: 30 seconds
- Max receive count: 3 (dead-letter queue after 3 failed attempts)
- Batch size: 10 — analytics worker processes up to 10 view events per invocation
- Analytics worker increments `views` on `POST#{slug}#META` using DynamoDB `ADD` expression (atomic)
- Idempotency: not guaranteed — rare SQS duplicate delivery may double-count a view, acceptable for analytics
- View counting: every page load increments, no IP dedup, bots not filtered (keep it simple)
- Dead-letter queue messages are logged to CloudWatch as `warn` and discarded — no retry beyond 3 attempts

## Kill Switch Initialization

- SSM Parameter `/blog/killswitch` must be created manually before first deployment
- Default value: `{ "writes": false, "all": false }`
- If parameter is missing, Lambda logs a warning and defaults to allowing all operations (fail open on reads, fail closed on writes)
- Setup step documented in `README.md`

## Environment Variables

All variables documented in `.env.example`. Key variables:

```
ADMIN_EMAIL=                  # GitHub email whitelisted as admin
DYNAMO_TABLE_NAME=blog        # DynamoDB table name
DYNAMO_ENDPOINT=              # Leave blank for AWS, set to http://localhost:8000 for local
S3_BUCKET_NAME=owenw-blog-images
CLOUDFRONT_DOMAIN=            # CloudFront distribution domain for image URLs
SSM_KILLSWITCH_PATH=/blog/killswitch
NEXT_PUBLIC_API_URL=          # Lambda Function URL base
SENTRY_DSN=                   # Only set in production environment
AUTH_SECRET=                  # Auth.js secret
AUTH_GITHUB_ID=               # GitHub OAuth app client ID
AUTH_GITHUB_SECRET=           # GitHub OAuth app client secret
```

## Folder Structure

```
blog/
  src/
    app/                      ← Next.js App Router pages
    components/               ← React components
    lib/                      ← Frontend utilities
    types/                    ← Shared TypeScript types
  backend/
    functions/                ← Lambda handlers (one file per endpoint group)
    lib/
      db.ts                   ← DynamoDB client — only file that calls AWS DynamoDB SDK
      s3.ts                   ← S3 client
      ssm.ts                  ← SSM client (kill switch reads)
      sqs.ts                  ← SQS client (analytics queue)
      auth.ts                 ← Auth helpers (session validation)
  __tests__/                  ← Unit tests
  e2e/                        ← Playwright tests
  docker-compose.yml          ← DynamoDB Local
  .env.example
```

## Notes

- Auth via Auth.js + GitHub OAuth, admin email whitelisted via `ADMIN_EMAIL` env var
- DynamoDB TTL handles auto-expiry on RATELIMIT (24h) and ANALYTICS (30 days) records — no cleanup Lambda needed
- Search is client-side over a fetched index (title, slug, excerpt) — no search infrastructure
- RSS feed is RSS 2.0 format, regenerated via Next.js ISR on post publish
- Analytics view increments queued via SQS to avoid DynamoDB write spikes on popular posts
- Sentry reports to production environment only — never preview branches
- Kill switch check runs at handler start, before any business logic, on every write Lambda
