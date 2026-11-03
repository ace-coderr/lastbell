// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Lastbell} from "../Lastbell.sol";

/// @notice Token with a transfer hook, like an ERC-777 or a malicious Stock token would have. Whenever armed,
/// every transfer calls back into `target`. Not deployed to mainnet.
contract MockHostileToken is ERC20 {
    address public target;
    bool public armed;
    bool private _inside;
    uint256 public hits;

    constructor() ERC20("Hostile", "HOST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function oraclePaused() external pure returns (bool) {
        return false;
    }

    function paused() external pure returns (bool) {
        return false;
    }

    function arm(address target_) external {
        target = target_;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && !_inside) {
            _inside = true;
            hits++;
            (bool ok,) = target.call(abi.encodeWithSignature("reenter()"));
            ok; // the attacker records its own result
            _inside = false;
        }
    }
}

/// @notice An order owner that tries to re-enter Lastbell from inside a token hook and records what happened.
contract MockReentrancyAttacker {
    Lastbell public immutable lb;
    uint256 public victim;
    bool public lastOk;
    bytes4 public lastError;
    uint256 public calls;

    constructor(Lastbell lb_) {
        lb = lb_;
    }

    function approveAll(IERC20 token) external {
        token.approve(address(lb), type(uint256).max);
    }

    function place(uint8 market, uint256 amountIn, uint256 trigger, uint16 slippage, uint64 expiry, uint256 fee)
        external
        returns (uint256)
    {
        return lb.placeOrder(market, Lastbell.Kind.StopLoss, amountIn, trigger, slippage, expiry, fee);
    }

    function cancel(uint256 id) external {
        lb.cancel(id);
    }

    function setVictim(uint256 id) external {
        victim = id;
    }

    /// @dev Called by the hostile token mid-transfer. Cancelling its own open order would succeed if unguarded.
    function reenter() external {
        calls++;
        try lb.cancel(victim) {
            lastOk = true;
            lastError = bytes4(0);
        } catch (bytes memory err) {
            lastOk = false;
            lastError = bytes4(err);
        }
    }
}
