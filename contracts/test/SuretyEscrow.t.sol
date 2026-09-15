// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SuretyEscrow} from "../src/SuretyEscrow.sol";

contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}
    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract SuretyEscrowTest is Test {
    SuretyEscrow escrow;
    MockUSD usd;
    address buyer = address(0xB0B);
    address provider = address(0x420);
    address adjudicator = address(0xA09);
    address feeTo = address(0xFEE);

    uint256 constant PRICE = 500e6; // $500
    uint256 constant BOND = 50e6; // $50
    uint16 constant FEE_BPS = 400; // 4%
    bytes32 constant SPEC = keccak256("spec:v1");

    function setUp() public {
        escrow = new SuretyEscrow(adjudicator, feeTo);
        usd = new MockUSD();
        usd.mint(buyer, 10_000e6);
        usd.mint(provider, 10_000e6);
        vm.prank(buyer);
        usd.approve(address(escrow), type(uint256).max);
        vm.prank(provider);
        usd.approve(address(escrow), type(uint256).max);
    }

    function _open(uint64 deadline, uint64 window) internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.createOrder(provider, usd, PRICE, BOND, FEE_BPS, deadline, window, SPEC);
    }

    function _bonded(uint256 id) internal {
        vm.prank(provider);
        escrow.postBond(id);
    }

    function _delivered(uint256 id) internal {
        vm.prank(provider);
        escrow.submitDelivery(id, keccak256("delivery"));
    }

    function test_PassPaysProviderMinusFee() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 0);
        _bonded(id);
        _delivered(id);
        uint256 p0 = usd.balanceOf(provider);
        uint256 f0 = usd.balanceOf(feeTo);
        vm.prank(adjudicator);
        escrow.adjudicate(id, true, "ipfs://pass-log");
        uint256 fee = (PRICE * FEE_BPS) / 10_000;
        assertEq(usd.balanceOf(provider) - p0, PRICE + BOND - fee, "provider net");
        assertEq(usd.balanceOf(feeTo) - f0, fee, "fee");
        assertEq(uint8(escrow.stateOf(id)), uint8(SuretyEscrow.State.Resolved));
    }

    function test_FailRefundsBuyerPlusBond() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 0);
        _bonded(id);
        _delivered(id);
        uint256 b0 = usd.balanceOf(buyer);
        vm.prank(adjudicator);
        escrow.adjudicate(id, false, "ipfs://fail-log");
        assertEq(usd.balanceOf(buyer) - b0, PRICE + BOND, "buyer made whole + bond");
        assertEq(uint8(escrow.stateOf(id)), uint8(SuretyEscrow.State.Resolved));
    }

    function test_NoShowSlash() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 0);
        _bonded(id);
        // provider never delivers
        vm.warp(block.timestamp + 2 days);
        uint256 b0 = usd.balanceOf(buyer);
        vm.prank(buyer);
        escrow.claimNoShow(id);
        assertEq(usd.balanceOf(buyer) - b0, PRICE + BOND);
    }

    function test_UnbondedRefund() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 0);
        vm.warp(block.timestamp + 2 days);
        uint256 b0 = usd.balanceOf(buyer);
        vm.prank(buyer);
        escrow.refundUnbonded(id);
        assertEq(usd.balanceOf(buyer) - b0, PRICE);
    }

    function test_DisputeThenResolve() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 1 days);
        _bonded(id);
        _delivered(id);
        vm.prank(adjudicator);
        escrow.adjudicate(id, true, "ipfs://pass-log");
        vm.prank(buyer);
        escrow.raiseDispute(id);
        assertEq(uint8(escrow.stateOf(id)), uint8(SuretyEscrow.State.Disputed));
        uint256 b0 = usd.balanceOf(buyer);
        vm.prank(adjudicator);
        escrow.resolveDispute(id, false, "ipfs://rereview-fail");
        assertEq(usd.balanceOf(buyer) - b0, PRICE + BOND);
    }

    function test_SettleAfterWindowWithoutDispute() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 1 days);
        _bonded(id);
        _delivered(id);
        vm.prank(adjudicator);
        escrow.adjudicate(id, true, "ipfs://pass-log");
        vm.warp(block.timestamp + 2 days);
        uint256 p0 = usd.balanceOf(provider);
        escrow.settle(id); // anyone may settle
        assertGt(usd.balanceOf(provider) - p0, 0);
    }

    function test_Reverts() public {
        uint256 id = _open(uint64(block.timestamp + 1 days), 1 days);
        _bonded(id);
        _delivered(id);
        // non-adjudicator cannot adjudicate
        vm.prank(buyer);
        vm.expectRevert(SuretyEscrow.NotAdjudicator.selector);
        escrow.adjudicate(id, true, "");
        // early settle reverts
        vm.prank(adjudicator);
        escrow.adjudicate(id, true, "ipfs://x");
        vm.expectRevert(SuretyEscrow.DeadlineNotReached.selector);
        escrow.settle(id);
        // double adjudication reverts (state is Passed, not Delivered)
        vm.prank(adjudicator);
        vm.expectRevert(
            abi.encodeWithSelector(
                SuretyEscrow.BadState.selector, SuretyEscrow.State.Delivered, SuretyEscrow.State.Passed
            )
        );
        escrow.adjudicate(id, true, "");
    }
}
