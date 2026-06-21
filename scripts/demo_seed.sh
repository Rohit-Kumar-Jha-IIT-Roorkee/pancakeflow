#!/bin/bash
# Seed demo market state so the paper agents have pools to scan.
# Equivalent to: make seed
# Requires Python + Redis running (make infra).
set -e
python3 "$(dirname "$0")/seed_market.py"
