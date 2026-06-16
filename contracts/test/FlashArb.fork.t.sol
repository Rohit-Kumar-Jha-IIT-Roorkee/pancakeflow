// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ArbExecutor} from "../src/ArbExecutor.sol";

/// Skipped unless `BSC_RPC_HTTP_1` is set. On a real fork this would seed an
/// imbalance and assert a profitable executeCycle against live PancakeSwap pools.
/// Kept minimal here: proves deploy + config wiring works against forked state.
contract FlashArbForkTest is Test {
    address constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_RPC_HTTP_1", string(""));
        if (bytes(rpc).length == 0) vm.skip(true);
        else vm.createSelectFork(rpc);
    }

    function test_DeployOnFork() public {
        ArbExecutor exec = new ArbExecutor(10 ether);
        exec.setAllowedToken(WBNB, true);
        assertTrue(exec.allowedTokens(WBNB));
        assertEq(exec.maxNotional(), 10 ether);
    }
}
