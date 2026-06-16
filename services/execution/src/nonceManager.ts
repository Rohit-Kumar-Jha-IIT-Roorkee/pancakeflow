import type { PublicClient } from "viem";
/** Serializes nonces for the single signer; survives stuck txs by tracking the
 *  next nonce locally and reconciling with chain pending count. */
export class NonceManager {
  private next: number | null = null;
  constructor(private client: PublicClient, private address: `0x${string}`) {}
  async take(): Promise<number> {
    const pending = await this.client.getTransactionCount({ address: this.address, blockTag: "pending" });
    this.next = this.next === null ? pending : Math.max(this.next, pending);
    return this.next++;
  }
  reset(): void { this.next = null; }
}
