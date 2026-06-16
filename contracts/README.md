# PancakeFlow — P2: ArbExecutor Smart Contract

The only mandatory on-chain component (per the blueprint). Atomic, profit-or-revert
arbitrage with an on-chain risk backstop.

## Contracts
- `src/ArbExecutor.sol` — N-leg swap cycles (V2 + V3) with profit-or-revert;
  V2 flash-swap arbitrage (trade beyond inventory); on-chain guards: token
  allowlist, per-tx notional cap, pause switch, executor allowlist; secured
  swap callbacks (only the pool we just called may call back).
- `src/interfaces/*` — minimal PancakeSwap V2/V3 + ERC20 interfaces.
- `test/mocks/*` — invariant-correct constant-product V2 pair (with flash) + ERC20.

## Why these design choices
- **Atomicity = the real MEV/leg-risk defense.** A reverted arb loses only gas,
  never inventory. `minProfit` is enforced by measuring start-token balance
  before/after the whole cycle.
- **On-chain hard limits** back up the off-chain Risk Agent. Even a compromised
  executor key cannot exceed `maxNotional`, trade non-allowlisted tokens, or
  trade while paused. The Risk Agent's circuit breaker calls `pause()`.
- **Flash arb** borrows leg-0's token from an *independent* pool, runs the cycle,
  repays borrow + 0.25% fee, keeps the spread — capital efficiency without
  holding large inventory. (Never flash-borrow from a pool inside the cycle.)

## Run tests (canonical)
```bash
forge install foundry-rs/forge-std
forge test -vvv
forge test --match-contract FlashArbForkTest --fork-url $BSC_RPC_HTTP_1   # fork test
```

## Run tests (no-Foundry fallback)
If the Foundry binary is unavailable, an in-process EVM harness reproduces the
same assertions against the compiled bytecode — see `test/evm-harness/`.
**Verified: 9/9 passing** (profitable cycle +0.66 WBNB; flash arb +0.33 WBNB from
zero inventory; all six guards revert correctly).

## Deploy (BNB testnet)
```bash
DEPLOYER_PK=0x... EXECUTOR_ADDR=0x... MAX_NOTIONAL=10000000000000000000 \
  forge script script/Deploy.s.sol --rpc-url $BSC_TESTNET_RPC --broadcast
```
Then record the address in `packages/chain-config` for the execution service (P4).
