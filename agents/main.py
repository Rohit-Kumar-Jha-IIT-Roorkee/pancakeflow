"""Run the whole Python agent swarm in one process (demo). In prod each runs as
its own worker scaled off consumer groups."""
import asyncio
from agents.common import config
from agents.strategy import agent as strategy
from agents.risk import agent as risk
from agents.orchestrator import graph as orchestrator
from agents.liquidity import agent as liquidity

from agents.common.config import logger

async def main():
    logger.info("PancakeFlow agents starting", mode=config.EXEC_MODE, profile=config.RISK_PROFILE, capital=config.CAPITAL_USD)
    await asyncio.gather(
        orchestrator.run(),
        strategy.run(),
        risk.monitor_loop(),
        liquidity.run(),
    )

if __name__ == "__main__":
    asyncio.run(main())
