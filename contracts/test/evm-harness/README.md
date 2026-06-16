# In-process EVM verification harness

`forge test` is the canonical runner (CI uses it). This harness is a fallback that
compiles `ArbExecutor` + mocks with the npm `solc` package and executes the compiled
bytecode in an `@ethereumjs/vm` instance — useful in environments where the Foundry
binary can't be installed.

```bash
npm i solc@0.8.24 @ethereumjs/vm@8.1.1 @ethereumjs/common@4.4.0 @ethereumjs/tx@5.4.0 @ethereumjs/util@9.1.0 ethers@6
node build_artifacts.js   # compile -> artifacts.json
node run_evm.mjs          # deploy + run 9 assertions
```

Verified result (matches the forge suite assertions):
```
PASS profitable cycle executes        profit 0.6607 WBNB on 5 WBNB
PASS balance increased (profit booked)
PASS reverts when minProfit unreachable
PASS reverts on losing direction
PASS reverts above maxNotional
PASS reverts on disallowed token
PASS reverts when paused
PASS flash arb runs with zero starting inventory
PASS flash arb retains profit         profit 0.3316 WBNB, borrowed 3 WBNB, zero inventory
RESULT: 9 passed, 0 failed
```
