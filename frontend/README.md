# LuckySplit frontend

Next.js 16 (App Router, Turbopack) + Tailwind v4. Talks to `../backend`'s REST API —
no server actions / Next.js API routes, all data comes from `NEXT_PUBLIC_API_URL`.
UI copy is English-only (international project).

## Setup

```bash
npm install
cp .env.local.example .env.local   # point NEXT_PUBLIC_API_URL at the backend
npm run dev
```

Renders fine even with the backend unreachable (every fetch has a `.catch`
fallback) — useful for reviewing the UI before the backend has real
Postgres/Circle credentials wired up.

## Deployment (Vercel)

```bash
vercel link                                          # links this directory to a Vercel project
vercel env add NEXT_PUBLIC_API_URL production         # point at the deployed backend
vercel --prod
```

If the linked project predates this rebuild, its framework preset/output
directory may be stale (e.g. set to a non-Next.js value) and the build will
fail with "No Output Directory named X found" even though `next build`
succeeded locally -- fix with
`vercel project update <name> --framework nextjs --auto-detect output-directory`.

Live: https://luckysplit.vercel.app

## Design

Dark neon theme (dark background, purple→magenta
gradient accents, glassmorphic cards) — see `src/app/globals.css` for the
color tokens (`--violet`, `--magenta`, `--pink`, `--blue`, `--green`, `--red`,
`--gradient-primary`, plus `.neon-outline-btn` and the animated 7-color
`.neon-rainbow-frame` used on money-moving actions). Logo asset:
`public/logo.png` (`../logo.png`).

## Structure

- `src/lib/api.ts` — typed fetch client for every backend endpoint.
- `src/lib/auth.tsx` + `src/lib/walletBrowser.ts` — sign-in with the
  organizer's own browser wallet (MetaMask etc): connect → sign a one-time
  nonce (`personal_sign`, no gas) → backend issues a bearer session token,
  stored in `localStorage`. LuckySplit creates a **separate** Circle-custodied
  wallet on first sign-in to actually hold event funds — the login wallet
  never touches that money (doc section 7).
- `src/app/page.tsx` — public homepage: hero, feature cards, KOL leaderboard
  (ranked by USDC actually paid to winners, not gross deposit), recent events.
- `src/app/events/[id]`, `src/app/organizers/[id]` — public pages, no auth.
  Event detail hides per-wallet `amount` until the event reaches `COMPLETED`
  (doc section 8); polls every 3s while `COMMITTED`/`DISTRIBUTING` for the
  real-time "processing" effect.
- `src/app/dashboard/*` — organizer-only, gated by `useAuth()` (shows
  `OnboardingGate`'s wallet-connect flow if not signed in).
  `dashboard/create` collects the wallet list, mode, and prize pool amount in
  one step (the pool amount input gets the `.neon-rainbow-frame` treatment)
  and chains `createEvent` → `fundEvent` in one submit.
  `dashboard/events/[id]` reuses the same `EventDetailClient` as the public
  page plus an `actions` slot for fund/start/cancel, including the required
  "this cannot be undone" confirmation step before committing.

## Status

Builds and type-checks clean (`npm run build`), deployed and verified live
against the deployed backend (real data renders on the live homepage/
dashboard). See `../backend/README.md`'s Status section for the full
end-to-end verification run and bugs found along the way.
