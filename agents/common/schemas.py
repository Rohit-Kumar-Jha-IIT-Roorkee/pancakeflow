"""Pydantic mirrors of packages/shared-types (the frozen spine).
Field names/types intentionally identical to the zod definitions."""
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field
import time, uuid

ChainId   = Literal["bsc", "bsc-testnet", "ethereum", "arbitrum"]
Strategy  = Literal["cross_pool_arb", "triangular_arb", "trend_follow"]
TradeKind = Literal["cycle", "directional"]
Regime    = Literal["trending_up", "trending_down", "mean_reverting", "high_vol", "unknown"]

class ProposalLeg(BaseModel):
    pool: str
    tokenIn: str
    tokenOut: str
    symbolIn: str
    symbolOut: str
    poolType: int  # 2 | 3

class TradeProposal(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    ts: int = Field(default_factory=lambda: int(time.time() * 1000))
    chain: ChainId = "bsc"
    strategy: Strategy
    kind: TradeKind
    legs: list[ProposalLeg]
    pair: Optional[str] = None
    side: Optional[Literal["long", "short"]] = None
    amountInWei: str
    expProfitWei: str
    expProfitBps: float
    gasEstWei: str
    confidence: float
    riskScore: float
    slippageBps: int
    ttlSec: int = 30
    rationale: str = ""

class SizedTrade(BaseModel):
    proposal: TradeProposal
    sizedAmountWei: str
    profile: str

class SimResult(BaseModel):
    tradeId: str
    passed: bool
    requotedProfitWei: str
    requotedProfitBps: float
    reason: str = ""

class Fill(BaseModel):
    tradeId: str
    status: Literal["executed", "failed"]
    mode: Literal["paper", "testnet", "live"]
    txHash: Optional[str] = None
    amountInWei: str = "0"
    amountOutWei: str = "0"
    gasWei: str = "0"
    failReason: str = ""

class BreakerState(BaseModel):
    state: Literal["ARMED", "TRIPPED", "COOLDOWN"] = "ARMED"
    reason: str = ""
    trippedAt: int = 0
