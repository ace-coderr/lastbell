// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice $WIF exposes burn(uint256) and burnFrom(address,uint256) (verified PonsV2LauncherToken).
interface IBurnableERC20 is IERC20 {
    function burn(uint256 amount) external;
}
