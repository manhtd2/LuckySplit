# LuckySplit smart contract

This README maps contract code to the product spec and records live Arc
Testnet verification (rebuilt from scratch, not reusing any prior contract
project).

## Setup

`lib/` (forge-std, OpenZeppelin) is gitignored -- installed flat via
`--no-git`, not submodules, so re-fetch after cloning:

```bash
forge install foundry-rs/forge-std --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
forge test
```

## Deployed (Arc Testnet, chain id 5042002)

| | |
|---|---|
| **LuckySplit** | [`0xF7A2237C6A821Cb11d3518d9AE0B2D43C5566aCC`](https://testnet.arcscan.app/address/0xf7a2237c6a821cb11d3518d9ae0b2d43c5566acc) — verified on Blockscout |
| **USDC** | `0x3600000000000000000000000000000000000000` |
| **Owner / operator (demo)** | `0x3026f60aF3120bE269e5853A9aFd68e7D202fEB6` |
| Deploy tx | `0x808b83f241e3bbeebf306b5ef38aabaa93ae27654e4cea64a1649055338cfed1` |

Demo key only — do not fund with real value. Rotate `platformOperator` via
`setPlatformOperator` before any production use.

## Doc section → code mapping

| Doc section | Contract piece |
|---|---|
| 3. State machine | `EventState` enum + `inState` modifier. No separate on-chain "Revealing" state: since a tx is atomic, the doc's "chờ đến block mục tiêu" wait happens off-chain (caller can't call `reveal()` before `targetBlock`); `Committed` transitions straight to `Distributing` inside one `reveal()` call. |
| 4. Event config, 2 modes | `createEvent` (wallet validation, `MIN_WINNERS=2`, `MAX_WALLETS=200`), `RewardMode` enum, `fundEvent` (Mode 2 exact-match check, Mode 1 cap-feasibility check) |
| 5. Commit-reveal randomness | `commit` / `reveal`. `reveal` reads `blockhash(targetBlock)` directly within 256 blocks, else falls back to the EIP-2935 history predeploy `0x0000F90827F1C53a10cb7A02335B175320002935` (confirmed in doc section 13.3 to behave as on Ethereum). |
| 6. Edge cases | Blocklisted winner → isolated `try/catch` per transfer in `distribute` (`paid=false, blocked=true`, amount added to `organizerRefundable`, **not hidden** — matches doc wording exactly). K=1 infeasibility → `BelowMinWinners` revert. Mode 2 mismatch → `FundedAmountMismatch` revert at `fundEvent`. Mid-distribution failure → resumable via `nextDistributeIndex`, `distribute` re-callable, already-`paid` winners skipped. Organizer cancel → `cancelEvent`, only in `Funded`. Dust → flushed to organizer in `_flushOrganizerRefund` when the last batch completes. |
| 7. Security & custody | Immutable (no proxy). Scoped `pause()` — `whenNotPaused` on every state-changing function, but pausing can never alter a stored result or reverse a payment already made. Per-event isolated commit/secret (`mapping(uint256 => EventData)`), one event's failure can't touch another's. |
| 8. Transparency | `WalletListPublished` emitted at `fundEvent` (full list public before randomness). `WinnerSelected`/`WinnerPaid`/`WinnerBlocked`/`Revealed` events give block-by-block, tx-by-tx public traceability on `testnet.arcscan.app`. |

**Design decision beyond the doc's original open question:** winner selection AND
amount splitting run **fully on-chain** in `reveal()` (Fisher-Yates + a bounded
random composition algorithm for the 60% cap), not computed off-chain by the
backend and submitted. Anyone can independently recompute the exact result from
the public wallet list + revealed seed — no need to trust the backend's math,
matching the doc's "process-trust... but publicly verifiable" framing (section 5).

## Live Arc Testnet verification (not just `forge test`)

Foundry's local EVM (`anvil`, incl. `--fork-url`) cannot reproduce Arc's blocklist
precompile — confirmed directly in this session and consistent with Arc's own
docs warning. So beyond the Mock-based unit suite (`forge test`, 28 tests,
`test/LuckySplit.t.sol`), the full lifecycle was run for real on Arc Testnet
using the official seeded blocklist address
(`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, mnemonic-index 1 of the standard
test mnemonic) as one of 3 wallets, K=3 (all three win):

- `createEvent` → `fundEvent` → `commit` → (wait for target block) → `reveal` → `distribute`
- Result on-chain: the two normal wallets got `paid=true, blocked=false`; the
  blocklisted wallet got `paid=false, blocked=true`; event still reached
  `Completed`; `organizerRefundable` correctly flushed back to `0`.
- Tx: `0x759c8eb0c6156d5867b7afd4cd4e418878ac556d459ebb252cb3b6c62e5e7473` (distribute)

An earlier attempt (event id 0) has a permanently unrevealable commit due to a
hand-typed secret being 2 hex chars short — harmless (0.03 testnet USDC stuck,
no contract bug), left as-is; event id 1 is the clean verified run.

## Gas sanity check at max documented scale (200 wallets)

`forge test --match-test test_maxScale --gas-report`: worst single tx is
`createEvent` at ~4.74M gas (storing 200 addresses), `reveal` ~3.08M gas
(Fisher-Yates + split over 200/50), `distribute` ~2.89M gas for a 50-winner
batch — all comfortably under typical L1 block gas limits.

## Commands

```bash
forge test                          # unit suite (MockUSDC)
forge test --gas-report             # gas breakdown

# deploy (see .env.example)
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc.testnet.arc.network --broadcast

# verify
forge verify-contract <address> src/LuckySplit.sol:LuckySplit \
  --chain-id 5042002 --verifier blockscout \
  --verifier-url https://testnet.arcscan.app/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address)" <usdc> <operator>)
```

## Known open item

`retryOrganizerRefund` exists for the case where the organizer's own address
fails the final dust transfer, but there is no equivalent manual rescue if a
*winner's* address is blocked at distribute-time and later un-blocked — the
`organizerRefundable` credit already covers that amount going back to the
organizer, which is the documented behavior (doc section 6), so no further
action is needed there by design.
