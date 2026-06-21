// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {MockV2Pair} from "../test/mocks/MockV2Pair.sol";

/// Deploy mock tokens and seed mock pools on testnet for integration testing.
contract SeedTestnetPools is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);

        MockERC20 wbnb = new MockERC20("Wrapped BNB", "WBNB", 18);
        MockERC20 usdt = new MockERC20("Tether USD", "USDT", 18);
        MockERC20 cake = new MockERC20("PancakeSwap Token", "CAKE", 18);

        wbnb.mint(address(this), 10000 ether);
        usdt.mint(address(this), 10000000 ether);
        cake.mint(address(this), 10000000 ether);

        // Pool 1: WBNB / USDT
        MockV2Pair pair1 = new MockV2Pair(address(wbnb), address(usdt));
        wbnb.transfer(address(pair1), 1000 ether);
        usdt.transfer(address(pair1), 1000000 ether);
        pair1.sync();

        // Pool 2: CAKE / WBNB
        MockV2Pair pair2 = new MockV2Pair(address(cake), address(wbnb));
        cake.transfer(address(pair2), 5000 ether);
        wbnb.transfer(address(pair2), 100 ether);
        pair2.sync();

        vm.stopBroadcast();

        console2.log("WBNB:", address(wbnb));
        console2.log("USDT:", address(usdt));
        console2.log("CAKE:", address(cake));
        console2.log("Pair WBNB/USDT:", address(pair1));
        console2.log("Pair CAKE/WBNB:", address(pair2));
    }
}
