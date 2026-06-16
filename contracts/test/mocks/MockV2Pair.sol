// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like { function balanceOf(address) external view returns (uint256); function transfer(address,uint256) external returns (bool); }
interface IPancakeCallee { function pancakeCall(address,uint256,uint256,bytes calldata) external; }

/// @dev Minimal but invariant-correct x*y=k pair with 0.25% fee, mirroring
///      PancakeSwap V2 swap() (optimistic transfer + flash callback + k-check).
contract MockV2Pair {
    address public token0;
    address public token1;
    uint112 private r0;
    uint112 private r1;

    constructor(address t0, address t1) {
        (token0, token1) = t0 < t1 ? (t0, t1) : (t1, t0);
    }

    function getReserves() external view returns (uint112, uint112, uint32) { return (r0, r1, 0); }

    function sync() external {
        r0 = uint112(IERC20Like(token0).balanceOf(address(this)));
        r1 = uint112(IERC20Like(token1).balanceOf(address(this)));
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external {
        require(amount0Out > 0 || amount1Out > 0, "OUT");
        uint112 _r0 = r0; uint112 _r1 = r1;
        require(amount0Out < _r0 && amount1Out < _r1, "LIQ");

        if (amount0Out > 0) IERC20Like(token0).transfer(to, amount0Out);
        if (amount1Out > 0) IERC20Like(token1).transfer(to, amount1Out);
        if (data.length > 0) IPancakeCallee(to).pancakeCall(msg.sender, amount0Out, amount1Out, data);

        uint256 b0 = IERC20Like(token0).balanceOf(address(this));
        uint256 b1 = IERC20Like(token1).balanceOf(address(this));
        uint256 in0 = b0 > _r0 - amount0Out ? b0 - (_r0 - amount0Out) : 0;
        uint256 in1 = b1 > _r1 - amount1Out ? b1 - (_r1 - amount1Out) : 0;
        require(in0 > 0 || in1 > 0, "IN");

        // 0.25% fee: adjusted balances scaled by 10000, fee subtracts 25*in
        uint256 b0adj = b0 * 10000 - in0 * 25;
        uint256 b1adj = b1 * 10000 - in1 * 25;
        require(b0adj * b1adj >= uint256(_r0) * uint256(_r1) * (10000 ** 2), "K");

        r0 = uint112(b0); r1 = uint112(b1);
    }
}
