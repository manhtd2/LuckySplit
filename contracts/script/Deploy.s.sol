// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {LuckySplit} from "../src/LuckySplit.sol";

/// @notice Deploys LuckySplit to Arc Testnet.
/// Required env vars:
///   PRIVATE_KEY       deployer key (becomes contract owner)
///   USDC_ADDRESS      Arc Testnet USDC ERC-20 address (0x3600000000000000000000000000000000000000)
///   OPERATOR_ADDRESS  platform operator wallet (drives commit/reveal/distribute)
contract Deploy is Script {
    function run() external returns (LuckySplit ls) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address usdcAddress = vm.envAddress("USDC_ADDRESS");
        address operatorAddress = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerKey);
        ls = new LuckySplit(usdcAddress, operatorAddress);
        vm.stopBroadcast();

        console.log("LuckySplit deployed at:", address(ls));
        console.log("USDC:", usdcAddress);
        console.log("Operator:", operatorAddress);
    }
}
