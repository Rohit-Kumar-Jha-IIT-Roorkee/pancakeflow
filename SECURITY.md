# Security

This document outlines the security invariants and key handling architecture of PancakeFlow.

## 1. Key Isolation
The blockchain signing key (`PRIVATE_KEY`) is deliberately isolated. It is **only** loaded and used within the `@pancakeflow/execution` TypeScript service. 
- The Python agent swarm (Brain) never has access to the private key.
- The Dashboard UI never has access to the private key.
- The agents only emit `trade.approved` events containing the optimal transaction calldata or intent. The execution service reads this event, simulates it locally with the signing key, signs it, and broadcasts it.

## 2. Mainnet Guardrails
To prevent accidental loss of funds during development, PancakeFlow has a strict `MAINNET_OVERRIDE` guard.
- Setting `EXEC_MODE=live` is not enough to execute trades on mainnet.
- You must also explicitly set `MAINNET_OVERRIDE=true` in the environment of the execution service. Without this flag, the system will refuse to broadcast any live transaction, throwing a fatal startup error.

## 3. Production Deployment Enhancements
For a true production deployment handling significant capital, the following upgrades are required:
- **KMS Integration**: The private key should not be stored in a `.env` file. It should be loaded dynamically from a Key Management Service (AWS KMS, GCP Secret Manager) or HashiCorp Vault.
- **Smart Contract Audit**: If deploying custom aggregator contracts or advanced proxy contracts, they must undergo a rigorous third-party security audit.
- **Private RPC / MEV Protection**: To prevent sandwich attacks, the execution service must route transactions through a private mempool (e.g., Flashbots RPC, bloXroute) rather than the public mempool.
