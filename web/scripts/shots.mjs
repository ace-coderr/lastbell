// Local screenshot sweep of every screen and state, at desktop, tablet and phone widths.
// Needs the dev server on :5173 and a local Chrome. Drives Chrome over the DevTools protocol (no extra packages).
// Usage: node scripts/shots.mjs OUT_DIR [widths, e.g. 1280,768,390]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = process.argv[2];
if (!out) throw new Error("output dir required");
const widths = (process.argv[3] ?? "1280,768,390").split(",").map(Number);
fs.mkdirSync(out, { recursive: true });

const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://127.0.0.1:5173/?demo";
const CLOSED = "&at=2026-11-07T12:00:00Z";
const PAGES = [
  ["trade", `${BASE}#trade`],
  ["orders", `${BASE}#orders`],
  ["flywheel", `${BASE}#flywheel`],
  ["state-closed", `${BASE}${CLOSED}#trade`],
  ["state-wrong-network", `${BASE}&preview=wrong-network#trade`],
  ["state-stale", `${BASE}&preview=stale#trade`],
  ["state-disconnected", `${BASE}&preview=disconnected#trade`],
  ["state-pending", `${BASE}&preview=pending#trade`],
  ["state-rejected", `${BASE}&preview=rejected#trade`],
  ["state-failed", `${BASE}&preview=failed#trade`],
  ["state-empty-orders", `${BASE}&preview=empty#orders`],
  ["state-region", `http://127.0.0.1:5173/?demo&region=US#trade`],
];
const KEY = { 1280: "desktop", 768: "tablet", 390: "phone" };

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lb-shots-"));
const port = 9333;
const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) {
    pending.get(d.id)(d);
    pending.delete(d.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;

await send("Page.enable");
for (const w of widths) {
  const mobile = w < 500;
  for (const [name, url] of PAGES) {
    await send("Emulation.setDeviceMetricsOverride", { width: w, height: 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send("Page.navigate", { url });
    await sleep(900);
    // Scroll through the page so scroll-triggered reveals play, then return to the top.
    const total = await evaluate("document.documentElement.scrollHeight");
    for (let y = 0; y < total; y += 500) {
      await evaluate(`window.scrollTo(0, ${y})`);
      await sleep(90);
    }
    await evaluate("window.scrollTo(0, 0)");
    await sleep(900);
    const height = await evaluate("document.documentElement.scrollHeight");
    const overflow = await evaluate("document.documentElement.scrollWidth > window.innerWidth");
    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height, scale: 1 } });
    const file = path.join(out, `${KEY[w] ?? w}-${name}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
    console.log(`${KEY[w] ?? w}-${name}  ${w}x${height}${overflow ? "  OVERFLOW" : ""}`);
  }
}
ws.close();
chrome.kill();
