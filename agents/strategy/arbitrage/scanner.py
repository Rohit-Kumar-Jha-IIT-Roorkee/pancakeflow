"""Cross-pool & triangular arbitrage finder over the live pool graph.

Graph: nodes = tokens, directed edge token_in->token_out per pool with weight
= -log(effective_rate). A negative-weight cycle = an arbitrage loop (product of
rates > 1). Bellman-Ford detects one; we then size it with closed-form/golden
section math and net out gas. Deterministic; the LLM never runs here."""
from __future__ import annotations
import math
from dataclasses import dataclass
from .cycle_math import v2_amount_out, evaluate_cycle, optimal_two_hop_input

@dataclass
class Edge:
    token_in: str; token_out: str
    pool: str; pool_type: int
    reserve_in: int; reserve_out: int
    sym_in: str; sym_out: str

def _rate(e: Edge) -> float:
    """Marginal (small-trade) rate out/in including fee, for graph weighting."""
    if e.reserve_in <= 0 or e.reserve_out <= 0:
        return 0.0
    probe = max(1, e.reserve_in // 10000)            # 0.01% probe trade
    out = v2_amount_out(probe, e.reserve_in, e.reserve_out)
    return out / probe if probe else 0.0

def build_edges(pools: list[dict]) -> list[Edge]:
    """Each V2 pool yields two directed edges. (V3 handled via quoter in P4;
    here we use V2 reserves which dominate Pancake liquidity.)"""
    edges: list[Edge] = []
    for p in pools:
        if int(p.get("poolType", 2)) != 2:
            continue
        try:
            r0 = int(p["reserve0"]); r1 = int(p["reserve1"])
        except (KeyError, ValueError):
            continue
        if r0 <= 0 or r1 <= 0:
            continue
        t0, t1 = p["token0"], p["token1"]
        s0, s1 = p.get("symbol0", t0[:6]), p.get("symbol1", t1[:6])
        edges.append(Edge(t0, t1, p["address"], 2, r0, r1, s0, s1))
        edges.append(Edge(t1, t0, p["address"], 2, r1, r0, s1, s0))
    return edges

@dataclass
class ArbCycle:
    tokens: list[str]          # [start, ..., start]
    edges: list[Edge]
    sym_path: list[str]

def find_negative_cycle(edges: list[Edge]) -> ArbCycle | None:
    """Bellman-Ford with cycle recovery. Returns the first arbitrage loop found."""
    nodes = list({t for e in edges for t in (e.token_in, e.token_out)})
    if not nodes:
        return None
    INF = float("inf")
    dist = {n: 0.0 for n in nodes}     # virtual source: all distances 0
    pred: dict[str, Edge | None] = {n: None for n in nodes}

    weight = {}
    adj: list[Edge] = []
    for e in edges:
        r = _rate(e)
        if r <= 0:
            continue
        e_w = -math.log(r)
        weight[id(e)] = e_w
        adj.append(e)

    x = None
    for _ in range(len(nodes)):
        x = None
        for e in adj:
            if dist[e.token_in] + weight[id(e)] < dist[e.token_out] - 1e-12:
                dist[e.token_out] = dist[e.token_in] + weight[id(e)]
                pred[e.token_out] = e
                x = e.token_out
        if x is None:
            break
    if x is None:
        return None

    # walk back n steps to ensure we're inside the cycle
    for _ in range(len(nodes)):
        e = pred[x]
        if e is None:
            return None
        x = e.token_in

    # reconstruct
    cyc_edges: list[Edge] = []
    seen = set()
    cur = x
    while cur not in seen:
        seen.add(cur)
        e = pred[cur]
        if e is None:
            return None
        cyc_edges.append(e)
        cur = e.token_in
    cyc_edges.reverse()
    # trim to the actual loop (from first reoccurrence of cur)
    tokens = [e.token_in for e in cyc_edges] + [cyc_edges[-1].token_out]
    syms = [e.sym_in for e in cyc_edges] + [cyc_edges[-1].sym_out]
    return ArbCycle(tokens, cyc_edges, syms)

def size_and_score(cycle: ArbCycle, gas_wei: int, eth_price_per_start: float = 0.0) -> dict | None:
    """Size the cycle, net out gas, return a scored opportunity or None."""
    hops = [(e.reserve_in, e.reserve_out) for e in cycle.edges]
    # closed form for 2-hop; golden-section otherwise
    if len(hops) == 2:
        amt = optimal_two_hop_input(hops[0][0], hops[0][1], hops[1][0], hops[1][1])
    else:
        amt = _golden_section(hops)
    if amt <= 0:
        return None
    ev = evaluate_cycle(hops, amt)
    if ev.profit <= 0:
        return None
    # gas: ~150k per leg; convert to start-token wei only if caller gave a price,
    # else compare bps and treat gas as a flat haircut handled by Risk.
    gas_cost_wei = gas_wei * 150_000 * len(hops)
    net_profit = ev.profit - int(gas_cost_wei * eth_price_per_start) if eth_price_per_start else ev.profit
    net_bps = (net_profit / amt * 10000) if amt > 0 else 0.0
    return {
        "sym_path": cycle.sym_path,
        "edges": cycle.edges,
        "amount_in_wei": amt,
        "gross_profit_wei": ev.profit,
        "gross_bps": ev.profit_bps,
        "net_profit_wei": net_profit,
        "net_bps": net_bps,
        "gas_cost_wei": gas_cost_wei,
        "n_legs": len(hops),
    }

def _golden_section(hops, lo=10**15, hi=10**24, iters=80):
    """Maximize profit(x) for >2 hops. Unimodal in the profitable region."""
    from .cycle_math import cycle_output
    gr = (math.sqrt(5) - 1) / 2
    def profit(x): return cycle_output(int(x), hops) - int(x)
    a, b = lo, hi
    c = b - gr * (b - a); d = a + gr * (b - a)
    for _ in range(iters):
        if profit(c) > profit(d): b = d
        else: a = c
        c = b - gr * (b - a); d = a + gr * (b - a)
    x = int((a + b) / 2)
    return x if profit(x) > 0 else 0
