// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title SuretyEscrow — bonded agent-work escrow for X Layer
/// @notice Buyer escrows the price. Provider posts a bond of their own money.
///         A frozen acceptance spec (specHash, committed pre-work) is evaluated
///         off-chain by a deterministic evaluator; the adjudicator reports
///         PASS/FAIL once. PASS: provider paid + bond returned (minus protocol
///         fee on price). FAIL: buyer refunded + provider bond paid to buyer.
///         No-show past deadline counts as FAIL. Disputes freeze funds for the
///         adjudicator (v1) / OKB-evaluator jury (roadmap) to resolve.
contract SuretyEscrow is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum State {
        Created, // buyer funded, awaiting provider bond
        Bonded, // both sides funded, work in progress
        Delivered, // provider submitted deliveryHash, awaiting adjudication
        Passed, // adjudicator reported PASS (challengeable during window)
        Failed, // adjudicator reported FAIL (challengeable during window)
        Disputed, // frozen, awaiting resolveDispute
        Resolved, // terminal: funds moved
        Refunded // terminal: timed out with no bond/delivery
    }

    struct Order {
        address buyer;
        address provider;
        IERC20 token;
        uint256 price;
        uint256 bond;
        uint16 feeBps; // protocol fee on price, on PASS only
        uint64 deadline; // provider must deliver by this timestamp
        uint64 disputeWindow; // seconds after adjudication during which losers may dispute
        bytes32 specHash; // keccak of the frozen acceptance-spec JSON
        bytes32 deliveryHash; // keccak of delivered bytes, set on submitDelivery
        State state;
        uint64 adjudicatedAt;
        bool pass; // adjudicator verdict
        string logUri; // evaluator log (evidence, not consensus)
    }

    /// @dev adjudicator is the deterministic-evaluator service key (off-chain).
    address public adjudicator;
    address public feeRecipient;

    uint256 public nextOrderId;
    mapping(uint256 => Order) public orders;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        address indexed provider,
        address token,
        uint256 price,
        uint256 bond,
        bytes32 specHash,
        uint64 deadline
    );
    event BondPosted(uint256 indexed orderId, address indexed provider, uint256 bond);
    event Delivered(uint256 indexed orderId, bytes32 deliveryHash);
    event Adjudicated(uint256 indexed orderId, bool pass, string logUri);
    event DisputeRaised(uint256 indexed orderId, address indexed by);
    event DisputeResolved(uint256 indexed orderId, bool pass);
    event Released(uint256 indexed orderId, uint256 providerAmount, uint256 feeAmount);
    event Slashed(uint256 indexed orderId, uint256 buyerAmount);
    event Refunded(uint256 indexed orderId, address indexed to, uint256 amount);

    error NotBuyer();
    error NotProvider();
    error NotParty();
    error NotAdjudicator();
    error BadState(State want, State got);
    error DeadlinePassed();
    error DeadlineNotReached();
    error DisputeWindowClosed();
    error ZeroAmount();
    error FeeTooHigh();

    uint16 public constant MAX_FEE_BPS = 1_000; // 10%

    constructor(address _adjudicator, address _feeRecipient) Ownable(msg.sender) {
        adjudicator = _adjudicator;
        feeRecipient = _feeRecipient;
    }

    function setAdjudicator(address a) external onlyOwner {
        adjudicator = a;
    }

    function setFeeRecipient(address r) external onlyOwner {
        feeRecipient = r;
    }

    /// @notice Current lifecycle state of an order (public getter returns a tuple).
    function stateOf(uint256 orderId) external view returns (State) {
        return orders[orderId].state;
    }

    /// @notice Buyer opens an order and funds the price in one step.
    /// @param provider Agent/provider who may post bond and deliver.
    /// @param token ERC20 used for price + bond (e.g. USDT0 on X Layer).
    /// @param price What the buyer pays on PASS.
    /// @param bond What the provider forfeits on FAIL.
    /// @param feeBps Protocol fee on price (PASS only), <= MAX_FEE_BPS.
    /// @param deadline Unix time by which the provider must deliver.
    /// @param disputeWindow Seconds after adjudication open to disputes.
    /// @param specHash keccak256 of the frozen acceptance-spec JSON both sides confirmed.
    function createOrder(
        address provider,
        IERC20 token,
        uint256 price,
        uint256 bond,
        uint16 feeBps,
        uint64 deadline,
        uint64 disputeWindow,
        bytes32 specHash
    ) external nonReentrant returns (uint256 orderId) {
        if (price == 0 || bond == 0) revert ZeroAmount();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (deadline <= block.timestamp) revert DeadlinePassed();
        if (specHash == bytes32(0)) revert ZeroAmount();

        orderId = nextOrderId++;
        orders[orderId] = Order({
            buyer: msg.sender,
            provider: provider,
            token: token,
            price: price,
            bond: bond,
            feeBps: feeBps,
            deadline: deadline,
            disputeWindow: disputeWindow,
            specHash: specHash,
            deliveryHash: bytes32(0),
            state: State.Created,
            adjudicatedAt: 0,
            pass: false,
            logUri: ""
        });

        token.safeTransferFrom(msg.sender, address(this), price);
        emit OrderCreated(orderId, msg.sender, provider, address(token), price, bond, specHash, deadline);
    }

    /// @notice Provider locks the bond. Order becomes workable.
    function postBond(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (msg.sender != o.provider) revert NotProvider();
        if (o.state != State.Created) revert BadState(State.Created, o.state);
        if (block.timestamp > o.deadline) revert DeadlinePassed();
        o.token.safeTransferFrom(msg.sender, address(this), o.bond);
        o.state = State.Bonded;
        emit BondPosted(orderId, msg.sender, o.bond);
    }

    /// @notice Provider commits to delivered bytes (hash only; bytes live off-chain + log).
    function submitDelivery(uint256 orderId, bytes32 deliveryHash) external nonReentrant {
        Order storage o = orders[orderId];
        if (msg.sender != o.provider) revert NotProvider();
        if (o.state != State.Bonded) revert BadState(State.Bonded, o.state);
        if (block.timestamp > o.deadline) revert DeadlinePassed();
        if (deliveryHash == bytes32(0)) revert ZeroAmount();
        o.deliveryHash = deliveryHash;
        o.state = State.Delivered;
        emit Delivered(orderId, deliveryHash);
    }

    /// @notice Adjudicator reports the deterministic-evaluator verdict, exactly once.
    /// @dev PASS/FAIL moves to a challengeable state; funds move on `settle`
    ///      after the dispute window, or immediately if disputeWindow == 0.
    function adjudicate(uint256 orderId, bool pass, string calldata logUri) external nonReentrant {
        if (msg.sender != adjudicator) revert NotAdjudicator();
        Order storage o = orders[orderId];
        if (o.state != State.Delivered) revert BadState(State.Delivered, o.state);
        o.pass = pass;
        o.logUri = logUri;
        o.adjudicatedAt = uint64(block.timestamp);
        o.state = pass ? State.Passed : State.Failed;
        emit Adjudicated(orderId, pass, logUri);
        if (o.disputeWindow == 0) _settle(orderId);
    }

    /// @notice Losing side freezes funds for re-review. No fee to raise (v1).
    function raiseDispute(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (msg.sender != o.buyer && msg.sender != o.provider) revert NotParty();
        if (o.state != State.Passed && o.state != State.Failed) {
            revert BadState(State.Passed, o.state);
        }
        if (block.timestamp > o.adjudicatedAt + o.disputeWindow) revert DisputeWindowClosed();
        o.state = State.Disputed;
        emit DisputeRaised(orderId, msg.sender);
    }

    /// @notice Adjudicator issues the final verdict after a dispute.
    function resolveDispute(uint256 orderId, bool pass, string calldata logUri) external nonReentrant {
        if (msg.sender != adjudicator) revert NotAdjudicator();
        Order storage o = orders[orderId];
        if (o.state != State.Disputed) revert BadState(State.Disputed, o.state);
        o.pass = pass;
        o.logUri = logUri;
        emit DisputeResolved(orderId, pass);
        _settle(orderId);
    }

    /// @notice Moves funds after the dispute window elapsed with no dispute.
    function settle(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.state != State.Passed && o.state != State.Failed) {
            revert BadState(State.Passed, o.state);
        }
        if (block.timestamp <= o.adjudicatedAt + o.disputeWindow) revert DeadlineNotReached();
        _settle(orderId);
    }

    /// @notice Buyer reclaims price when the provider never bonded (past deadline).
    function refundUnbonded(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.state != State.Created) revert BadState(State.Created, o.state);
        if (block.timestamp <= o.deadline) revert DeadlineNotReached();
        o.state = State.Refunded;
        o.token.safeTransfer(o.buyer, o.price);
        emit Refunded(orderId, o.buyer, o.price);
    }

    /// @notice Buyer is refunded AND collects the bond when the provider
    ///         bonded but never delivered by the deadline (no-show = FAIL).
    function claimNoShow(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (msg.sender != o.buyer) revert NotBuyer();
        if (o.state != State.Bonded) revert BadState(State.Bonded, o.state);
        if (block.timestamp <= o.deadline) revert DeadlineNotReached();
        o.state = State.Resolved;
        o.pass = false;
        uint256 total = o.price + o.bond;
        o.token.safeTransfer(o.buyer, total);
        emit Slashed(orderId, total);
    }

    function _settle(uint256 orderId) internal {
        Order storage o = orders[orderId];
        o.state = State.Resolved;
        if (o.pass) {
            uint256 fee = (o.price * o.feeBps) / 10_000;
            uint256 providerAmount = o.price + o.bond - fee;
            o.token.safeTransfer(o.provider, providerAmount);
            if (fee > 0) o.token.safeTransfer(feeRecipient, fee);
            emit Released(orderId, providerAmount, fee);
        } else {
            uint256 buyerAmount = o.price + o.bond;
            o.token.safeTransfer(o.buyer, buyerAmount);
            emit Slashed(orderId, buyerAmount);
        }
    }
}
