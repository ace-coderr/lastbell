// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mimics the issuer powers of the real Stock token that matter to Lastbell:
/// a transfer pause, an oracle pause flag, a blocklist and admin burns. Not deployed to mainnet.
contract MockStockToken is ERC20 {
    error IsPaused();
    error Blocked();

    bool public paused;
    bool public oraclePaused;
    uint256 public uiMultiplier = 1e18;
    mapping(address => bool) public blocked;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function adminBurn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function setPaused(bool value) external {
        paused = value;
    }

    function setOraclePaused(bool value) external {
        oraclePaused = value;
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert IsPaused();
        if (blocked[from] || blocked[to]) revert Blocked();
        super._update(from, to, value);
    }
}
