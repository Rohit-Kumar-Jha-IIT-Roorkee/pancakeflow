import {
  createWalletClient, createPublicClient, http, encodeFunctionData, decodeEventLog,
  type PublicClient, type WalletClient, type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet, bsc } from "viem/chains";
import { arbExecutorAbi } from "../arbExecutorAbi.js";
import { NonceManager } from "../nonceManager.js";
import type { SizedTrade, Fill } from "../types.js";
import { cfg } from "../config.js";
import { logger } from "../logger.js";

/** Real on-chain executor (testnet/live). Pipeline:
 *  build calldata -> eth_call simulate -> MEV-protected submit -> watch -> retry.
 *  The signer key lives only in this process (env/KMS). */
export class OnchainExecutor {
  private account: Account;
  private pub: PublicClient;
  private wallet: WalletClient;
  private nonces: NonceManager;
  private executor: `0x${string}`;

  constructor() {
    if (!cfg.EXECUTOR_PK || !cfg.ARB_EXECUTOR_ADDR)
      throw new Error("EXECUTOR_PK and ARB_EXECUTOR_ADDR required for on-chain mode");
    if (cfg.EXEC_MODE === "live" && cfg.MAINNET_OVERRIDE !== "I_KNOW_WHAT_I_AM_DOING") {
      throw new Error("MAINNET GATED: EXEC_MODE=live requires MAINNET_OVERRIDE='I_KNOW_WHAT_I_AM_DOING'");
    }
    const chain = cfg.EXEC_MODE === "live" ? bsc : bscTestnet;
    const rpc = cfg.EXEC_MODE === "live" ? cfg.BSC_RPC_HTTP_1 : cfg.BSC_TESTNET_RPC;
    this.account = privateKeyToAccount(cfg.EXECUTOR_PK as `0x${string}`);
    this.pub = createPublicClient({ chain, transport: http(rpc) });
    // MEV-protected submit path when configured; else public RPC
    const submitRpc = cfg.PRIVATE_RPC ?? rpc;
    this.wallet = createWalletClient({ account: this.account, chain, transport: http(submitRpc) });
    this.nonces = new NonceManager(this.pub, this.account.address);
    this.executor = cfg.ARB_EXECUTOR_ADDR as `0x${string}`;
  }

  private buildCalldata(sized: SizedTrade): `0x${string}` {
    const legs = sized.proposal.legs.map((l) => ({
      pool: l.pool as `0x${string}`, tokenIn: l.tokenIn as `0x${string}`,
      tokenOut: l.tokenOut as `0x${string}`, poolType: l.poolType,
    }));
    // minProfit = 1 wei: contract enforces >start; richer threshold gated upstream by Risk/Sim
    return encodeFunctionData({
      abi: arbExecutorAbi, functionName: "executeCycle",
      args: [legs, BigInt(sized.sizedAmountWei), 1n],
    });
  }

  async execute(sized: SizedTrade): Promise<Fill> {
    const p = sized.proposal;
    const base: Fill = { tradeId: p.id, status: "failed", mode: cfg.EXEC_MODE as "testnet" | "live",
      amountInWei: sized.sizedAmountWei, amountOutWei: "0", gasWei: "0" };
    if (p.kind !== "cycle") return { ...base, failReason: "on-chain path is cycle-only (P4)" };

    const data = this.buildCalldata(sized);
    // 1. simulate (eth_call) — catches a revert before we spend gas
    try {
      await this.pub.call({ account: this.account, to: this.executor, data });
    } catch (e) {
      return { ...base, failReason: `simulate revert: ${String(e).slice(0, 80)}` };
    }
    // 2. gas + submit, with retry
    for (let attempt = 0; attempt <= cfg.MAX_RETRIES; attempt++) {
      try {
        const nonce = await this.nonces.take();
        const gas = await this.pub.estimateGas({ account: this.account, to: this.executor, data });
        const gasPrice = await this.pub.getGasPrice();
        const bumped = gasPrice + (gasPrice * BigInt(attempt * 15)) / 100n; // +15%/retry (RBF-ish)
        const hash = await this.wallet.sendTransaction({
          account: this.account, chain: this.wallet.chain,
          to: this.executor, data, nonce, gas, gasPrice: bumped,
        });
        const rcpt = await this.pub.waitForTransactionReceipt({ hash, timeout: 30_000 });
        if (rcpt.status === "success") {
          let actualOut = (BigInt(sized.sizedAmountWei) + BigInt(p.expProfitWei)).toString();
          for (const log of rcpt.logs) {
            try {
              const decoded = decodeEventLog({ abi: arbExecutorAbi, data: log.data, topics: log.topics });
              if (decoded.eventName === "CycleExecuted") {
                actualOut = (decoded.args as any).amountOut.toString();
              }
            } catch (e) { /* ignore unrelated logs */ }
          }
          return { ...base, status: "executed", txHash: hash,
            gasWei: (rcpt.gasUsed * bumped).toString(),
            amountOutWei: actualOut };
        }
        logger.warn({ hash, attempt }, "tx reverted on-chain, retrying");
      } catch (e) {
        logger.warn({ attempt, e: String(e) }, "submit failed");
        this.nonces.reset();
      }
    }
    return { ...base, failReason: "exhausted retries" };
  }

  async pause(): Promise<void> {
    const data = encodeFunctionData({ abi: arbExecutorAbi, functionName: "pause", args: [] });
    const nonce = await this.nonces.take();
    await this.wallet.sendTransaction({ account: this.account, chain: this.wallet.chain,
      to: this.executor, data, nonce });
  }
}
