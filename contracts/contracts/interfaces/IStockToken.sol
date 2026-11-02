// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice The parts of the Robinhood Stock token (verified `Stock` implementation) that Lastbell reads.
interface IStockToken is IERC20 {
    /// @dev Set by the issuer around corporate actions; the feed holds its last value while true.
    function oraclePaused() external view returns (bool);

    /// @dev Issuer-wide transfer pause.
    function paused() external view returns (bool);

    function uiMultiplier() external view returns (uint256);
}
