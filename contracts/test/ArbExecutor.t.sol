// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArbExecutor} from "../src/ArbExecutor.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockV2Pair} from "./mocks/MockV2Pair.sol";

/// Two WBNB/USDT pools with a 15% price divergence and deep liquidity, so a
/// small trade captures the spread net of the 0.25%/leg fee. The profitable
/// cycle sells WBNB where USDT is rich (poolB) then rebuys on poolA.
/// Values here are cross-checked against an out-of-band constant-product model
/// AND executed against the compiled bytecode in an EVM harness (see docs).
contract ArbExecutorTest is Test {
    ArbExecutor exec;
    MockERC20 wbnb;
    MockERC20 usdt;
    MockV2Pair poolA; // 1000 WBNB : 1,000,000 USDT  -> 1000 USDT/WBNB
    MockV2Pair poolB; // 1000 WBNB : 1,150,000 USDT  -> 1150 USDT/WBNB
    MockV2Pair poolF; // dedicated flash lender, not in the arb path

    address keeper = address(0xBEEF);

    function setUp() public {
        wbnb = new MockERC20("WBNB", "WBNB");
        usdt = new MockERC20("USDT", "USDT");

        poolA = _pool(1000 ether, 1_000_000 ether);
        poolB = _pool(1000 ether, 1_150_000 ether);
        poolF = _pool(5000 ether, 5_000_000 ether);

        exec = new ArbExecutor(50 ether);
        exec.setExecutor(keeper, true);
        exec.setAllowedToken(address(wbnb), true);
        exec.setAllowedToken(address(usdt), true);
    }

    function _pool(uint256 wbnbAmt, uint256 usdtAmt) internal returns (MockV2Pair p) {
        p = new MockV2Pair(address(wbnb), address(usdt));
        wbnb.mint(address(p), wbnbAmt);
        usdt.mint(address(p), usdtAmt);
        p.sync();
    }

    /// Profitable direction: WBNB->USDT on poolB, then USDT->WBNB on poolA.
    function _cycle() internal view returns (ArbExecutor.SwapLeg[] memory legs) {
        legs = new ArbExecutor.SwapLeg[](2);
        legs[0] = ArbExecutor.SwapLeg(address(poolB), address(wbnb), address(usdt), 2);
        legs[1] = ArbExecutor.SwapLeg(address(poolA), address(usdt), address(wbnb), 2);
    }

    function test_ProfitableCycle() public {
        wbnb.mint(address(exec), 5 ether);
        uint256 before = wbnb.balanceOf(address(exec));
        vm.prank(keeper);
        uint256 profit = exec.executeCycle(_cycle(), 5 ether, 1);
        assertGt(profit, 0.5 ether, "expected ~0.66 WBNB profit");
        assertEq(wbnb.balanceOf(address(exec)), before + profit);
    }

    function test_RevertsBelowMinProfit() public {
        wbnb.mint(address(exec), 5 ether);
        vm.prank(keeper);
        vm.expectRevert();
        exec.executeCycle(_cycle(), 5 ether, 100 ether);
    }

    function test_RevertsUnprofitableDirection() public {
        ArbExecutor.SwapLeg[] memory legs = new ArbExecutor.SwapLeg[](2);
        legs[0] = ArbExecutor.SwapLeg(address(poolA), address(wbnb), address(usdt), 2);
        legs[1] = ArbExecutor.SwapLeg(address(poolB), address(usdt), address(wbnb), 2);
        wbnb.mint(address(exec), 5 ether);
        vm.prank(keeper);
        vm.expectRevert();
        exec.executeCycle(legs, 5 ether, 1);
    }

    function test_OnlyExecutor() public {
        wbnb.mint(address(exec), 5 ether);
        vm.prank(address(0xDEAD));
        vm.expectRevert(ArbExecutor.NotExecutor.selector);
        exec.executeCycle(_cycle(), 5 ether, 1);
    }

    function test_RejectsDisallowedToken() public {
        exec.setAllowedToken(address(usdt), false);
        wbnb.mint(address(exec), 5 ether);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ArbExecutor.TokenNotAllowed.selector, address(usdt)));
        exec.executeCycle(_cycle(), 5 ether, 1);
    }

    function test_EnforcesMaxNotional() public {
        wbnb.mint(address(exec), 100 ether);
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(ArbExecutor.ExceedsMaxNotional.selector, 60 ether, 50 ether));
        exec.executeCycle(_cycle(), 60 ether, 1);
    }

    function test_PauseBlocksTrading() public {
        vm.prank(keeper);
        exec.pause();
        wbnb.mint(address(exec), 5 ether);
        vm.prank(keeper);
        vm.expectRevert(ArbExecutor.IsPaused.selector);
        exec.executeCycle(_cycle(), 5 ether, 1);
    }

    function test_RejectsBadLegsNotClosed() public {
        ArbExecutor.SwapLeg[] memory legs = new ArbExecutor.SwapLeg[](2);
        legs[0] = ArbExecutor.SwapLeg(address(poolB), address(wbnb), address(usdt), 2);
        legs[1] = ArbExecutor.SwapLeg(address(poolA), address(usdt), address(usdt), 2);
        wbnb.mint(address(exec), 5 ether);
        vm.prank(keeper);
        vm.expectRevert(ArbExecutor.InvalidLegs.selector);
        exec.executeCycle(legs, 5 ether, 1);
    }

    /// Flash from an INDEPENDENT pool (poolF), not one inside the cycle —
    /// borrowing from a cycle pool would corrupt its reserves mid-callback.
    function test_FlashArbNoInventory() public {
        assertEq(wbnb.balanceOf(address(exec)), 0);
        vm.prank(keeper);
        exec.flashArb(address(poolF), _cycle(), 3 ether, 1);
        assertGt(wbnb.balanceOf(address(exec)), 0.2 ether, "flash profit retained, zero inventory");
    }

    function test_BadCallbackRejected() public {
        vm.expectRevert(abi.encodeWithSelector(ArbExecutor.BadCallback.selector, address(this)));
        exec.pancakeCall(address(exec), 0, 0, "");
    }
}
