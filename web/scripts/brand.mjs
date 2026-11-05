// Generates the brand assets in web/public from code, so they are reproducible and original:
//   favicon.svg, favicon.ico (16/32/48), favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og.png
// Usage: npm run brand -w web
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

const require = createRequire(import.meta.url);
const OUT = new URL("../public/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const C = { ink: "#0A0D26", ink2: "#12163A", cream: "#F7F2EA", coral: "#FF7A59", lilac: "#B9B4F0", mint: "#7BE0B3", muted: "#A6A9C9" };

// ------------------------------------------------------------------ the mark (64 x 64 grid)
const BELL = "M32 13C22.5 13 17 20.5 17 30.5V39.5L11.5 46.5H52.5L47 39.5V30.5C47 20.5 41.5 13 32 13Z";
const mark = (extra = "") => `
  <path d="${BELL}" fill="${C.coral}"/>
  <circle cx="32" cy="9.5" r="3.2" fill="${C.lilac}"/>
  <circle cx="32" cy="52.2" r="4.6" fill="${C.lilac}"/>
  ${extra}`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="15" fill="${C.ink}"/>
  ${mark(`<circle cx="50" cy="14" r="3.4" fill="${C.mint}"/>`)}
</svg>`;
// Full-bleed (no rounded corners) for platforms that round the icon themselves.
const bleedSvg = faviconSvg.replace('rx="15"', 'rx="0"');

writeFileSync(new URL("favicon.svg", OUT), faviconSvg);

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
writeFileSync(new URL("favicon-32.png", OUT), png(faviconSvg, 32));
writeFileSync(new URL("apple-touch-icon.png", OUT), png(bleedSvg, 180));
writeFileSync(new URL("icon-192.png", OUT), png(bleedSvg, 192));
writeFileSync(new URL("icon-512.png", OUT), png(bleedSvg, 512));

// favicon.ico: a PNG-in-ICO container holding 16, 32 and 48 px images.
const sizes = [16, 32, 48];
const images = sizes.map((s) => png(faviconSvg, s));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((img, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], e);
  header.writeUInt8(sizes[i] === 256 ? 0 : sizes[i], e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(img.length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
writeFileSync(new URL("favicon.ico", OUT), Buffer.concat([header, ...images]));

writeFileSync(
  new URL("site.webmanifest", OUT),
  JSON.stringify(
    {
      name: "Lastbell",
      short_name: "Lastbell",
      description: "Stop-losses for Stock Tokens that wait for a fresh price.",
      start_url: "/",
      display: "standalone",
      background_color: C.ink,
      theme_color: C.ink,
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  ) + "\n",
);

// ------------------------------------------------------------------ share image (1200 x 630)
const font = (pkg, file) => readFileSync(require.resolve(`${pkg}/files/${file}`));
const fonts = [
  { name: "Hanken", data: font("@fontsource/hanken-grotesk", "hanken-grotesk-latin-700-normal.woff"), weight: 700, style: "normal" },
  { name: "Hanken", data: font("@fontsource/hanken-grotesk", "hanken-grotesk-latin-500-normal.woff"), weight: 500, style: "normal" },
  { name: "Mono", data: font("@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff"), weight: 500, style: "normal" },
];

const h = (type, props, ...children) => ({ type, props: { ...props, children: children.length <= 1 ? children[0] : children } });

// Dot-matrix bell: the same silhouette as the mark (64 x 64 grid), drawn as a grid of dots.
function inBell(x, y) {
  if (y >= 13 && y < 30.5) return Math.abs(x - 32) <= 15 * Math.sqrt(Math.max(0, 1 - ((30.5 - y) / 17.5) ** 2));
  if (y >= 30.5 && y < 39.5) return Math.abs(x - 32) <= 15;
  if (y >= 39.5 && y <= 46.5) return Math.abs(x - 32) <= 15 + (y - 39.5) * (5.5 / 7);
  return false;
}
function bellDots(n, cell, r) {
  const dots = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * 64;
      const y = ((j + 0.5) / n) * 64;
      const clapper = (x - 32) ** 2 + (y - 52.2) ** 2 <= 4.8 ** 2;
      const handle = (x - 32) ** 2 + (y - 9.5) ** 2 <= 3.4 ** 2;
      const body = inBell(x, y);
      const cx = i * cell + cell / 2;
      const cy = j * cell + cell / 2;
      if (clapper || handle) dots.push(h("circle", { cx, cy, r, fill: C.lilac }));
      else if (body) dots.push(h("circle", { cx, cy, r: (i + j) % 3 === 0 ? r * 0.78 : r, fill: C.coral, opacity: (i + j) % 3 === 0 ? 0.7 : 1 }));
      else if ((i + j) % 2 === 0) dots.push(h("circle", { cx, cy, r: r * 0.26, fill: C.muted, opacity: 0.35 }));
    }
  }
  return h("svg", { width: n * cell, height: n * cell, viewBox: `0 0 ${n * cell} ${n * cell}` }, ...dots);
}

const label = (n, text) => h("div", { style: { display: "flex", alignItems: "center", gap: 10, fontFamily: "Mono", fontSize: 20, color: C.muted, letterSpacing: 2 } },
  h("div", { style: { display: "flex", color: C.coral } }, n), h("div", { style: { display: "flex" } }, text));

const card = h("div", { style: { display: "flex", width: 1200, height: 630, background: C.ink, color: "#F4F2FF", fontFamily: "Hanken", position: "relative" } },
  h("div", { style: { display: "flex", position: "absolute", left: 0, top: 0, width: 1200, height: 10, background: C.coral } }),
  h("div", { style: { display: "flex", position: "absolute", left: 0, top: 10, width: 400, height: 4, background: C.lilac } }),
  h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 56px 72px", width: 760 } },
    h("div", { style: { display: "flex", alignItems: "center", gap: 16 } },
      h("svg", { width: 56, height: 56, viewBox: "0 0 64 64" }, h("path", { d: BELL, fill: C.coral }), h("circle", { cx: 32, cy: 9.5, r: 3.2, fill: C.lilac }), h("circle", { cx: 32, cy: 52.2, r: 4.6, fill: C.lilac })),
      h("div", { style: { display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1.5 } }, "lastbell")),
    h("div", { style: { display: "flex", flexDirection: "column", gap: 22 } },
      h("div", { style: { display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3 } }, "Stop-losses that sleep when the market sleeps."),
      h("div", { style: { display: "flex", fontSize: 30, fontWeight: 500, color: C.muted, lineHeight: 1.3 } }, "Stock Token orders that only fire on a fresh price.")),
    h("div", { style: { display: "flex", gap: 36 } }, label("01", "FRESH PRICE"), label("02", "KEEPER BOND"), label("03", "BURN"))),
  h("div", { style: { display: "flex", position: "absolute", right: 64, top: 92 } }, bellDots(24, 19, 6.6)),
  h("div", { style: { display: "flex", position: "absolute", left: 0, bottom: 0, width: 1200, height: 6, background: C.mint, opacity: 0.9 } }),
);

const svg = await satori(card, { width: 1200, height: 630, fonts });
writeFileSync(new URL("og.png", OUT), new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng());
console.log("brand assets written to web/public");
