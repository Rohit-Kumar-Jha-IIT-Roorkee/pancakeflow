// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPancakeV3Pool {
    /// @notice Exact-input/-output swap. Positive return delta = caller owes pool,
    ///         negative = caller receives. Caller pays inside pancakeV3SwapCallback.
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);
}
