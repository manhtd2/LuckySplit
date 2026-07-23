// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title LuckySplit
/// @notice Surprise USDC airdrop events with on-chain commit-reveal randomness on Arc.
/// @dev Winner selection AND amount splitting run fully on-chain in `reveal()` so the
///      result is independently reproducible by anyone from public data (wallet list,
///      commit hash, revealed secret, block hash) -- no need to trust the backend's math.
///      Immutable by design: no proxy, no upgrade path. The only safety valve is a
///      scoped `pause` that halts new state transitions -- it can never alter a result
///      that has already been computed or a transfer that has already happened.
contract LuckySplit is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    /// @dev Hard floor from LuckySplit_doc.md section 4: with a 60% per-wallet cap,
    ///      K=1 is mathematically impossible (would need one wallet to take 100%).
    ///      K=2 is the minimum feasible value (2 * 60% = 120% >= 100%).
    uint8 public constant MIN_WINNERS = 2;

    uint16 public constant MAX_WALLETS = 200;

    /// @dev Basis points (10_000 = 100%). Mode 1 (RandomSplit) caps any single
    ///      winner at 60% of the pot.
    uint16 public constant MAX_WINNER_BPS = 6_000;
    uint16 private constant BPS_DENOMINATOR = 10_000;

    /// @dev USDC on Arc uses 6 decimals via the ERC-20 interface.
    uint256 public constant MAX_FUND_AMOUNT = 10_000 * 1e6;

    uint256 public constant MIN_COMMIT_DELAY_BLOCKS = 20;
    uint256 public constant MAX_COMMIT_DELAY_BLOCKS = 30;

    /// @dev EIP-2935 historical block hash predeploy. Confirmed in
    ///      LuckySplit_doc.md section 13.3: Arc runs EIP-2935 "behave as on
    ///      Ethereum", so the canonical Ethereum address applies unchanged.
    ///      Extends the reveal window from 256 blocks (raw BLOCKHASH) to
    ///      8191 blocks, covering long backend downtime.
    address public constant EIP2935_HISTORY_ADDRESS = 0x0000F90827F1C53a10cb7A02335B175320002935;

    IERC20 public immutable usdc;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum EventState {
        Open,
        Funded,
        Committed,
        Distributing,
        Completed,
        Cancelled
    }

    enum RewardMode {
        RandomSplit,
        FixedAmount
    }

    struct WinnerInfo {
        address wallet;
        uint256 amount;
        bool paid;
        bool blocked;
    }

    struct EventData {
        address organizer;
        RewardMode mode;
        uint8 numWinners;
        EventState state;
        uint256 fixedAmountPerWinner; // Mode 2 only
        uint256 totalDeposit;
        uint256 organizerRefundable;
        bytes32 commitHash;
        uint256 targetBlock;
        uint256 nextDistributeIndex;
        address[] wallets;
        WinnerInfo[] winners;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice Single automated operator address that drives the time-triggered
    ///         steps (commit/reveal/distribute) for every event. Distinct from
    ///         each event's `organizer`, which only controls fund/cancel for its
    ///         own event. See LuckySplit_doc.md section 5: the organizer never
    ///         holds the commit secret or influences the reveal, so these steps
    ///         are content-neutral and safe to centralize behind one backend key.
    address public platformOperator;

    uint256 public eventCount;
    mapping(uint256 => EventData) private _events;

    // ---------------------------------------------------------------------
    // Events (for indexing -- see LuckySplit_doc.md section 8, public transparency)
    // ---------------------------------------------------------------------

    event EventCreated(uint256 indexed eventId, address indexed organizer, RewardMode mode, uint8 numWinners, uint256 fixedAmountPerWinner);
    event WalletListPublished(uint256 indexed eventId, address[] wallets);
    event Funded(uint256 indexed eventId, uint256 totalDeposit);
    event EventCancelled(uint256 indexed eventId, uint256 refundAmount);
    event Committed(uint256 indexed eventId, bytes32 commitHash, uint256 targetBlock);
    event Revealed(uint256 indexed eventId, bytes32 secret, bytes32 seed, uint256 historicalBlock);
    event WinnerSelected(uint256 indexed eventId, address indexed wallet, uint256 amount);
    event WinnerPaid(uint256 indexed eventId, address indexed wallet, uint256 amount);
    event WinnerBlocked(uint256 indexed eventId, address indexed wallet, uint256 amount);
    event EventCompleted(uint256 indexed eventId, uint256 organizerRefundable);
    event PlatformOperatorUpdated(address indexed newOperator);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOrganizer();
    error NotOperator();
    error WrongState(EventState expected, EventState actual);
    error TooManyWallets();
    error NotEnoughWallets();
    error BelowMinWinners();
    error WalletsNotSortedOrDuplicate();
    error ZeroAddressWallet();
    error InvalidFixedAmount();
    error DepositTooSmallForCap();
    error DepositOutOfRange();
    error FundedAmountMismatch();
    error CommitDelayOutOfRange();
    error SecretMismatch();
    error TargetBlockNotReached();
    error EventIdOutOfRange();
    error NothingToDistribute();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(address usdcAddress, address initialOperator) Ownable(msg.sender) {
        usdc = IERC20(usdcAddress);
        platformOperator = initialOperator;
        emit PlatformOperatorUpdated(initialOperator);
    }

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier onlyOrganizer(uint256 eventId) {
        if (_events[eventId].organizer != msg.sender) revert NotOrganizer();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != platformOperator && msg.sender != owner()) revert NotOperator();
        _;
    }

    modifier inState(uint256 eventId, EventState expected) {
        EventState actual = _events[eventId].state;
        if (actual != expected) revert WrongState(expected, actual);
        _;
    }

    // ---------------------------------------------------------------------
    // Owner administration
    // ---------------------------------------------------------------------

    function setPlatformOperator(address newOperator) external onlyOwner {
        platformOperator = newOperator;
        emit PlatformOperatorUpdated(newOperator);
    }

    /// @dev Scoped safety valve: only halts new state transitions (fund, cancel,
    ///      commit, reveal, distribute). Cannot alter a result already computed
    ///      by `reveal()` or a transfer already made by `distribute()`.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // 1. Create event
    // ---------------------------------------------------------------------

    /// @param wallets Must be strictly ascending by address value (sort off-chain
    ///        before calling). This enforces both "no zero address" and
    ///        "no duplicates" in a single O(n) pass instead of an O(n^2) scan.
    function createEvent(
        address[] calldata wallets,
        RewardMode mode,
        uint8 numWinners,
        uint256 fixedAmountPerWinner
    ) external whenNotPaused returns (uint256 eventId) {
        if (wallets.length > MAX_WALLETS) revert TooManyWallets();
        if (wallets.length < numWinners) revert NotEnoughWallets();
        if (numWinners < MIN_WINNERS) revert BelowMinWinners();

        if (wallets[0] == address(0)) revert ZeroAddressWallet();
        for (uint256 i = 1; i < wallets.length; i++) {
            if (uint160(wallets[i]) <= uint160(wallets[i - 1])) revert WalletsNotSortedOrDuplicate();
        }

        if (mode == RewardMode.FixedAmount) {
            if (fixedAmountPerWinner == 0) revert InvalidFixedAmount();
        } else {
            if (fixedAmountPerWinner != 0) revert InvalidFixedAmount();
        }

        eventId = eventCount++;
        EventData storage ev = _events[eventId];
        ev.organizer = msg.sender;
        ev.mode = mode;
        ev.numWinners = numWinners;
        ev.fixedAmountPerWinner = fixedAmountPerWinner;
        ev.state = EventState.Open;
        ev.wallets = wallets;

        emit EventCreated(eventId, msg.sender, mode, numWinners, fixedAmountPerWinner);
        emit WalletListPublished(eventId, wallets);
    }

    // ---------------------------------------------------------------------
    // 2. Fund event
    // ---------------------------------------------------------------------

    function fundEvent(uint256 eventId, uint256 amount)
        external
        whenNotPaused
        nonReentrant
        onlyOrganizer(eventId)
        inState(eventId, EventState.Open)
    {
        if (amount == 0 || amount > MAX_FUND_AMOUNT) revert DepositOutOfRange();

        EventData storage ev = _events[eventId];

        if (ev.mode == RewardMode.FixedAmount) {
            if (amount != uint256(ev.numWinners) * ev.fixedAmountPerWinner) revert FundedAmountMismatch();
        } else {
            // Mode 1 invariant required by the on-chain split algorithm in
            // _selectWinnersAndSplit: total deposit must fit within
            // numWinners slots each capped at MAX_WINNER_BPS. True in
            // practice for any non-dust deposit given numWinners >= 2, but
            // checked explicitly so a bad deposit fails fast here instead of
            // reverting deep inside reveal() after commit is already locked in.
            uint256 cap = (amount * MAX_WINNER_BPS) / BPS_DENOMINATOR;
            if (amount > cap * ev.numWinners) revert DepositTooSmallForCap();
        }

        ev.totalDeposit = amount;
        ev.state = EventState.Funded;

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Funded(eventId, amount);
    }

    // ---------------------------------------------------------------------
    // 3. Cancel (organizer opt-out, Funded state only)
    // ---------------------------------------------------------------------

    function cancelEvent(uint256 eventId)
        external
        whenNotPaused
        nonReentrant
        onlyOrganizer(eventId)
        inState(eventId, EventState.Funded)
    {
        EventData storage ev = _events[eventId];
        uint256 refund = ev.totalDeposit;
        ev.state = EventState.Cancelled;
        ev.totalDeposit = 0;

        usdc.safeTransfer(ev.organizer, refund);

        emit EventCancelled(eventId, refund);
    }

    // ---------------------------------------------------------------------
    // 4. Commit ("Bắt đầu" -- exactly once, no take-backs)
    // ---------------------------------------------------------------------

    function commit(uint256 eventId, bytes32 commitHash, uint256 targetBlock)
        external
        whenNotPaused
        onlyOperator
        inState(eventId, EventState.Funded)
    {
        if (targetBlock < block.number + MIN_COMMIT_DELAY_BLOCKS || targetBlock > block.number + MAX_COMMIT_DELAY_BLOCKS) {
            revert CommitDelayOutOfRange();
        }

        EventData storage ev = _events[eventId];
        ev.commitHash = commitHash;
        ev.targetBlock = targetBlock;
        ev.state = EventState.Committed;

        emit Committed(eventId, commitHash, targetBlock);
    }

    // ---------------------------------------------------------------------
    // 5. Reveal -- winner selection + amount split, fully on-chain
    // ---------------------------------------------------------------------

    function reveal(uint256 eventId, bytes32 secret)
        external
        whenNotPaused
        onlyOperator
        inState(eventId, EventState.Committed)
    {
        EventData storage ev = _events[eventId];

        if (block.number < ev.targetBlock) revert TargetBlockNotReached();
        if (keccak256(abi.encode(secret)) != ev.commitHash) revert SecretMismatch();

        (bytes32 historicalHash, uint256 historicalBlock) = _getBlockHash(ev.targetBlock);
        bytes32 seed = keccak256(abi.encode(secret, historicalHash));

        emit Revealed(eventId, secret, seed, historicalBlock);

        _selectWinnersAndSplit(eventId, ev, seed);

        ev.state = EventState.Distributing;
    }

    /// @dev Returns the block hash for `targetBlock`, using EIP-2935 history
    ///      once it falls outside the native BLOCKHASH 256-block window.
    function _getBlockHash(uint256 targetBlock) private view returns (bytes32 hash, uint256 usedBlock) {
        if (block.number - targetBlock <= 256) {
            return (blockhash(targetBlock), targetBlock);
        }

        (bool ok, bytes memory data) = EIP2935_HISTORY_ADDRESS.staticcall(abi.encode(targetBlock));
        require(ok && data.length == 32, "EIP-2935 lookup failed");
        return (abi.decode(data, (bytes32)), targetBlock);
    }

    /// @dev Fisher-Yates picks K distinct wallets, then splits `totalDeposit`
    ///      among them. Deterministic given `seed` -- anyone can recompute this
    ///      exact function off-chain against the public wallet list and the
    ///      revealed seed to independently verify the result.
    function _selectWinnersAndSplit(uint256 eventId, EventData storage ev, bytes32 seed) private {
        uint256 n = ev.wallets.length;
        uint256 k = ev.numWinners;
        address[] memory pool = ev.wallets;

        address[] memory selected = new address[](k);
        for (uint256 i = 0; i < k; i++) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, "pick", i))) % (n - i));
            (pool[i], pool[j]) = (pool[j], pool[i]);
            selected[i] = pool[i];
        }

        uint256[] memory amounts = new uint256[](k);
        if (ev.mode == RewardMode.FixedAmount) {
            for (uint256 i = 0; i < k; i++) {
                amounts[i] = ev.fixedAmountPerWinner;
            }
        } else {
            amounts = _splitRandomWithCap(ev.totalDeposit, k, seed);
        }

        for (uint256 i = 0; i < k; i++) {
            ev.winners.push(WinnerInfo({wallet: selected[i], amount: amounts[i], paid: false, blocked: false}));
            emit WinnerSelected(eventId, selected[i], amounts[i]);
        }
    }

    /// @dev Bounded random composition of `total` into `k` positive parts, each
    ///      never exceeding MAX_WINNER_BPS of `total`. At every step the
    ///      remaining amount is kept inside [1 * winnersLeft, cap * winnersLeft]
    ///      so the invariant holds all the way to the last winner -- no
    ///      post-hoc clamp-and-redistribute pass needed. Requires
    ///      total <= cap * k, already enforced in fundEvent.
    function _splitRandomWithCap(uint256 total, uint256 k, bytes32 seed) private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](k);
        uint256 cap = (total * MAX_WINNER_BPS) / BPS_DENOMINATOR;
        uint256 remaining = total;
        uint256 winnersLeft = k;

        for (uint256 i = 0; i < k; i++) {
            if (winnersLeft == 1) {
                amounts[i] = remaining;
                break;
            }

            uint256 restSlots = winnersLeft - 1;
            uint256 maxForThis = remaining - restSlots; // leave >= 1 per remaining winner
            if (maxForThis > cap) maxForThis = cap;

            uint256 minForThis = 1;
            uint256 capForRest = cap * restSlots;
            if (remaining > capForRest) {
                uint256 floorNeeded = remaining - capForRest; // don't leave more than the rest can absorb
                if (floorNeeded > minForThis) minForThis = floorNeeded;
            }

            uint256 span = maxForThis - minForThis + 1;
            uint256 pick = minForThis + (uint256(keccak256(abi.encode(seed, "amount", i))) % span);

            amounts[i] = pick;
            remaining -= pick;
            winnersLeft -= 1;
        }
    }

    // ---------------------------------------------------------------------
    // 6. Distribute -- resumable batches, per-wallet failure isolation
    // ---------------------------------------------------------------------

    /// @param batchSize Max number of winners to process in this call. Callable
    ///        repeatedly and idempotently -- already-`paid` winners are skipped,
    ///        so a retry after a mid-batch failure resumes safely using the
    ///        exact same winner list and amounts computed in reveal().
    function distribute(uint256 eventId, uint256 batchSize)
        external
        whenNotPaused
        nonReentrant
        onlyOperator
        inState(eventId, EventState.Distributing)
    {
        EventData storage ev = _events[eventId];
        uint256 total = ev.winners.length;
        uint256 start = ev.nextDistributeIndex;
        if (start >= total) revert NothingToDistribute();

        uint256 end = start + batchSize;
        if (end > total) end = total;

        for (uint256 i = start; i < end; i++) {
            WinnerInfo storage w = ev.winners[i];

            try usdc.transfer(w.wallet, w.amount) returns (bool success) {
                if (success) {
                    w.paid = true;
                    emit WinnerPaid(eventId, w.wallet, w.amount);
                } else {
                    w.blocked = true;
                    ev.organizerRefundable += w.amount;
                    emit WinnerBlocked(eventId, w.wallet, w.amount);
                }
            } catch {
                w.blocked = true;
                ev.organizerRefundable += w.amount;
                emit WinnerBlocked(eventId, w.wallet, w.amount);
            }
        }

        ev.nextDistributeIndex = end;

        if (end == total) {
            ev.state = EventState.Completed;
            _flushOrganizerRefund(ev);
            emit EventCompleted(eventId, ev.organizerRefundable);
        }
    }

    /// @dev Isolated in its own try/catch: if the organizer's own address is
    ///      (or becomes) blocklisted, this must NOT revert the surrounding
    ///      distribute() call -- that would undo the winner payments that
    ///      already succeeded earlier in the same transaction. Any amount
    ///      that fails to flush stays recorded in `organizerRefundable` and
    ///      can be retried later via `retryOrganizerRefund`.
    function _flushOrganizerRefund(EventData storage ev) private {
        uint256 refundable = ev.organizerRefundable;
        if (refundable == 0) return;

        try usdc.transfer(ev.organizer, refundable) returns (bool success) {
            if (success) ev.organizerRefundable = 0;
        } catch {
            // leave organizerRefundable untouched for a later retry
        }
    }

    /// @notice Retries flushing any organizer-refundable dust left over after
    ///         `distribute()` completed an event but the final transfer to the
    ///         organizer failed (e.g. their address was blocklisted at the time).
    function retryOrganizerRefund(uint256 eventId)
        external
        whenNotPaused
        nonReentrant
        onlyOperator
        inState(eventId, EventState.Completed)
    {
        EventData storage ev = _events[eventId];
        if (ev.organizerRefundable == 0) revert NothingToDistribute();
        _flushOrganizerRefund(ev);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getEventSummary(uint256 eventId)
        external
        view
        returns (
            address organizer,
            RewardMode mode,
            uint8 numWinners,
            EventState state,
            uint256 fixedAmountPerWinner,
            uint256 totalDeposit,
            uint256 organizerRefundable,
            bytes32 commitHash,
            uint256 targetBlock,
            uint256 nextDistributeIndex,
            uint256 walletCount
        )
    {
        if (eventId >= eventCount) revert EventIdOutOfRange();
        EventData storage ev = _events[eventId];
        return (
            ev.organizer,
            ev.mode,
            ev.numWinners,
            ev.state,
            ev.fixedAmountPerWinner,
            ev.totalDeposit,
            ev.organizerRefundable,
            ev.commitHash,
            ev.targetBlock,
            ev.nextDistributeIndex,
            ev.wallets.length
        );
    }

    function getWallets(uint256 eventId) external view returns (address[] memory) {
        if (eventId >= eventCount) revert EventIdOutOfRange();
        return _events[eventId].wallets;
    }

    function getWinners(uint256 eventId) external view returns (WinnerInfo[] memory) {
        if (eventId >= eventCount) revert EventIdOutOfRange();
        return _events[eventId].winners;
    }
}
