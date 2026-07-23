// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {LuckySplit} from "../src/LuckySplit.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract LuckySplitTest is Test {
    LuckySplit public ls;
    MockUSDC public usdc;

    address public owner = address(this);
    address public operator = makeAddr("operator");
    address public organizer = makeAddr("organizer");
    address public stranger = makeAddr("stranger");

    uint256 constant ONE_USDC = 1e6;

    function setUp() public {
        usdc = new MockUSDC();
        ls = new LuckySplit(address(usdc), operator);

        usdc.mint(organizer, 1_000_000 * ONE_USDC);
        vm.prank(organizer);
        usdc.approve(address(ls), type(uint256).max);
    }

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    function _sortedWallets(uint256 n) internal pure returns (address[] memory wallets) {
        wallets = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            // deterministic, strictly ascending addresses
            wallets[i] = address(uint160(0x1000 + i));
        }
    }

    function _createFundedEvent(uint8 numWallets, LuckySplit.RewardMode mode, uint8 k, uint256 fixedAmount, uint256 deposit)
        internal
        returns (uint256 eventId, address[] memory wallets)
    {
        wallets = _sortedWallets(numWallets);
        vm.prank(organizer);
        eventId = ls.createEvent(wallets, mode, k, fixedAmount);

        vm.prank(organizer);
        ls.fundEvent(eventId, deposit);
    }

    function _commitAndReveal(uint256 eventId, bytes32 secret) internal {
        bytes32 hash = keccak256(abi.encode(secret));
        uint256 target = block.number + 20;

        vm.prank(operator);
        ls.commit(eventId, hash, target);

        vm.roll(target);
        vm.prank(operator);
        ls.reveal(eventId, secret);
    }

    // ---------------------------------------------------------------
    // createEvent
    // ---------------------------------------------------------------

    function test_createEvent_revertsOnTooManyWallets() public {
        address[] memory wallets = _sortedWallets(201);
        vm.prank(organizer);
        vm.expectRevert(LuckySplit.TooManyWallets.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);
    }

    function test_createEvent_revertsBelowMinWinners() public {
        address[] memory wallets = _sortedWallets(5);
        vm.prank(organizer);
        vm.expectRevert(LuckySplit.BelowMinWinners.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 1, ONE_USDC);
    }

    function test_createEvent_revertsOnDuplicateOrUnsortedWallets() public {
        address[] memory wallets = new address[](3);
        wallets[0] = address(0x1000);
        wallets[1] = address(0x1000); // duplicate
        wallets[2] = address(0x2000);

        vm.prank(organizer);
        vm.expectRevert(LuckySplit.WalletsNotSortedOrDuplicate.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);
    }

    function test_createEvent_revertsOnZeroAddressFirstSlot() public {
        address[] memory wallets = new address[](2);
        wallets[0] = address(0);
        wallets[1] = address(0x1000);

        vm.prank(organizer);
        vm.expectRevert(LuckySplit.ZeroAddressWallet.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);
    }

    function test_createEvent_fixedModeRequiresNonZeroAmount() public {
        address[] memory wallets = _sortedWallets(5);
        vm.prank(organizer);
        vm.expectRevert(LuckySplit.InvalidFixedAmount.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, 0);
    }

    function test_createEvent_randomModeRejectsNonZeroFixedAmount() public {
        address[] memory wallets = _sortedWallets(5);
        vm.prank(organizer);
        vm.expectRevert(LuckySplit.InvalidFixedAmount.selector);
        ls.createEvent(wallets, LuckySplit.RewardMode.RandomSplit, 2, ONE_USDC);
    }

    function test_createEvent_publishesWalletListEvent() public {
        address[] memory wallets = _sortedWallets(5);
        vm.expectEmit(true, true, false, false);
        emit LuckySplit.WalletListPublished(0, wallets);
        vm.prank(organizer);
        ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);
    }

    // ---------------------------------------------------------------
    // fundEvent
    // ---------------------------------------------------------------

    function test_fundEvent_fixedMode_revertsOnMismatch() public {
        address[] memory wallets = _sortedWallets(5);
        vm.prank(organizer);
        uint256 eventId = ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);

        vm.prank(organizer);
        vm.expectRevert(LuckySplit.FundedAmountMismatch.selector);
        ls.fundEvent(eventId, 3 * ONE_USDC); // should be exactly 2 * ONE_USDC
    }

    function test_fundEvent_fixedMode_succeedsOnExactMatch() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);
        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Funded));
        assertEq(usdc.balanceOf(address(ls)), 2 * ONE_USDC);
    }

    function test_fundEvent_onlyOrganizerCanFund() public {
        address[] memory wallets = _sortedWallets(5);
        vm.prank(organizer);
        uint256 eventId = ls.createEvent(wallets, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(LuckySplit.NotOrganizer.selector);
        ls.fundEvent(eventId, 2 * ONE_USDC);
    }

    function test_fundEvent_randomMode_k2AlwaysSatisfiesCap() public {
        // K=2 is the documented minimum-feasible case: 2 * 60% = 120% >= 100%.
        (uint256 eventId,) = _createFundedEvent(10, LuckySplit.RewardMode.RandomSplit, 2, 0, 1000 * ONE_USDC);
        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Funded));
    }

    // ---------------------------------------------------------------
    // cancelEvent
    // ---------------------------------------------------------------

    function test_cancelEvent_refundsAndTransitionsState() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);

        uint256 balBefore = usdc.balanceOf(organizer);
        vm.prank(organizer);
        ls.cancelEvent(eventId);

        assertEq(usdc.balanceOf(organizer), balBefore + 2 * ONE_USDC);
        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Cancelled));
    }

    function test_cancelEvent_revertsAfterCommit() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);

        vm.prank(operator);
        ls.commit(eventId, keccak256(abi.encode(bytes32("secret"))), block.number + 20);

        vm.prank(organizer);
        vm.expectRevert(abi.encodeWithSelector(LuckySplit.WrongState.selector, LuckySplit.EventState.Funded, LuckySplit.EventState.Committed));
        ls.cancelEvent(eventId);
    }

    // ---------------------------------------------------------------
    // commit / reveal
    // ---------------------------------------------------------------

    function test_commit_onlyOperator() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);

        vm.prank(stranger);
        vm.expectRevert(LuckySplit.NotOperator.selector);
        ls.commit(eventId, keccak256(abi.encode(bytes32("secret"))), block.number + 20);
    }

    function test_commit_revertsOnDelayOutOfRange() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);

        vm.prank(operator);
        vm.expectRevert(LuckySplit.CommitDelayOutOfRange.selector);
        ls.commit(eventId, keccak256(abi.encode(bytes32("secret"))), block.number + 5);
    }

    function test_reveal_revertsBeforeTargetBlock() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);
        bytes32 secret = bytes32("secret");

        vm.prank(operator);
        ls.commit(eventId, keccak256(abi.encode(secret)), block.number + 20);

        vm.prank(operator);
        vm.expectRevert(LuckySplit.TargetBlockNotReached.selector);
        ls.reveal(eventId, secret);
    }

    function test_reveal_revertsOnWrongSecret() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);
        bytes32 secret = bytes32("secret");
        uint256 target = block.number + 20;

        vm.prank(operator);
        ls.commit(eventId, keccak256(abi.encode(secret)), target);

        vm.roll(target);
        vm.prank(operator);
        vm.expectRevert(LuckySplit.SecretMismatch.selector);
        ls.reveal(eventId, bytes32("wrong-secret"));
    }

    function test_reveal_fixedMode_selectsDistinctWinnersWithFixedAmount() public {
        (uint256 eventId,) = _createFundedEvent(10, LuckySplit.RewardMode.FixedAmount, 3, ONE_USDC, 3 * ONE_USDC);
        _commitAndReveal(eventId, bytes32("secret-1"));

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        assertEq(winners.length, 3);

        for (uint256 i = 0; i < winners.length; i++) {
            assertEq(winners[i].amount, ONE_USDC);
            assertFalse(winners[i].paid);
            for (uint256 j = i + 1; j < winners.length; j++) {
                assertTrue(winners[i].wallet != winners[j].wallet, "winners must be distinct");
            }
        }

        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Distributing));
    }

    function test_reveal_randomMode_amountsSumToDepositAndRespectCap() public {
        uint256 deposit = 1000 * ONE_USDC;
        (uint256 eventId,) = _createFundedEvent(20, LuckySplit.RewardMode.RandomSplit, 4, 0, deposit);
        _commitAndReveal(eventId, bytes32("seed-xyz"));

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        uint256 sum;
        uint256 cap = (deposit * 6000) / 10000;
        for (uint256 i = 0; i < winners.length; i++) {
            assertGt(winners[i].amount, 0);
            assertLe(winners[i].amount, cap);
            sum += winners[i].amount;
        }
        assertEq(sum, deposit);
    }

    function test_reveal_randomMode_k2WorksAtCapBoundary() public {
        // The documented edge case: K=2, each capped at 60%, 2*60%=120% >= 100%.
        uint256 deposit = 100 * ONE_USDC;
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.RandomSplit, 2, 0, deposit);
        _commitAndReveal(eventId, bytes32("k2-seed"));

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        assertEq(winners.length, 2);
        assertEq(winners[0].amount + winners[1].amount, deposit);
    }

    function test_reveal_isDeterministicGivenSameSeed() public {
        // Same wallets/seed must reproduce the same winners+amounts -- this is
        // the property that makes the design independently verifiable off-chain.
        uint256 deposit = 500 * ONE_USDC;
        (uint256 eventIdA,) = _createFundedEvent(20, LuckySplit.RewardMode.RandomSplit, 3, 0, deposit);
        _commitAndReveal(eventIdA, bytes32("same-seed"));
        LuckySplit.WinnerInfo[] memory winnersA = ls.getWinners(eventIdA);

        (uint256 eventIdB,) = _createFundedEvent(20, LuckySplit.RewardMode.RandomSplit, 3, 0, deposit);
        _commitAndReveal(eventIdB, bytes32("same-seed"));
        LuckySplit.WinnerInfo[] memory winnersB = ls.getWinners(eventIdB);

        for (uint256 i = 0; i < winnersA.length; i++) {
            assertEq(winnersA[i].wallet, winnersB[i].wallet);
            assertEq(winnersA[i].amount, winnersB[i].amount);
        }
    }

    // ---------------------------------------------------------------
    // distribute
    // ---------------------------------------------------------------

    function test_distribute_paysAllWinnersAndCompletes() public {
        (uint256 eventId,) = _createFundedEvent(10, LuckySplit.RewardMode.FixedAmount, 3, ONE_USDC, 3 * ONE_USDC);
        _commitAndReveal(eventId, bytes32("secret"));

        vm.prank(operator);
        ls.distribute(eventId, 10);

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        for (uint256 i = 0; i < winners.length; i++) {
            assertTrue(winners[i].paid);
            assertFalse(winners[i].blocked);
            assertEq(usdc.balanceOf(winners[i].wallet), ONE_USDC);
        }

        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Completed));
    }

    function test_distribute_resumesAcrossBatchesIdempotently() public {
        (uint256 eventId,) = _createFundedEvent(10, LuckySplit.RewardMode.FixedAmount, 5, ONE_USDC, 5 * ONE_USDC);
        _commitAndReveal(eventId, bytes32("secret"));

        vm.prank(operator);
        ls.distribute(eventId, 2); // partial batch
        (,,, LuckySplit.EventState state1,,,,, , uint256 nextIdx1,) = ls.getEventSummary(eventId);
        assertEq(uint8(state1), uint8(LuckySplit.EventState.Distributing));
        assertEq(nextIdx1, 2);

        vm.prank(operator);
        ls.distribute(eventId, 2); // second partial batch
        vm.prank(operator);
        ls.distribute(eventId, 100); // finishing batch, oversized on purpose

        (,,, LuckySplit.EventState state2,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state2), uint8(LuckySplit.EventState.Completed));

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        for (uint256 i = 0; i < winners.length; i++) {
            assertTrue(winners[i].paid);
        }
    }

    function test_distribute_isolatesBlockedWinnerAndRefundsOrganizer() public {
        (uint256 eventId, address[] memory wallets) = _createFundedEvent(10, LuckySplit.RewardMode.FixedAmount, 3, ONE_USDC, 3 * ONE_USDC);

        // Block one of the wallets in the pool before reveal (any of these
        // wallets could end up selected as a winner or not -- assert on
        // whichever wallet actually gets picked, mirroring
        // LuckySplit_doc.md section 6's blocklist edge case).
        usdc.setBlocked(wallets[0], true);

        _commitAndReveal(eventId, bytes32("secret"));

        vm.prank(operator);
        ls.distribute(eventId, 10);

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        uint256 blockedCount;
        uint256 expectedRefund;
        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i].wallet == wallets[0]) {
                assertTrue(winners[i].blocked);
                assertFalse(winners[i].paid);
                expectedRefund += winners[i].amount;
                blockedCount++;
            } else {
                assertTrue(winners[i].paid);
                assertFalse(winners[i].blocked);
            }
        }

        (,,, LuckySplit.EventState state,,,uint256 organizerRefundable,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Completed));
        // Event still completes even with an isolated failure -- the
        // refundable dust is flushed back to the organizer automatically.
        assertEq(organizerRefundable, 0);
        if (blockedCount > 0) {
            assertGt(usdc.balanceOf(organizer), 999_999 * ONE_USDC - 3 * ONE_USDC + expectedRefund - 1);
        }
    }

    function test_distribute_onlyOperator() public {
        (uint256 eventId,) = _createFundedEvent(10, LuckySplit.RewardMode.FixedAmount, 3, ONE_USDC, 3 * ONE_USDC);
        _commitAndReveal(eventId, bytes32("secret"));

        vm.prank(stranger);
        vm.expectRevert(LuckySplit.NotOperator.selector);
        ls.distribute(eventId, 10);
    }

    // ---------------------------------------------------------------
    // pause
    // ---------------------------------------------------------------

    function test_pause_blocksNewStateTransitionsButNotReads() public {
        (uint256 eventId,) = _createFundedEvent(5, LuckySplit.RewardMode.FixedAmount, 2, ONE_USDC, 2 * ONE_USDC);

        ls.pause();

        vm.prank(operator);
        vm.expectRevert();
        ls.commit(eventId, keccak256(abi.encode(bytes32("secret"))), block.number + 20);

        // Reads still work while paused.
        ls.getEventSummary(eventId);

        ls.unpause();
        vm.prank(operator);
        ls.commit(eventId, keccak256(abi.encode(bytes32("secret"))), block.number + 20); // no revert now
    }

    function test_pause_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        ls.pause();
    }

    // ---------------------------------------------------------------
    // Max scale (200 wallets) -- gas sanity check
    // ---------------------------------------------------------------

    function test_maxScale_200Wallets_fullLifecycleCompletes() public {
        (uint256 eventId,) = _createFundedEvent(200, LuckySplit.RewardMode.RandomSplit, 50, 0, 10_000 * ONE_USDC);
        _commitAndReveal(eventId, bytes32("max-scale-seed"));

        LuckySplit.WinnerInfo[] memory winners = ls.getWinners(eventId);
        assertEq(winners.length, 50);

        vm.prank(operator);
        ls.distribute(eventId, 200); // single batch covering all winners

        (,,, LuckySplit.EventState state,,,,,,,) = ls.getEventSummary(eventId);
        assertEq(uint8(state), uint8(LuckySplit.EventState.Completed));
    }
}
