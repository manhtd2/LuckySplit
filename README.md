# LuckySplit

Surprise USDC airdrop events on Arc, with on-chain commit-reveal randomness —
winner selection and amount splitting run fully on-chain, so anyone can
independently verify a result from public data.

## Live

- **App**: https://luckysplit.vercel.app
- **API**: https://luckysplit-backend-production-ddc0.up.railway.app
- **Contract**: [`0xF7A2237C6A821Cb11d3518d9AE0B2D43C5566aCC`](https://testnet.arcscan.app/address/0xf7a2237c6a821cb11d3518d9ae0b2d43c5566acc) (Arc Testnet, verified)

To try it: connect any EVM browser wallet (e.g. MetaMask) on the site to sign
in — no account or crypto experience needed beyond that. LuckySplit creates a
separate Circle-custodied wallet on first sign-in to hold event funds; fund it
with Arc Testnet USDC from the [Circle faucet](https://faucet.circle.com/) to
create and run a real event end to end.

## Structure

| Path | What |
|---|---|
| [`contracts/`](./contracts) | Foundry project — `LuckySplit.sol`, deployed + verified on Arc Testnet, live-tested end-to-end including the real USDC blocklist. |
| [`backend/`](./backend) | Node/Express/Prisma API — Circle Developer-Controlled Wallets custody, a watcher service that automates reveal/distribute, REST API for organizers and the public. |
| [`frontend/`](./frontend) | Next.js dashboard + public pages, dark neon theme (purple→magenta gradients, glassmorphic cards). |

Each subfolder has its own README with setup steps and deployed addresses.

## Status

All three layers verified end-to-end live on Arc Testnet in one run: create
organizer → create event → fund → commit → **watcher auto-reveals and
auto-distributes with no further manual steps** → event `COMPLETED`, frontend
renders the real result. See `backend/README.md`'s Status section for the
exact run and the two bugs found/fixed along the way.
