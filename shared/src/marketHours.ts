// US equity 24/5 session model used by Chainlink's Stock Token feeds.
//
// A trading day D (Mon-Fri, Eastern date) runs from 20:00 ET on D-1 until 20:00 ET on D.
// So Monday's session opens Sunday 20:00 ET, and the week closes Friday 20:00 ET.
// A trading day is closed if it falls on an NYSE holiday.
//
// Everything works on unix seconds. US DST is derived from the fixed rule
// (2nd Sunday of March 02:00 local to 1st Sunday of November 02:00 local),
// so the same math can be ported to Solidity without an admin-set calendar.

const HOUR = 3600;
const DAY = 86400;
const SESSION_EDGE = 20 * HOUR; // 20:00 local

// Source: nyse.com/markets/hours-calendars (full-day closures only; early closes still trade).
export const NYSE_HOLIDAYS = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19",
  "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18",
  "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
] as const;

export const HOLIDAYS_KNOWN_THROUGH_YEAR = 2027;

// Howard Hinnant's days_from_civil: days since 1970-01-01 for a proleptic Gregorian date.
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

const HOLIDAY_DAYS = new Set(
  NYSE_HOLIDAYS.map((d) => {
    const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
    return daysFromCivil(y, m, dd);
  }),
);

export function isUsDst(ts: number): boolean {
  const { year } = civilFromDays(Math.floor(ts / DAY));
  const mar1 = daysFromCivil(year, 3, 1);
  const secondSunday = mar1 + ((7 - weekday(mar1)) % 7) + 7;
  const nov1 = daysFromCivil(year, 11, 1);
  const firstSunday = nov1 + ((7 - weekday(nov1)) % 7);
  const start = secondSunday * DAY + 7 * HOUR; // 02:00 EST
  const end = firstSunday * DAY + 6 * HOUR; // 02:00 EDT
  return ts >= start && ts < end;
}

export function easternOffset(ts: number): number {
  return isUsDst(ts) ? 4 * HOUR : 5 * HOUR;
}

/** Converts an Eastern wall-clock time (as seconds) to UTC. Exact away from the 02:00 switch. */
function utcFromEastern(localTs: number): number {
  const asEst = localTs + 5 * HOUR;
  return isUsDst(asEst) ? localTs + 4 * HOUR : asEst;
}

/** Eastern date (days since epoch) of the trading day that `ts` belongs to. */
export function tradingDayOf(ts: number): number {
  const local = ts - easternOffset(ts);
  const localDay = Math.floor(local / DAY);
  return local - localDay * DAY >= SESSION_EDGE ? localDay + 1 : localDay;
}

export function isTradingDay(day: number): boolean {
  const wd = weekday(day);
  return wd >= 1 && wd <= 5 && !HOLIDAY_DAYS.has(day);
}

/** UTC time at which trading day `day` opens (20:00 ET the evening before). */
function openOf(day: number): number {
  return utcFromEastern((day - 1) * DAY + SESSION_EDGE);
}

export function isMarketOpen(ts: number): boolean {
  return isTradingDay(tradingDayOf(ts));
}

/** Start of the continuous open stretch containing `ts`, or null when closed. */
export function sessionStart(ts: number): number | null {
  let day = tradingDayOf(ts);
  if (!isTradingDay(day)) return null;
  while (isTradingDay(day - 1)) day--;
  return openOf(day);
}

/** Next time the market opens (ts itself when already open). */
export function nextOpen(ts: number): number {
  let day = tradingDayOf(ts);
  if (isTradingDay(day)) return ts;
  while (!isTradingDay(day)) day++;
  return openOf(day);
}

/** When the current open stretch ends, or null when closed. */
export function nextClose(ts: number): number | null {
  let day = tradingDayOf(ts);
  if (!isTradingDay(day)) return null;
  while (isTradingDay(day + 1)) day++;
  return openOf(day + 1);
}

export interface MarketClock {
  open: boolean;
  sessionStart: number | null;
  nextOpen: number;
  nextClose: number | null;
}

export function marketClock(ts: number): MarketClock {
  return { open: isMarketOpen(ts), sessionStart: sessionStart(ts), nextOpen: nextOpen(ts), nextClose: nextClose(ts) };
}
