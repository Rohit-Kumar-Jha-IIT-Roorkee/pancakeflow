import sys; import os,sys; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from agents.strategy.arbitrage.scanner import build_edges, find_negative_cycle, size_and_score
E18 = 10**18
# Two WBNB/USDT pools with divergence => 2-cycle arb exists
pools = [
  {"address":"0xA","poolType":"2","token0":"WBNB_ADDR","token1":"USDT_ADDR",
   "reserve0":str(1000*E18),"reserve1":str(1_000_000*E18),"symbol0":"WBNB","symbol1":"USDT"},
  {"address":"0xB","poolType":"2","token0":"WBNB_ADDR","token1":"USDT_ADDR",
   "reserve0":str(1000*E18),"reserve1":str(1_150_000*E18),"symbol0":"WBNB","symbol1":"USDT"},
]
edges = build_edges(pools)
print(f"built {len(edges)} directed edges")
cyc = find_negative_cycle(edges)
assert cyc is not None, "should find the arb loop"
print("found cycle:", " -> ".join(cyc.sym_path))
opp = size_and_score(cyc, gas_wei=5_000_000_000)
assert opp is not None and opp["net_profit_wei"] > 0, "should be profitable"
print(f"sized: {opp['amount_in_wei']/E18:.2f} start-token in, "
      f"net profit {opp['net_profit_wei']/E18:.4f} ({opp['net_bps']:.1f} bps), {opp['n_legs']} legs")
print("PASS scanner finds & sizes the arbitrage")
