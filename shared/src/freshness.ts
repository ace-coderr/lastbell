import { isMarketOpen, sessionStart } from "./marketHours.js";

// Off-chain mirror of the on-chain execution gate. The contract is the source of truth;
// the keeper uses this to skip doomed transactions and the web app to explain "queued".

export type QueueReason =
  | "market-closed"
  | "oracle-paused"
  | "token-paused"
  | "bad-answer"
  | "not-updated-since-open"
  | "older-than-heartbeat"
  | "pool-out-of-band";

/** Index = Lastbell.Gate enum value on chain. */
export const GATE_STATUS = [
  "fresh",
  "market-closed",
  "oracle-paused",
  "token-paused",
  "bad-answer",
  "not-updated-since-open",
  "older-than-heartbeat",
  "pool-out-of-band",
] as const satisfies readonly ("fresh" | QueueReason)[];

export type GateStatus = (typeof GATE_STATUS)[number];

export const gateStatusOf = (value: number): GateStatus => GATE_STATUS[value] ?? "bad-answer";

export interface FeedSnapshot {
  answer: bigint;
  updatedAt: number;
  heartbeatSeconds: number;
  oraclePaused: boolean;
  tokenPaused: boolean;
}

export interface Freshness {
  fresh: boolean;
  reason?: QueueReason;
  ageSeconds: number;
}

export const DEFAULT_GRACE_SECONDS = 15 * 60;

export function evaluateFreshness(feed: FeedSnapshot, now: number, graceSeconds = DEFAULT_GRACE_SECONDS): Freshness {
  const ageSeconds = Math.max(0, now - feed.updatedAt);
  const queued = (reason: QueueReason): Freshness => ({ fresh: false, reason, ageSeconds });

  if (!isMarketOpen(now)) return queued("market-closed");
  if (feed.oraclePaused) return queued("oracle-paused");
  if (feed.tokenPaused) return queued("token-paused");
  if (feed.answer <= 0n || feed.updatedAt === 0) return queued("bad-answer");
  const start = sessionStart(now);
  if (start !== null && feed.updatedAt < start) return queued("not-updated-since-open");
  if (ageSeconds > feed.heartbeatSeconds + graceSeconds) return queued("older-than-heartbeat");
  return { fresh: true, ageSeconds };
}

export const QUEUE_REASON_TEXT: Record<QueueReason, string> = {
  "market-closed": "US market is closed. Queued until market open.",
  "oracle-paused": "Price feed paused for a corporate action. Queued until it resumes.",
  "token-paused": "Token transfers are paused by the issuer. Queued until they resume.",
  "bad-answer": "Price feed returned an invalid value. Queued.",
  "not-updated-since-open": "Waiting for the first price update of this session.",
  "older-than-heartbeat": "Price is older than its heartbeat. Queued until it refreshes.",
  "pool-out-of-band": "Pool price disagrees with the oracle. Queued until they line up.",
};
