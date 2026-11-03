// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {KeeperRegistry} from "./KeeperRegistry.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IBurnableERC20} from "./interfaces/IBurnableERC20.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";
import {ISwapRouter02, IUniswapV3PoolState} from "./interfaces/IUniswapV3.sol";
import {MarketHours} from "./libraries/MarketHours.sol";
import {PriceMath} from "./libraries/PriceMath.sol";

/// @title Lastbell
/// @notice Non-custodial stop-loss and limit-buy orders for Stock Tokens that only execute while the
/// Chainlink feed is fresh and the Uniswap pool agrees with it. Otherwise orders wait: "queued until open".
///
/// Order flow: the user escrows tokens and reserves a prepaid $WIF fee. A bonded keeper `claim`s the order
/// once it's triggered and the gate is fresh, then `fill`s it within `claimWindow`. The swap goes through
/// a fixed pool with a min-out derived on chain from the fresh oracle price. Half the fee is burned, half
/// goes to the keeper. A keeper that claims and doesn't fill loses `slashAmount` of bond (burned).
///
/// There is no owner. Markets and parameters are fixed at deploy. Users can cancel and withdraw at any time.
contract Lastbell is KeeperRegistry {
    using SafeERC20 for IERC20;

    enum Kind {
        StopLoss, // sell stock for quote when price <= trigger
        LimitBuy // buy stock with quote when price <= trigger, never paying more than trigger
    }

    enum Status {
        None,
        Open,
        Filled,
        Cancelled
    }

    /// @dev Mirrors QueueReason in shared/src/freshness.ts, plus the pool band check.
    enum Gate {
        Fresh,
        MarketClosed,
        OraclePaused,
        TokenPaused,
        BadAnswer,
        NotUpdatedSinceOpen,
        OlderThanHeartbeat,
        PoolOutOfBand
    }

    struct Params {
        IBurnableERC20 wif;
        IERC20 quote;
        ISwapRouter02 router;
        uint256 minFee;
        uint256 minBond;
        uint256 slashAmount;
        uint32 claimWindow;
        uint32 graceSeconds;
        uint16 maxSlippageBps;
    }

    struct MarketConfig {
        IStockToken token;
        IAggregatorV3 feed;
        IUniswapV3PoolState pool;
        uint32 heartbeat;
        uint16 maxDeviationBps;
    }

    struct Market {
        IStockToken token;
        IAggregatorV3 feed;
        IUniswapV3PoolState pool;
        uint24 poolFee;
        bool stockIsToken0;
        uint32 heartbeat;
        uint16 maxDeviationBps;
        uint256 stockUnit;
        uint256 feedUnit;
    }

    struct Order {
        address owner;
        uint64 expiry;
        uint8 market;
        Kind kind;
        Status status;
        address claimer;
        uint64 claimDeadline;
        uint16 slippageBps;
        uint128 amountIn;
        uint128 triggerPrice;
        uint128 fee;
        uint128 amountOut;
    }

    struct GateReading {
        Gate status;
        uint256 price;
        uint256 updatedAt;
        uint256 poolPrice;
    }

    uint256 public constant MAX_EXPIRY = 180 days;
    uint256 public constant MAX_MARKETS = 8;

    IERC20 public immutable quote;
    ISwapRouter02 public immutable router;
    uint256 public immutable quoteUnit;
    uint256 public immutable minFee;
    uint32 public immutable claimWindow;
    uint32 public immutable graceSeconds;
    uint16 public immutable maxSlippageBps;

    Market[] internal _markets;
    Order[] internal _orders;
    mapping(address => uint256[]) internal _ordersOf;

    /// @notice Unreserved prepaid $WIF fee balance per user.
    mapping(address => uint256) public feeBalance;
    /// @notice Tokens held for open orders, per token.
    mapping(address => uint256) public escrowed;
    /// @notice Σ feeBalance + Σ fees reserved by open orders.
    uint256 public totalFeeHeld;

    uint256 public totalFeesBurned;
    uint256 public totalKeeperPaid;
    uint256 public totalFills;

    event FeesDeposited(address indexed user, uint256 amount);
    event FeesWithdrawn(address indexed user, uint256 amount);
    event OrderPlaced(
        uint256 indexed id,
        address indexed owner,
        uint8 indexed market,
        Kind kind,
        uint256 amountIn,
        uint256 triggerPrice,
        uint16 slippageBps,
        uint64 expiry,
        uint256 fee
    );
    event OrderCancelled(uint256 indexed id, address indexed by);
    event OrderClaimed(uint256 indexed id, address indexed keeper, uint64 deadline, uint256 price);
    event ClaimCleared(uint256 indexed id, address indexed keeper, bool slashed);
    event OrderFilled(
        uint256 indexed id,
        address indexed keeper,
        uint256 price,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeBurned,
        uint256 keeperFee
    );

    error UnknownMarket();
    error UnknownOrder();
    error NotOpen();
    error NotOwner();
    error NotKeeper();
    error AtCapacity();
    error AlreadyClaimed();
    error NotClaimer();
    error ClaimExpired();
    error ClaimNotExpired();
    error NoClaim();
    error Expired();
    error NotTriggered();
    error GateClosed(Gate status);
    error BadOrder();
    error InsufficientFees();
    error BadSwap();

    constructor(Params memory p, MarketConfig[] memory configs) KeeperRegistry(p.wif, p.minBond, p.slashAmount) {
        if (
            address(p.quote) == address(0) || address(p.router) == address(0) || p.minFee < 2 || p.claimWindow < 30
                || p.maxSlippageBps == 0 || p.maxSlippageBps > 1000 || configs.length == 0 || configs.length > MAX_MARKETS
        ) revert BadParams();
        quote = p.quote;
        router = p.router;
        quoteUnit = 10 ** IERC20Metadata(address(p.quote)).decimals();
        minFee = p.minFee;
        claimWindow = p.claimWindow;
        graceSeconds = p.graceSeconds;
        maxSlippageBps = p.maxSlippageBps;

        for (uint256 i; i < configs.length; ++i) {
            MarketConfig memory c = configs[i];
            if (c.heartbeat == 0 || c.maxDeviationBps == 0 || c.maxDeviationBps > 2000) revert BadParams();
            address t0 = c.pool.token0();
            address t1 = c.pool.token1();
            bool stockIsToken0 = t0 == address(c.token) && t1 == address(p.quote);
            if (!stockIsToken0 && !(t1 == address(c.token) && t0 == address(p.quote))) revert BadParams();
            _markets.push(
                Market({
                    token: c.token,
                    feed: c.feed,
                    pool: c.pool,
                    poolFee: c.pool.fee(),
                    stockIsToken0: stockIsToken0,
                    heartbeat: c.heartbeat,
                    maxDeviationBps: c.maxDeviationBps,
                    stockUnit: 10 ** IERC20Metadata(address(c.token)).decimals(),
                    feedUnit: 10 ** c.feed.decimals()
                })
            );
        }
    }

    // ---------------------------------------------------------------- fees

    function depositFees(uint256 amount) external nonReentrant {
        uint256 received = _pull(IERC20(address(wif)), amount);
        feeBalance[msg.sender] += received;
        totalFeeHeld += received;
        emit FeesDeposited(msg.sender, received);
    }

    function withdrawFees(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > feeBalance[msg.sender]) revert InsufficientFees();
        feeBalance[msg.sender] -= amount;
        totalFeeHeld -= amount;
        IERC20(address(wif)).safeTransfer(msg.sender, amount);
        emit FeesWithdrawn(msg.sender, amount);
    }

    // ---------------------------------------------------------------- orders

    /// @notice Escrows `amountIn` (stock for StopLoss, quote for LimitBuy) and reserves `fee` $WIF.
    /// The fee comes from the prepaid balance first; any shortfall is pulled from the caller's wallet.
    function placeOrder(
        uint8 marketId,
        Kind kind,
        uint256 amountIn,
        uint256 triggerPrice,
        uint16 slippageBps,
        uint64 expiry,
        uint256 fee
    ) external nonReentrant returns (uint256 id) {
        Market storage m = _market(marketId);
        if (
            triggerPrice == 0 || triggerPrice > type(uint128).max || amountIn > type(uint128).max
                || slippageBps > maxSlippageBps || expiry < block.timestamp + claimWindow
                || expiry > block.timestamp + MAX_EXPIRY || fee < minFee || fee > type(uint128).max
        ) revert BadOrder();

        IERC20 tokenIn = kind == Kind.StopLoss ? IERC20(address(m.token)) : quote;
        uint256 received = _pull(tokenIn, amountIn);
        escrowed[address(tokenIn)] += received;
        // An order that would round to a zero minimum output can never fill; refuse it up front.
        if (_minOut(kind, received, triggerPrice, slippageBps, m, triggerPrice) == 0) revert BadOrder();

        uint256 available = feeBalance[msg.sender];
        if (available >= fee) {
            feeBalance[msg.sender] = available - fee;
        } else {
            feeBalance[msg.sender] = 0;
            uint256 shortfall = fee - available;
            if (_pull(IERC20(address(wif)), shortfall) != shortfall) revert InsufficientFees();
            totalFeeHeld += shortfall;
        }

        id = _orders.length;
        _orders.push(
            Order({
                owner: msg.sender,
                expiry: expiry,
                market: marketId,
                kind: kind,
                status: Status.Open,
                claimer: address(0),
                claimDeadline: 0,
                slippageBps: slippageBps,
                amountIn: uint128(received),
                triggerPrice: uint128(triggerPrice),
                fee: uint128(fee),
                amountOut: 0
            })
        );
        _ordersOf[msg.sender].push(id);
        emit OrderPlaced(id, msg.sender, marketId, kind, received, triggerPrice, slippageBps, expiry, fee);
    }

    /// @notice The owner can cancel at any time. Anyone can cancel an expired order; funds always go to the owner.
    function cancel(uint256 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status != Status.Open) revert NotOpen();
        if (msg.sender != o.owner && block.timestamp <= o.expiry) revert NotOwner();
        if (o.claimer != address(0)) _clearClaim(id, o);

        o.status = Status.Cancelled;
        IERC20 tokenIn = _tokenIn(o);
        escrowed[address(tokenIn)] -= o.amountIn;
        feeBalance[o.owner] += o.fee;
        emit OrderCancelled(id, msg.sender);
        tokenIn.safeTransfer(o.owner, o.amountIn);
    }

    // ---------------------------------------------------------------- keepers

    /// @notice Reserve a triggered order for `claimWindow`. Requires a fresh gate and spare bond capacity.
    /// If a previous claim ran out, its keeper is slashed first (the gate is fresh, so it could have filled).
    function claim(uint256 id) external nonReentrant {
        if (!isActiveKeeper(msg.sender)) revert NotKeeper();
        Order storage o = _order(id);
        if (o.status != Status.Open) revert NotOpen();
        if (block.timestamp + claimWindow > o.expiry) revert Expired();

        GateReading memory g = gate(o.market);
        if (g.status != Gate.Fresh) revert GateClosed(g.status);
        if (g.price > o.triggerPrice) revert NotTriggered();

        if (o.claimer != address(0)) {
            if (block.timestamp <= o.claimDeadline) revert AlreadyClaimed();
            _clearClaim(id, o);
        }
        Keeper storage k = keepers[msg.sender];
        if (k.activeClaims >= claimCapacity(msg.sender)) revert AtCapacity();

        k.activeClaims += 1;
        o.claimer = msg.sender;
        o.claimDeadline = uint64(block.timestamp + claimWindow);
        emit OrderClaimed(id, msg.sender, o.claimDeadline, g.price);
    }

    /// @notice Execute a claimed order through its market's pool. Min-out comes from the fresh oracle price.
    function fill(uint256 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status != Status.Open) revert NotOpen();
        if (o.claimer != msg.sender) revert NotClaimer();
        if (block.timestamp > o.claimDeadline) revert ClaimExpired();

        Market storage m = _markets[o.market];
        GateReading memory g = gate(o.market);
        if (g.status != Gate.Fresh) revert GateClosed(g.status);
        uint256 minOut = minAmountOut(o, m, g.price);
        if (minOut == 0) revert BadOrder();

        // effects
        o.status = Status.Filled;
        o.claimer = address(0);
        escrowed[address(_tokenIn(o))] -= o.amountIn;
        Keeper storage k = keepers[msg.sender];
        k.activeClaims -= 1;
        k.fills += 1;
        totalFills += 1;
        (uint256 burned, uint256 keeperFee) = _splitFee(o.fee);

        // interactions
        uint256 amountOut = _swap(o, m, minOut);
        o.amountOut = uint128(amountOut);
        wif.burn(burned);
        IERC20(address(wif)).safeTransfer(msg.sender, keeperFee);
        emit OrderFilled(id, msg.sender, g.price, o.amountIn, amountOut, burned, keeperFee);
    }

    /// @notice The claimer drops its live claim without penalty, for an order it finds it cannot fill
  /// (the pool moved past the slippage limit, the owner is blocked by the issuer, ...). Only while the
  /// window is open: a keeper that goes dark and lets it lapse is still slashed.
    function release(uint256 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status != Status.Open) revert NotOpen();
        if (o.claimer != msg.sender) revert NotClaimer();
        if (block.timestamp > o.claimDeadline) revert ClaimExpired();
        keepers[msg.sender].activeClaims -= 1;
        o.claimer = address(0);
        o.claimDeadline = 0;
        emit ClaimCleared(id, msg.sender, false);
    }

    /// @notice Clears a claim whose window ran out. Slashes the keeper if the gate is fresh right now
    /// (the order was fillable); otherwise releases the claim without penalty.
    function clearExpiredClaim(uint256 id) external nonReentrant {
        Order storage o = _order(id);
        if (o.status != Status.Open) revert NotOpen();
        if (o.claimer == address(0)) revert NoClaim();
        if (block.timestamp <= o.claimDeadline) revert ClaimNotExpired();
        _clearClaim(id, o);
    }

    // ---------------------------------------------------------------- views

    /// @notice The execution gate for a market at the current block.
    function gate(uint8 marketId) public view returns (GateReading memory r) {
        Market storage m = _market(marketId);
        int256 answer;
        try m.feed.latestRoundData() returns (uint80, int256 a, uint256, uint256 updatedAt, uint80) {
            answer = a;
            r.updatedAt = updatedAt;
        } catch {
            r.status = Gate.BadAnswer;
            return r;
        }
        if (answer > 0) r.price = uint256(answer);

        (bool open, uint256 start) = MarketHours.sessionStart(block.timestamp);
        if (!open) {
            r.status = Gate.MarketClosed;
        } else {
            // Issuer flags and pool reads must never make this view revert: cancel() and the UI depend on it.
            (bool oracleOff, bool tokenOff, bool flagsOk) = _issuerFlags(m.token);
            if (!flagsOk) r.status = Gate.BadAnswer;
            else if (oracleOff) r.status = Gate.OraclePaused;
            else if (tokenOff) r.status = Gate.TokenPaused;
            else if (answer <= 0 || r.updatedAt == 0 || r.updatedAt > block.timestamp) r.status = Gate.BadAnswer;
            else if (r.updatedAt < start) r.status = Gate.NotUpdatedSinceOpen;
            else if (block.timestamp - r.updatedAt > uint256(m.heartbeat) + graceSeconds) r.status = Gate.OlderThanHeartbeat;
        }
        if (r.price == 0) return r;

        try m.pool.slot0() returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool) {
            r.poolPrice = PriceMath.poolPrice(sqrtPriceX96, m.stockIsToken0, m.stockUnit, quoteUnit, m.feedUnit);
            if (r.status == Gate.Fresh && PriceMath.deviationBps(r.poolPrice, r.price) > m.maxDeviationBps) {
                r.status = Gate.PoolOutOfBand;
            }
        } catch {
            if (r.status == Gate.Fresh) r.status = Gate.PoolOutOfBand;
        }
    }

    function _issuerFlags(IStockToken t) internal view returns (bool oracleOff, bool tokenOff, bool ok) {
        try t.oraclePaused() returns (bool a) {
            oracleOff = a;
        } catch {
            return (false, false, false);
        }
        try t.paused() returns (bool b) {
            tokenOff = b;
        } catch {
            return (false, false, false);
        }
        ok = true;
    }

    /// @notice Minimum output a fill must deliver at oracle price `price`.
    /// StopLoss: oracle value of the stock minus the user's slippage.
    /// LimitBuy: the larger of "amount at the limit price" and "oracle amount minus slippage".
    function minAmountOut(Order memory o, Market memory m, uint256 price) public view returns (uint256) {
        return _minOut(o.kind, o.amountIn, o.triggerPrice, o.slippageBps, m, price);
    }

    function _minOut(Kind kind, uint256 amountIn, uint256 triggerPrice, uint256 slippageBps, Market memory m, uint256 price)
        internal
        view
        returns (uint256)
    {
        uint256 keep = PriceMath.BPS - slippageBps;
        if (kind == Kind.StopLoss) {
            return PriceMath.quoteValue(amountIn, price, m.stockUnit, quoteUnit, m.feedUnit) * keep / PriceMath.BPS;
        }
        uint256 atLimit = PriceMath.stockValue(amountIn, triggerPrice, m.stockUnit, quoteUnit, m.feedUnit);
        uint256 atOracle = PriceMath.stockValue(amountIn, price, m.stockUnit, quoteUnit, m.feedUnit) * keep / PriceMath.BPS;
        return atLimit > atOracle ? atLimit : atOracle;
    }

    function isMarketOpen() external view returns (bool) {
        return MarketHours.isOpen(block.timestamp);
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function market(uint8 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function orderCount() external view returns (uint256) {
        return _orders.length;
    }

    function getOrder(uint256 id) external view returns (Order memory) {
        return _order(id);
    }

    function getOrders(uint256 from, uint256 count) external view returns (Order[] memory out) {
        uint256 end = from + count > _orders.length ? _orders.length : from + count;
        if (from >= end) return out;
        out = new Order[](end - from);
        for (uint256 i = from; i < end; ++i) out[i - from] = _orders[i];
    }

    function ordersOf(address owner) external view returns (uint256[] memory) {
        return _ordersOf[owner];
    }

    // ---------------------------------------------------------------- internal

    function _clearClaim(uint256 id, Order storage o) internal {
        address keeper = o.claimer;
        bool slash = block.timestamp > o.claimDeadline && gate(o.market).status == Gate.Fresh;
        if (slash) {
            _slash(keeper, id);
        } else {
            keepers[keeper].activeClaims -= 1;
        }
        o.claimer = address(0);
        o.claimDeadline = 0;
        emit ClaimCleared(id, keeper, slash);
    }

    /// @dev Half the fee is burned (rounded down), the keeper gets the rest, so the parts always add up.
    function _splitFee(uint256 fee) internal returns (uint256 burned, uint256 keeperFee) {
        burned = fee / 2;
        keeperFee = fee - burned;
        totalFeeHeld -= fee;
        totalFeesBurned += burned;
        totalKeeperPaid += keeperFee;
    }

    /// @dev Swaps the escrow straight to the owner and checks what actually moved, independent of the router.
    function _swap(Order storage o, Market storage m, uint256 minOut) internal returns (uint256 amountOut) {
        IERC20 tokenIn = _tokenIn(o);
        IERC20 tokenOut = o.kind == Kind.StopLoss ? quote : IERC20(address(m.token));
        uint256 amountIn = o.amountIn;
        address recipient = o.owner;

        uint256 inBefore = tokenIn.balanceOf(address(this));
        uint256 outBefore = tokenOut.balanceOf(recipient);
        tokenIn.forceApprove(address(router), amountIn);
        router.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: address(tokenIn),
                tokenOut: address(tokenOut),
                fee: m.poolFee,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        tokenIn.forceApprove(address(router), 0);
        amountOut = tokenOut.balanceOf(recipient) - outBefore;
        if (inBefore - tokenIn.balanceOf(address(this)) != amountIn || amountOut < minOut) revert BadSwap();
    }

    function _tokenIn(Order storage o) internal view returns (IERC20) {
        return o.kind == Kind.StopLoss ? IERC20(address(_markets[o.market].token)) : quote;
    }

    function _market(uint8 marketId) internal view returns (Market storage) {
        if (marketId >= _markets.length) revert UnknownMarket();
        return _markets[marketId];
    }

    function _order(uint256 id) internal view returns (Order storage) {
        if (id >= _orders.length) revert UnknownOrder();
        return _orders[id];
    }
}
