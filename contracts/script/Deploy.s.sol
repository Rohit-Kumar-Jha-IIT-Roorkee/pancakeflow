// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ArbExecutor} from "../src/ArbExecutor.sol";

/// Deploy + configure for BNB testnet. Tokens/executor read from env.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        uint256 maxNotional = vm.envOr("MAX_NOTIONAL", uint256(10 ether));
        address keeper = vm.envOr("EXECUTOR_ADDR", vm.addr(pk));

        vm.startBroadcast(pk);
        ArbExecutor exec = new ArbExecutor(maxNotional);
        exec.setExecutor(keeper, true);
        vm.stopBroadcast();

        console2.log("ArbExecutor:", address(exec));
        console2.log("executor:", keeper);
    }
}
