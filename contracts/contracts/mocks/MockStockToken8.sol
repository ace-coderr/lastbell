// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {MockStockToken} from "./MockStockToken.sol";

/// @notice A Stock token with 8 decimals, to prove Lastbell reads decimals instead of assuming 18. Not deployed.
contract MockStockToken8 is MockStockToken {
    constructor() MockStockToken("Stock 8", "S8") {}

    function decimals() public pure override returns (uint8) {
        return 8;
    }
}
