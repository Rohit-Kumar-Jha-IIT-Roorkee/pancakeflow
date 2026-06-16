// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IPancakePair} from "./interfaces/IPancakePair.sol";
import {IPancakeV3Pool} from "./interfaces/IPancakeV3Pool.sol";

/// @title  ArbExecutor — atomic, profit-or-revert arbitrage cycles on PancakeSwap
/// @notice The only mandatory on-chain component of the system. Design goals:
///         1. ATOMICITY  — an N-leg cycle either nets >= minProfit or the whole tx
///            reverts. A failed arb costs gas, never inventory.
///         2. HARD BACKSTOP — token allowlist, per-tx notional cap, and a pause
///            switch live on-chain, so no off-chain bug (or compromised agent)
///            can exceed them. The off-chain Risk Agent enforces richer limits;
///            this contract enforces the non-negotiable ones.
///         3. CAPITAL EFFICIENCY — V2 flash-swaps let the system arb sizes far
///            beyond its own inventory (borrow leg 0 from the pool itself).
/// @dev    Supports PancakeSwap V2 pairs and V3 pools in the same cycle.
contract ArbExecutor {
    // ---------------------------------------------------------------- types
    struct SwapLeg {
        address pool;     // V2 pair or V3 pool
        address tokenIn;
        address tokenOut;
        uint8   poolType; // 2 = V2, 3 = V3
    }

    // ---------------------------------------------------------------- state
    address public owner;
    bool    public paused;
    uint256 public maxNotional;                 // max amountIn / borrowAmount per tx (wei of start token)
    mapping(address => bool) public executors;  // EOAs of the Execution service
    mapping(address => bool) public allowedTokens;

    /// @dev Set immediately before an external pool call that will re-enter via
    ///      callback; checked in the callback; cleared after. Cheap and airtight:
    ///      only the pool we just called may call us back.
    address private _expectedCallbackPool;
    uint256 private _lock = 1;

    // ------------------------------------------------------------- constants
    uint256 private constant V2_FEE_NUM = 9975;   // PancakeSwap V2: 0.25% fee
    uint256 private constant V2_FEE_DEN = 10000;
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    // ---------------------------------------------------------------- events
    event CycleExecuted(address indexed startToken, uint256 amountIn, uint256 profit, uint256 legs);
    event FlashArbExecuted(address indexed borrowToken, uint256 borrowAmount, uint256 profit);
    event PausedSet(bool paused);
    event ExecutorSet(address indexed executor, bool allowed);
    event TokenAllowed(address indexed token, bool allowed);
    event MaxNotionalSet(uint256 maxNotional);

    // ---------------------------------------------------------------- errors
    error NotOwner();
    error NotExecutor();
    error IsPaused();
    error Reentrancy();
    error InvalidLegs();
    error TokenNotAllowed(address token);
    error ExceedsMaxNotional(uint256 amount, uint256 cap);
    error InsufficientInventory(uint256 have, uint256 need);
    error ProfitBelowMinimum(uint256 profit, uint256 minProfit);
    error BadCallback(address caller);
    error TransferFailed();

    // ------------------------------------------------------------- modifiers
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyExecutor() {
        if (msg.sender != owner && !executors[msg.sender]) revert NotExecutor();
        _;
    }
    modifier notPaused() { if (paused) revert IsPaused(); _; }
    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2; _; _lock = 1;
    }

    constructor(uint256 maxNotional_) {
        owner = msg.sender;
        maxNotional = maxNotional_;
    }

    // ============================================================ trade paths

    /// @notice Execute an N-leg swap cycle from inventory. legs[0].tokenIn must
    ///         equal legs[last].tokenOut; profit measured in that token.
    function executeCycle(SwapLeg[] calldata legs, uint256 amountIn, uint256 minProfit)
        external onlyExecutor notPaused nonReentrant returns (uint256 profit)
    {
        address startToken = _validateLegs(legs);
        if (amountIn == 0 || amountIn > maxNotional) revert ExceedsMaxNotional(amountIn, maxNotional);

        uint256 balBefore = IERC20(startToken).balanceOf(address(this));
        if (balBefore < amountIn) revert InsufficientInventory(balBefore, amountIn);

        _runLegs(legs, amountIn);

        uint256 balAfter = IERC20(startToken).balanceOf(address(this));
        // strict: cycle must end >= start; underflow here would revert anyway,
        // but give a precise error for the tx watcher to classify.
        if (balAfter < balBefore + minProfit) {
            revert ProfitBelowMinimum(balAfter > balBefore ? balAfter - balBefore : 0, minProfit);
        }
        profit = balAfter - balBefore;
        emit CycleExecuted(startToken, amountIn, profit, legs.length);
    }

    struct FlashData { SwapLeg[] legs; uint256 borrowAmount; uint256 minProfit; address borrowToken; }

    /// @notice Borrow `borrowAmount` of legs[0].tokenIn from a V2 pair via flash
    ///         swap, run the cycle, repay + 0.25% fee, keep the spread.
    function flashArb(address flashPool, SwapLeg[] calldata legs, uint256 borrowAmount, uint256 minProfit)
        external onlyExecutor notPaused nonReentrant
    {
        address borrowToken = _validateLegs(legs);
        if (borrowAmount == 0 || borrowAmount > maxNotional) revert ExceedsMaxNotional(borrowAmount, maxNotional);

        bool borrowIsToken0 = IPancakePair(flashPool).token0() == borrowToken;
        bytes memory data = abi.encode(FlashData({
            legs: legs, borrowAmount: borrowAmount, minProfit: minProfit, borrowToken: borrowToken
        }));

        _expectedCallbackPool = flashPool;
        IPancakePair(flashPool).swap(
            borrowIsToken0 ? borrowAmount : 0,
            borrowIsToken0 ? 0 : borrowAmount,
            address(this),
            data
        );
        _expectedCallbackPool = address(0);
    }

    /// @dev V2 flash-swap callback (PancakeSwap naming). Runs the cycle and repays.
    function pancakeCall(address sender, uint256, uint256, bytes calldata data) external {
        if (msg.sender != _expectedCallbackPool) revert BadCallback(msg.sender);
        if (sender != address(this)) revert BadCallback(sender);
        _expectedCallbackPool = address(0); // consume before inner V3 legs reuse the slot

        FlashData memory f = abi.decode(data, (FlashData));
        uint256 out = _runLegsMemory(f.legs, f.borrowAmount);

        // repay borrow + 0.25% pool fee, rounded up
        uint256 repay = (f.borrowAmount * V2_FEE_DEN) / V2_FEE_NUM + 1;
        if (out < repay + f.minProfit) {
            revert ProfitBelowMinimum(out > repay ? out - repay : 0, f.minProfit);
        }
        _safeTransfer(f.borrowToken, msg.sender, repay);
        emit FlashArbExecuted(f.borrowToken, f.borrowAmount, out - repay);
    }

    /// @dev V3 swap callback: pay the pool what we owe.
    function pancakeV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (msg.sender != _expectedCallbackPool) revert BadCallback(msg.sender);
        address tokenIn = abi.decode(data, (address));
        uint256 owed = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        _safeTransfer(tokenIn, msg.sender, owed);
    }

    // ============================================================== internals

    function _validateLegs(SwapLeg[] calldata legs) private view returns (address startToken) {
        uint256 n = legs.length;
        if (n < 2) revert InvalidLegs();
        startToken = legs[0].tokenIn;
        if (legs[n - 1].tokenOut != startToken) revert InvalidLegs();
        for (uint256 i; i < n; ++i) {
            if (!allowedTokens[legs[i].tokenIn]) revert TokenNotAllowed(legs[i].tokenIn);
            if (!allowedTokens[legs[i].tokenOut]) revert TokenNotAllowed(legs[i].tokenOut);
            if (i > 0 && legs[i].tokenIn != legs[i - 1].tokenOut) revert InvalidLegs();
        }
    }

    function _runLegs(SwapLeg[] calldata legs, uint256 amountIn) private returns (uint256 amt) {
        amt = amountIn;
        for (uint256 i; i < legs.length; ++i) {
            amt = legs[i].poolType == 2 ? _swapV2(legs[i], amt) : _swapV3(legs[i], amt);
        }
    }

    function _runLegsMemory(SwapLeg[] memory legs, uint256 amountIn) private returns (uint256 amt) {
        amt = amountIn;
        for (uint256 i; i < legs.length; ++i) {
            amt = legs[i].poolType == 2 ? _swapV2M(legs[i], amt) : _swapV3M(legs[i], amt);
        }
    }

    function _swapV2(SwapLeg calldata leg, uint256 amountIn) private returns (uint256) {
        return _v2(leg.pool, leg.tokenIn, leg.tokenOut, amountIn);
    }
    function _swapV2M(SwapLeg memory leg, uint256 amountIn) private returns (uint256) {
        return _v2(leg.pool, leg.tokenIn, leg.tokenOut, amountIn);
    }

    function _v2(address pool, address tokenIn, address tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
        // V2 invariant: token0 < token1 (factory sorts), so direction is derivable
        // without external calls.
        bool zeroForOne = tokenIn < tokenOut;
        (uint112 r0, uint112 r1,) = IPancakePair(pool).getReserves();
        (uint256 rIn, uint256 rOut) = zeroForOne ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));

        uint256 amountInWithFee = amountIn * V2_FEE_NUM;
        amountOut = (amountInWithFee * rOut) / (rIn * V2_FEE_DEN + amountInWithFee);

        _safeTransfer(tokenIn, pool, amountIn);
        IPancakePair(pool).swap(zeroForOne ? 0 : amountOut, zeroForOne ? amountOut : 0, address(this), "");
    }

    function _swapV3(SwapLeg calldata leg, uint256 amountIn) private returns (uint256) {
        return _v3(leg.pool, leg.tokenIn, leg.tokenOut, amountIn);
    }
    function _swapV3M(SwapLeg memory leg, uint256 amountIn) private returns (uint256) {
        return _v3(leg.pool, leg.tokenIn, leg.tokenOut, amountIn);
    }

    function _v3(address pool, address tokenIn, address tokenOut, uint256 amountIn) private returns (uint256 amountOut) {
        bool zeroForOne = tokenIn < tokenOut;
        address prev = _expectedCallbackPool; // preserve outer flash context
        _expectedCallbackPool = pool;
        (int256 a0, int256 a1) = IPancakeV3Pool(pool).swap(
            address(this),
            zeroForOne,
            int256(amountIn),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            abi.encode(tokenIn)
        );
        _expectedCallbackPool = prev;
        amountOut = uint256(-(zeroForOne ? a1 : a0));
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    // ================================================================== admin

    function setExecutor(address exec, bool allowed) external onlyOwner {
        executors[exec] = allowed; emit ExecutorSet(exec, allowed);
    }
    function setAllowedToken(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed; emit TokenAllowed(token, allowed);
    }
    function setMaxNotional(uint256 cap) external onlyOwner {
        maxNotional = cap; emit MaxNotionalSet(cap);
    }
    /// @notice Circuit breaker hook — Risk Agent calls this on TRIPPED.
    function pause() external onlyExecutor { paused = true; emit PausedSet(true); }
    function unpause() external onlyOwner { paused = false; emit PausedSet(false); }
    function rescueTokens(address token, address to, uint256 amount) external onlyOwner {
        _safeTransfer(token, to, amount);
    }
    function transferOwnership(address newOwner) external onlyOwner { owner = newOwner; }
}
