// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IBurnableERC20} from "./interfaces/IBurnableERC20.sol";

/// @title KeeperRegistry
/// @notice Keepers lock $WIF to execute orders. Each live claim is backed by `slashAmount` of bond,
/// and a keeper that claims an order but doesn't fill it in time has that amount burned.
/// Bonds can't be withdrawn while a claim is live. No one else can touch a bond.
abstract contract KeeperRegistry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Keeper {
        uint128 bond;
        uint32 activeClaims;
        uint32 fills;
        uint32 slashes;
    }

    IBurnableERC20 public immutable wif;
    uint256 public immutable minBond;
    uint256 public immutable slashAmount;

    mapping(address => Keeper) public keepers;
    uint256 public totalBonded;
    uint256 public totalSlashed;

    event Bonded(address indexed keeper, uint256 amount, uint256 bond);
    event Unbonded(address indexed keeper, uint256 amount, uint256 bond);
    event KeeperSlashed(address indexed keeper, uint256 indexed orderId, uint256 burned);

    error ZeroAmount();
    error ClaimsLive();
    error BondTooSmall();
    error InsufficientBond();
    error BadParams();

    constructor(IBurnableERC20 wif_, uint256 minBond_, uint256 slashAmount_) {
        if (address(wif_) == address(0) || slashAmount_ == 0 || minBond_ < slashAmount_) revert BadParams();
        wif = wif_;
        minBond = minBond_;
        slashAmount = slashAmount_;
    }

    function bond(uint256 amount) external nonReentrant {
        uint256 received = _pull(IERC20(address(wif)), amount);
        Keeper storage k = keepers[msg.sender];
        uint256 newBond = k.bond + received;
        if (newBond < minBond) revert BondTooSmall();
        k.bond = uint128(newBond);
        totalBonded += received;
        emit Bonded(msg.sender, received, newBond);
    }

    function unbond(uint256 amount) external nonReentrant {
        Keeper storage k = keepers[msg.sender];
        if (amount == 0) revert ZeroAmount();
        if (k.activeClaims != 0) revert ClaimsLive();
        if (amount > k.bond) revert InsufficientBond();
        uint256 remaining = k.bond - amount;
        if (remaining != 0 && remaining < minBond) revert BondTooSmall();
        k.bond = uint128(remaining);
        totalBonded -= amount;
        IERC20(address(wif)).safeTransfer(msg.sender, amount);
        emit Unbonded(msg.sender, amount, remaining);
    }

    function isActiveKeeper(address keeper) public view returns (bool) {
        return keepers[keeper].bond >= minBond;
    }

    /// @notice How many orders a keeper may hold claimed at once; every claim stays fully slashable.
    function claimCapacity(address keeper) public view returns (uint256) {
        return keepers[keeper].bond / slashAmount;
    }

    function _slash(address keeper, uint256 orderId) internal {
        Keeper storage k = keepers[keeper];
        uint256 amount = k.bond < slashAmount ? k.bond : slashAmount;
        k.bond -= uint128(amount);
        k.activeClaims -= 1;
        k.slashes += 1;
        totalBonded -= amount;
        totalSlashed += amount;
        if (amount != 0) wif.burn(amount);
        emit KeeperSlashed(keeper, orderId, amount);
    }

    /// @dev Pulls `amount` and returns what actually arrived, so odd tokens can't inflate balances.
    function _pull(IERC20 token, uint256 amount) internal returns (uint256 received) {
        if (amount == 0) revert ZeroAmount();
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        received = token.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
    }
}
