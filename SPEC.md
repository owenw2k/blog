# Blog Spec

## Features

- Posts with MDX (JSX-in-markdown, rich content)
- Draft / published toggle
- Tags — browse posts by tag
- Client-side full-text search (title, tags, excerpt)
- Image uploads to Vercel Blob
- Emoji reactions with IP-based rate limiting
- RSS feed at `/feed.xml` — standard XML format, auto-updated on publish
- Private analytics dashboard (admin only) — post views, reaction counts, top posts
- Dark mode (system default + manual toggle, persisted in localStorage)

## Stack

| Layer         | Tech                                    |
| ------------- | --------------------------------------- |
| Frontend      | Next.js (Vercel), Tailwind, shadcn/ui   |
| API           | Next.js Route Handlers (`src/app/api/`) |
| Database      | Vercel Postgres (Neon)                  |
| Rate limiting | Vercel KV (Upstash Redis)               |
| Images        | Vercel Blob                             |
| Kill switch   | Vercel Edge Config                      |
| Auth          | Auth.js + GitHub OAuth (admin only)     |
| Markdown      | MDX + `next-mdx-remote`                 |

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
- Delete permanently removes the post and its Blob images
- `/admin/[slug]` for a non-existent slug renders the standard tasteful 404 page

## Database Schema

### `posts`

```sql
CREATE TABLE posts (
  slug        VARCHAR PRIMARY KEY,
  title       VARCHAR NOT NULL,
  status      VARCHAR NOT NULL DEFAULT 'draft',   -- 'draft' | 'published'
  excerpt     TEXT,
  body        TEXT NOT NULL,                      -- MDX string
  tags        TEXT[] NOT NULL DEFAULT '{}',
  views       INTEGER NOT NULL DEFAULT 0,
  reactions   JSONB NOT NULL DEFAULT '{"👍":0,"❤️":0,"🔥":0,"💡":0}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX ON posts (status, published_at DESC);
CREATE INDEX ON posts USING GIN (tags);
```

### `analytics`

```sql
CREATE TABLE analytics (
  slug   VARCHAR NOT NULL REFERENCES posts(slug) ON DELETE CASCADE,
  date   DATE NOT NULL DEFAULT CURRENT_DATE,
  views  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (slug, date)
);
```

**Field details:**

- `status`: `"draft"` | `"published"` — no other values
- `reactions`: `{ "👍": number, "❤️": number, "🔥": number, "💡": number }` — all four keys always present, default 0
- `views`: incremented atomically via `UPDATE posts SET views = views + 1`
- `slug`: lowercase letters, numbers, hyphens only (`[a-z0-9-]+`)
- `tags`: array of lowercase strings, no spaces

Analytics rows older than 30 days are pruned by a nightly Vercel Cron Job.

### Rate limiting (Vercel KV)

Reactions are rate-limited in Redis, not Postgres. Key format: `reaction:{ip}:{slug}` → reactionType string, 24h TTL.

- Key absent: allow, store `reaction:{ip}:{slug} = reactionType EX 86400`
- Key present, same type: return 429
- Key present, different type: allow (replaces reaction), update stored type

## API Routes

```
GET    /api/posts                     ← list published posts
GET    /api/posts/[slug]              ← single post + increment views
GET    /api/tags/[tag]                ← posts by tag
GET    /api/search?q=                 ← title/slug/excerpt for all published posts
POST   /api/posts/[slug]/react        ← add/change reaction
POST   /api/admin/posts               ← create post (auth)
PUT    /api/admin/posts/[slug]        ← edit post (auth)
DELETE /api/admin/posts/[slug]        ← delete post + Blob images (auth)
POST   /api/admin/images              ← Vercel Blob upload URL (auth)
GET    /api/admin/analytics           ← aggregated view + reaction data (auth)
GET    /api/feed.xml                  ← RSS feed (or Next.js route handler)
```

All admin routes check the session before anything else. All write routes check the kill switch before anything else.

## Vercel Resources

- 1 Vercel Postgres database (Neon) — `blog`
- 1 Vercel KV store — rate limiting
- 1 Vercel Blob store — post images
- 1 Vercel Edge Config — kill switch flag
- Vercel Cron Job — nightly analytics cleanup (`0 3 * * *`)
- Vercel Spending Limit — set a dollar cap in the Vercel dashboard as a hard ceiling

## Kill Switch

All write operations can be blocked by flipping a single Edge Config flag. Reads always remain available so the blog stays viewable.

### How it works

- Vercel Edge Config holds `{ "writes": false }` — update via Vercel dashboard or CLI
- Every write route handler (`POST`, `PUT`, `DELETE`) reads this flag at the top of the handler, before any business logic
- If `writes` is `true`, return 503 immediately
- Edge Config reads are edge-cached — sub-millisecond, no cost concern

### When to flip it

- Manually, if Vercel usage approaches spending limit
- Vercel Spending Limit auto-stops deployments at the cap — that's the last-resort safety net

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
  - Any feature branch → unique preview URL
- PRs must pass GitHub Actions before merge

## Error Pages

All error pages follow the shared playful theme (see Global CLAUDE.md → Error Pages):

- `404` — shown for unknown slugs, unknown admin slugs, unknown tags
- `500` — shown for unexpected server errors
- `503` — shown when kill switch is active (friendly "we'll be back" message)
- All include a home link

## UI Standards

- **shadcn/ui** for all UI components — do not build primitives from scratch
- **Dark mode** — system preference default, manual toggle persisted in localStorage
- **Accessibility** — all interactive elements keyboard-navigable, ARIA labels on icons, color contrast AA compliant minimum
- **Error handling** — Next.js `error.tsx` boundary per route segment + toast notifications for async failures (shadcn Toast)
- **Loading states** — custom animated skeleton loader component used consistently across all data-fetching pages

## Image Storage (Vercel Blob)

- Images scoped per post: path prefix `/posts/{slug}/`
- Allowed formats: JPEG, PNG, WebP, GIF — max 5MB per upload
- Server-side validation before issuing upload URL (reject wrong MIME type or size > 5MB with 400)
- Client also validates before upload for fast feedback — server validation is source of truth
- Images deleted from Blob when their parent post is deleted
- Blob URLs are served via Vercel's CDN automatically — no CloudFront config needed
- Use `@vercel/blob` — `put()` for direct upload, `del()` for deletion

## Local Development

- Copy `.env.example` to `.env.local` and fill in values
- Vercel Postgres: create a Neon dev branch for local use (free), or run local Postgres via `docker-compose`
- Vercel KV: create an Upstash Redis dev database for local use (free)
- Vercel Blob and Edge Config work locally with the same tokens from the Vercel dashboard
- `pnpm dev` starts the Next.js dev server — no separate backend process

## Testing Standards

- **Unit tests** (Jest + React Testing Library):
  - All route handlers (mock `@vercel/postgres`, `@vercel/kv`, `@vercel/blob`, `@vercel/edge-config`)
  - All utility functions (`src/lib/`)
  - All React components (render, interaction, edge cases)
  - Kill switch logic — test both blocked and unblocked states
  - Rate limit logic — test allow, same-type reject, and type-replace paths
  - Coverage target: >90% on route handlers and lib utilities
- **Playwright e2e tests** for all user-facing flows:
  - Written with Gherkin-syntax comments (`# Given`, `# When`, `# Then`) above each step
  - Cover: reading a post, reacting (and changing reaction type), rate limit rejection, browsing by tag, searching, RSS valid XML, admin login, create/edit/publish/unpublish/delete a post, image upload (valid + invalid format + oversized), analytics page, kill switch 503 page, dark mode toggle, 404 for unknown slug
- Tests live in `__tests__/` (unit) and `e2e/` (Playwright) at repo root

## Error Monitoring

- Sentry (free tier) on frontend only — `@sentry/nextjs`
- Captures runtime errors with full stack traces
- Only active in production — check `NODE_ENV === 'production'` before init
- DSN from `SENTRY_DSN` env var — set in Vercel production environment only, not preview
- Never send PII or secrets to Sentry
- Filter out 4xx client errors — only report 5xx

## Documentation Standards

- JSDoc on every exported function, route handler, type, and constant — no exceptions
- `@param`, `@returns`, `@throws` where applicable; `@example` for non-obvious usage
- Inline comments explain the _why_: Postgres query patterns, rate limit logic, kill switch checks
- Every field on every exported type gets a JSDoc description

## Environment Variables

All variables documented in `.env.example`. Key variables:

```
# Auth.js
AUTH_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_CLIENT_SECRET=

# Vercel Storage (auto-injected when linked in Vercel dashboard)
POSTGRES_URL=
POSTGRES_URL_NON_POOLING=
KV_URL=
KV_REST_API_URL=
KV_REST_API_TOKEN=
KV_REST_API_READ_ONLY_TOKEN=
BLOB_READ_WRITE_TOKEN=
EDGE_CONFIG=

# App
ADMIN_EMAIL=
NEXT_PUBLIC_SITE_URL=
SENTRY_DSN=
```

## Folder Structure

```
blog/
  src/
    app/
      api/                      ← Route handlers
        posts/
          route.ts              ← GET /api/posts
          [slug]/
            route.ts            ← GET /api/posts/[slug]
            react/
              route.ts          ← POST /api/posts/[slug]/react
        tags/[tag]/
          route.ts              ← GET /api/tags/[tag]
        search/
          route.ts              ← GET /api/search
        admin/
          posts/
            route.ts            ← POST /api/admin/posts
            [slug]/
              route.ts          ← PUT, DELETE /api/admin/posts/[slug]
          images/
            route.ts            ← POST /api/admin/images
          analytics/
            route.ts            ← GET /api/admin/analytics
      (public)/                 ← Public-facing pages
        page.tsx                ← Post list
        [slug]/page.tsx         ← Single post
        tag/[tag]/page.tsx
        search/page.tsx
        privacy/page.tsx
      admin/                    ← Protected pages
        page.tsx
        new/page.tsx
        [slug]/page.tsx
        analytics/page.tsx
      feed.xml/
        route.ts                ← RSS feed
    components/
    lib/
      db.ts                     ← Vercel Postgres helpers (only file that calls sql)
      kv.ts                     ← Vercel KV helpers (rate limiting)
      blob.ts                   ← Vercel Blob helpers (image upload/delete)
      edge-config.ts            ← Edge Config helpers (kill switch)
      auth.ts                   ← Auth helpers (session validation)
    types/
  __tests__/
  e2e/
  .env.example
```

## Notes

- Auth via Auth.js + GitHub OAuth, admin email whitelisted via `ADMIN_EMAIL` env var
- Rate limit TTL handled by Redis `EX` on the KV key — no cleanup needed
- Analytics rows pruned by Vercel Cron — no Postgres TTL extension needed
- Search is client-side over a fetched index (title, slug, excerpt) — no search infrastructure
- RSS feed is RSS 2.0, regenerated via Next.js route handler on each request (or ISR)
- Sentry reports to production only — never preview branches
- Kill switch check runs at the top of every write route handler, before any business logic
