import sys; sys.path.insert(0,'.')
from agents.portfolio.backtest.engine import run_two_pool
E18=10**18
# poolA stable at 1000:1.0M ; poolB oscillates between 1.05M and 1.15M (arb appears when diverged)
snaps_a = [{"reserve0":str(1000*E18),"reserve1":str(1_000_000*E18)} for _ in range(20)]
snaps_b = []
for i in range(20):
    usdt = 1_050_000 if i%2==0 else 1_150_000
    snaps_b.append({"reserve0":str(1000*E18),"reserve1":str(usdt*E18)})
res = run_two_pool(snaps_a, snaps_b, min_bps=10)
print(f"backtest: {res.trades} trades, {res.win_rate}% win rate, "
      f"total profit {res.total_profit_wei/E18:.2f} WBNB")
print(f"equity curve points: {len(res.equity_curve)}, final equity {res.equity_curve[-1]/E18:.2f}")
assert res.trades > 0 and res.total_profit_wei > 0
print("PASS backtester replays history through live strategy math")
