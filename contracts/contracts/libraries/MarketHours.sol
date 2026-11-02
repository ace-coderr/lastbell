// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @title MarketHours
/// @notice US equity 24/5 session model, mirrored from shared/src/marketHours.ts.
/// A trading day D (Mon-Fri, Eastern date) runs from 20:00 ET on D-1 to 20:00 ET on D.
/// US DST follows the fixed rule (2nd Sunday of March to 1st Sunday of November, 02:00 local).
/// NYSE full-day holidays for 2026-2027 are baked in as an immutable bitmap; no one can edit it.
library MarketHours {
    uint256 internal constant HOUR = 3600;
    uint256 internal constant DAY = 86400;
    uint256 internal constant SESSION_EDGE = 20 * HOUR;

    /// @dev Day number (days since 1970-01-01) of 2026-01-01; bit i of the bitmap = START_DAY + i.
    uint256 internal constant HOLIDAY_START_DAY = 20454;
    uint256 internal constant HOLIDAY_DAYS = 768;
    // Source: nyse.com/markets/hours-calendars. Generated from the list in shared/src/marketHours.ts.
    uint256 internal constant HOLIDAYS_0 = 0x0200000000000000008002000001000000000000100000000000400000040001;
    uint256 internal constant HOLIDAYS_1 = 0x0000000000000002000000000400000040002040000002000000000000000000;
    uint256 internal constant HOLIDAYS_2 = 0x0000000000040000002000000000000000000020000000000000004000200008;

    function daysFromCivil(uint256 year, uint256 month, uint256 day) internal pure returns (uint256) {
        uint256 y = month <= 2 ? year - 1 : year;
        uint256 era = y / 400;
        uint256 yoe = y - era * 400;
        uint256 doy = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
        uint256 doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    function yearOfDay(uint256 dayNumber) internal pure returns (uint256) {
        uint256 z = dayNumber + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        return yoe + era * 400 + (mp >= 10 ? 1 : 0);
    }

    /// @dev 0 = Sunday ... 6 = Saturday.
    function weekday(uint256 dayNumber) internal pure returns (uint256) {
        return (dayNumber + 4) % 7;
    }

    function isUsDst(uint256 ts) internal pure returns (bool) {
        uint256 year = yearOfDay(ts / DAY);
        uint256 mar1 = daysFromCivil(year, 3, 1);
        uint256 secondSunday = mar1 + ((7 - weekday(mar1)) % 7) + 7;
        uint256 nov1 = daysFromCivil(year, 11, 1);
        uint256 firstSunday = nov1 + ((7 - weekday(nov1)) % 7);
        return ts >= secondSunday * DAY + 7 * HOUR && ts < firstSunday * DAY + 6 * HOUR;
    }

    function easternOffset(uint256 ts) internal pure returns (uint256) {
        return isUsDst(ts) ? 4 * HOUR : 5 * HOUR;
    }

    function isHoliday(uint256 dayNumber) internal pure returns (bool) {
        if (dayNumber < HOLIDAY_START_DAY || dayNumber >= HOLIDAY_START_DAY + HOLIDAY_DAYS) return false;
        uint256 i = dayNumber - HOLIDAY_START_DAY;
        uint256 word = i < 256 ? HOLIDAYS_0 : i < 512 ? HOLIDAYS_1 : HOLIDAYS_2;
        return (word >> (i % 256)) & 1 == 1;
    }

    function isTradingDay(uint256 dayNumber) internal pure returns (bool) {
        uint256 wd = weekday(dayNumber);
        return wd >= 1 && wd <= 5 && !isHoliday(dayNumber);
    }

    /// @notice Eastern date of the trading day that `ts` belongs to.
    function tradingDayOf(uint256 ts) internal pure returns (uint256) {
        uint256 local = ts - easternOffset(ts);
        uint256 localDay = local / DAY;
        return local % DAY >= SESSION_EDGE ? localDay + 1 : localDay;
    }

    /// @notice UTC time at which trading day `dayNumber` opens (20:00 ET the evening before).
    function openOf(uint256 dayNumber) internal pure returns (uint256) {
        uint256 local = (dayNumber - 1) * DAY + SESSION_EDGE;
        uint256 asEst = local + 5 * HOUR;
        return isUsDst(asEst) ? local + 4 * HOUR : asEst;
    }

    function isOpen(uint256 ts) internal pure returns (bool) {
        return isTradingDay(tradingDayOf(ts));
    }

    /// @notice Start of the continuous open stretch containing `ts`. `open` is false when closed.
    function sessionStart(uint256 ts) internal pure returns (bool open, uint256 start) {
        uint256 day = tradingDayOf(ts);
        if (!isTradingDay(day)) return (false, 0);
        // Bounded: a stretch never spans more than five trading days.
        while (isTradingDay(day - 1)) day--;
        return (true, openOf(day));
    }
}
