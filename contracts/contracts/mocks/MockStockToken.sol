// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Mimics the issuer powers of the real Stock token that matter to Lastbell:
/// a transfer pause, an oracle pause flag, a blocklist and admin burns. `broken` makes the issuer flag
/// getters revert, as a token upgrade that dropped them would. Not deployed to mainnet.
contract MockStockToken is ERC20 {
    error IsPaused();
    error Blocked();

    bool private _paused;
    bool private _oraclePaused;
    bool public broken;
    uint256 public uiMultiplier = 1e18;
    uint8 private immutable _decimals;
    mapping(address => bool) public blocked;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _decimals = 18;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    function paused() external view returns (bool) {
        require(!broken, "paused() removed");
        return _paused;
    }

    function oraclePaused() external view returns (bool) {
        require(!broken, "oraclePaused() removed");
        return _oraclePaused;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function adminBurn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function setPaused(bool value) external {
        _paused = value;
    }

    function setOraclePaused(bool value) external {
        _oraclePaused = value;
    }

    function setBroken(bool value) external {
        broken = value;
    }

    function setBlocked(address account, bool value) external {
        blocked[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (_paused) revert IsPaused();
        if (blocked[from] || blocked[to]) revert Blocked();
        super._update(from, to, value);
    }
}
