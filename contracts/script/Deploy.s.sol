// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";

/// @notice Deploy SuretyEscrow to X Layer.
/// @dev Env: ADJUDICATOR (evaluator service address), FEE_RECIPIENT.
///      forge script script/Deploy.s.sol --rpc-url $XLAYER_TESTNET_RPC --broadcast
contract Deploy is Script {
    function run() external returns (SuretyEscrow escrow) {
        address adjudicator = vm.envAddress("ADJUDICATOR");
        address feeRecipient = vm.envAddress("FEE_RECIPIENT");
        vm.startBroadcast();
        escrow = new SuretyEscrow(adjudicator, feeRecipient);
        vm.stopBroadcast();
        console.log("SuretyEscrow deployed at:", address(escrow));
        console.log("adjudicator:", adjudicator);
        console.log("feeRecipient:", feeRecipient);
    }
}
