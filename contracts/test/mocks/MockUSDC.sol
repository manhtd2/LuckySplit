// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Minimal USDC stand-in for unit tests: 6 decimals + a blocklist toggle
///         that reverts transfers, to exercise LuckySplit's try/catch isolation
///         logic. NOTE: this does NOT reproduce Arc's real blocklist precompile
///         (see LuckySplit_doc.md section 13.1) -- it only lets us unit-test that
///         our contract correctly isolates a reverting transfer.  The real
///         precompile must still be exercised on Arc Testnet directly.
contract MockUSDC is ERC20 {
    mapping(address => bool) public blocked;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlocked(address account, bool isBlocked) external {
        blocked[account] = isBlocked;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        require(!blocked[msg.sender] && !blocked[to], "Blocked address");
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(!blocked[from] && !blocked[to], "Blocked address");
        return super.transferFrom(from, to, amount);
    }
}
