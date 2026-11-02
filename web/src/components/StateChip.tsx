import type { OrderState } from "@lastbell/shared";
import { motion } from "motion/react";
import { Alert, Check, Cross, Eye, Hourglass, Moon, Spinner } from "./icons.js";

export type ChipState = OrderState | { kind: "error"; message: string };

const COPY: Record<ChipState["kind"], string> = {
  armed: "Armed",
  queued: "Queued",
  executing: "Executing",
  filled: "Filled",
  cancelled: "Cancelled",
  expired: "Expired",
  error: "Error",
};

const ICON = { armed: Eye, queued: Moon, executing: Spinner, filled: Check, cancelled: Cross, expired: Hourglass, error: Alert };

export function chipLabel(s: ChipState): string {
  if (s.kind === "queued") return s.reason === "market-closed" ? "Queued until open" : "Queued";
  return COPY[s.kind];
}

export function StateChip({ state }: { state: ChipState }) {
  const Icon = ICON[state.kind];
  return (
    <motion.span layout className="chip" data-state={state.kind} key={state.kind} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
      <Icon size={13} />
      {chipLabel(state)}
    </motion.span>
  );
}
