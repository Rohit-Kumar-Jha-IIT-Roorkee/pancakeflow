"""Run the whole Python agent swarm in one process (demo). In prod each runs as
its own worker scaled off consumer groups."""
import asyncio
from agents.common import config
from agents.strategy import agent as strategy
from agents.risk import agent as risk
from agents.orchestrator import graph as orchestrator

async def main():
    print(f"=== PancakeFlow agents | mode={config.EXEC_MODE} profile={config.RISK_PROFILE} "
          f"capital=${config.CAPITAL_USD:.0f} ===")
    await asyncio.gather(
        orchestrator.run(),
        strategy.run(),
        risk.monitor_loop(),
    )

if __name__ == "__main__":
    asyncio.run(main())
