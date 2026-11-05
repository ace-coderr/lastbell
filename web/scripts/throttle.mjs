// Reproduces slow-device behaviour: throttles CPU and network, jumps to a section, and captures frames over time.
// Usage: node scripts/throttle.mjs OUT_DIR [url] [section id] [cpuRate]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = process.argv[2];
const url = process.argv[3] ?? "http://127.0.0.1:5173/?demo";
const section = process.argv[4] ?? "how";
const cpu = Number(process.argv[5] ?? 6);
fs.mkdirSync(out, { recursive: true });
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lb-thr-"));
const port = 9334;
const chrome = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--headless=new", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, (d) => (d.error ? rej(new Error(d.error.message)) : res(d.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;

await send("Page.enable");
await send("Network.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
await send("Emulation.setCPUThrottlingRate", { rate: cpu });
await send("Page.navigate", { url });
await sleep(9000);
await ev(`document.querySelector('.region-dialog button')?.click()`);
await sleep(600);
await ev(`document.getElementById(${JSON.stringify(section)}).scrollIntoView()`);
for (const ms of [50, 300, 800, 2000, 5000]) {
  await sleep(ms === 50 ? 50 : ms - (ms === 300 ? 50 : ms === 800 ? 300 : ms === 2000 ? 800 : 2000));
  const stats = await ev(`(()=>{const c=[...document.querySelectorAll('#${section} .cell')];return c.map(e=>getComputedStyle(e).opacity).join(',')})()`);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(out, `throttle-${section}-${ms}ms.png`), Buffer.from(shot.data, "base64"));
  console.log(ms + "ms opacities:", stats);
}
ws.close();
chrome.kill();
