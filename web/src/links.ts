import { LASTBELL, KEEPER_URL } from "./config.js";

// The live deployment, used for the footer links even in demo mode (the contract and keeper are real and public).
export const CONTRACT_ADDRESS = LASTBELL ?? "0x03f4Bf9214474f38D6DD6d60591419a923B4890e";
export const KEEPER_STATUS_URL = `${KEEPER_URL ?? "https://lastbell-keeper.plumbline-app.workers.dev"}/status`;
export const REPO_URL = "https://github.com/ace-coderr/lastbell";
export const EXPLORER_CONTRACT_URL = `https://robinhoodchain.blockscout.com/address/${CONTRACT_ADDRESS}?tab=contract`;
export const DISCLAIMER = "Independent project. Not affiliated with, endorsed by, or connected with Robinhood Markets, Inc.";
