# LuckySplit backend

Node + TypeScript + Express + Prisma (PostgreSQL) + viem, driving
`../contracts/src/LuckySplit.sol` on Arc Testnet.

## Setup

```bash
npm install
cp .env.example .env   # fill in real values, see below
npx prisma migrate dev --name init   # needs DATABASE_URL reachable
npm run dev
```

### Getting the required credentials

Fields already filled in `.env.example` (`ARC_RPC_*`, `LUCKYSPLIT_CONTRACT_ADDRESS`,
`USDC_ADDRESS`) need no action. What's left, in order:

1. **`DATABASE_URL`** — free Postgres on [Neon](https://neon.tech) (no credit
   card): sign up → create a project → copy the connection string it shows
   you (`postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`).
   [Railway](https://railway.app) works the same way if you prefer it.
2. **`OPERATOR_PRIVATE_KEY`** — the exact same value as `PRIVATE_KEY` in
   `contracts/.env` (that wallet is already set as the contract's
   `platformOperator`). Copy it directly between the two files yourself —
   don't paste private keys into chat.
3. **`CIRCLE_API_KEY`** — [Circle Developer Console](https://console.circle.com/)
   → sign up/log in → Developer Account → API Keys → create one (testnet
   keys start with `TEST_API_KEY:`). Paste the full string in.
4. **`CIRCLE_ENTITY_SECRET`** + **`CIRCLE_WALLET_SET_ID`** — run these three
   scripts yourself, in order (Circle's own security rules say this step must
   never be done on your behalf):
   ```bash
   node scripts/1-generate-entity-secret.mjs
   # copy the printed ENTITY SECRET into .env as CIRCLE_ENTITY_SECRET, then:
   node --env-file=.env scripts/2-register-entity-secret.mjs
   # downloads a recovery file to ~/.circle/ -- back it up somewhere safe, never commit it
   node --env-file=.env scripts/3-create-wallet-set.mjs
   # copy the printed id into .env as CIRCLE_WALLET_SET_ID
   ```
   Step 2 needs `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` already in `.env`;
   step 3 needs step 2 done first.

## Architecture

- `src/chain/` — viem client for Arc Testnet (`fallback()` transport across
  3 RPCs, chain object defined manually rather than trusting an unverified
  `viem/chains` export), typed contract read/write wrappers.
- `src/circle/wallets.ts` — Circle Developer-Controlled Wallets: one EOA
  wallet per organizer, `executeAsOrganizer` for contract calls that need
  organizer intent (create/fund/cancel), polls Circle's transaction state to
  a terminal result.
- `src/services/auth.ts` — no OAuth/KYC (doc section 2): a random bearer
  token is generated once per organizer, only its hash is stored.
- `src/services/watcher.ts` — background loop, the automated half of the
  flow (doc section 5): waits for the committed target block, calls
  `reveal()`, then drives `distribute()` in batches until the contract
  reports `COMPLETED`. Safe to restart — every step re-derives from on-chain
  state, nothing is only-in-memory.
- `src/routes/events.ts` — organizer-facing: create (validates + sorts wallet
  list, calls `createEvent` via Circle), fund (approve + `fundEvent`), start
  (generates the reveal secret server-side, operator calls `commit`), cancel.
- `src/routes/public.ts` — no auth: event list/detail (amounts hidden until
  `COMPLETED`, matching doc section 8), organizer public profile.

## Deployment (Railway)

Deployed as a persistent Node service (not serverless -- the watcher needs a
long-running process, which rules out most serverless platforms):

```bash
railway init --name luckysplit-backend
railway add --service luckysplit-backend   # empty service, source added by `up`
# set every var from .env.example as a Railway variable, then:
railway up --service luckysplit-backend
railway domain --service luckysplit-backend
```

`package.json` has separate `dev` (uses `.env` via `tsx --env-file`) and
`start`/`build` scripts for this: `start` runs `prisma migrate deploy` before
booting (so a fresh deploy always has an up-to-date schema) and uses
`--env-file-if-exists` so it works both locally (`.env` present) and on
Railway (vars injected directly into `process.env`, no `.env` file at all).
`build` also copies `src/chain/LuckySplit.abi.json` into `dist/chain/` since
`tsc` only compiles `.ts` files and silently drops it otherwise -- caught this
because the deployed process crashed on boot with `ENOENT` reading that path.

Live: https://luckysplit-backend-production-ddc0.up.railway.app

## Status

Verified end-to-end live (real Neon Postgres, real Circle wallet, real Arc
Testnet contract) with zero manual chain calls after `POST /start` — the
watcher alone drove reveal + distribute to `COMPLETED`. Event: contractEventId
`2`, organizer wallet `0xdd56694c01423157e069e5e3cd986a170da14d6e` (Circle
EOA), full tx trail (`CREATE`/`FUND`/`COMMIT`/`REVEAL`/`DISTRIBUTE_BATCH`) all
`CONFIRMED` on `testnet.arcscan.app`.

Real bugs found and fixed along the way:
- **Commit delay margin too tight.** `commit()`'s target block was computed as
  `currentBlock + 25` (midpoint of the contract's `[20,30]` window), but gas
  estimation + nonce lookup + broadcast eat several sequential RPC round
  trips, and at Arc's ~2.3 blocks/sec that latency alone can exceed the
  window's slack. Fixed by biasing to `currentBlock + 28` in
  `routes/events.ts` (latency only ever pushes the actual inclusion block
  *up* relative to the read, never down, so bias up not to the midpoint).
- **BigInt fields broke `res.json()`.** `Event.targetBlock` and
  `OnchainTx.blockNumber` are Prisma `BigInt` columns; `JSON.stringify` throws
  on `BigInt` with no coercion. `GET /api/events/:id` was spreading the raw
  Prisma row (`{ ...event }`) — fixed by shaping the response explicitly with
  `.toString()` on every BigInt field, same pattern `routes/public.ts` already
  used correctly.
- **A broadcast tx isn't a confirmed tx.** `POST /start` called `write.commit`
  and immediately marked the event `COMMITTED` in the DB without waiting for
  or checking the receipt -- `viem`'s `write` action resolves once a tx is
  *broadcast*, not once it's mined. A live user hit exactly this: the commit
  reverted on-chain (window slipped again despite the +28 bias) but the DB
  still said `COMMITTED`, so the watcher retried `reveal()` forever against a
  contract still sitting in `FUNDED` with an empty `commitHash`. Fixed by
  waiting for the receipt and checking `status === "success"` before trusting
  the DB update, in both `routes/events.ts` (commit) and `services/watcher.ts`
  (reveal/distribute, which already waited for the receipt but didn't check
  its status before advancing state).

`OPERATOR_PRIVATE_KEY` also needs its `0x` prefix (same gotcha as
`contracts/.env` — `privateKeyToAccount`/`vm.envUint` both reject a bare hex
string without it).
