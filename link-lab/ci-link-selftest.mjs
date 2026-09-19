import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const outDir = path.resolve("artifacts/link-selftest");
await fs.mkdir(outDir, { recursive: true });

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("No Chrome/Chromium executable found");
}

const chrome = await findChrome();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
    "--disable-gpu"
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1100, deviceScaleFactor: 1 });
page.on("console", msg => console.log("[browser]", msg.type(), msg.text()));
page.on("pageerror", err => console.error("[pageerror]", err.stack || err.message));

const url =
  "http://127.0.0.1:8000/?game=mario3&skipintro=1" +
  "&linkRoom=ci&linkPlayer=0&linkRole=host&linkTransport=dual&linkSelfTest=1";

console.log("Opening", url);
await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });

await page.waitForFunction(
  () => window.ML3DLocalLinkSession?.active === true,
  { timeout: 120000 }
);

async function status() {
  return await page.evaluate(() => {
    const api = window.ML3DLocalLinkSession;
    const ctl = api?.test?.controller;
    const s = api?.status || {};
    const serials = ctl?.serials || [];
    const byte = (v) => Number(v ?? 0) & 0xff;
    return {
      ...s,
      masks: api?.test?.masks || null,
      serial: serials.map((ser) => ({
        mode: ser?.SIOCNT_MODE ?? null,
        busy: !!ser?.SIOTransferStarted,
        siocnt0: byte(ser?.readSIOCNT0?.()),
        rcnt0: byte(ser?.readRCNT0?.()),
        send: Number(ser?.getLinkSendData?.() ?? 0) & 0xffff,
        a: Number(ser?.SIODATA_A ?? 0) & 0xffff,
        b: Number(ser?.SIODATA_B ?? 0) & 0xffff
      })),
      debug: document.getElementById("ml3d-local-link-debug")?.textContent || ""
    };
  });
}

async function waitFrames(count, timeout = 30000) {
  const start = (await status()).frame || 0;
  const target = start + count;
  await page.waitForFunction(
    (f) => (window.ML3DLocalLinkSession?.status?.frame || 0) >= f,
    { timeout },
    target
  );
}

async function setMask(seat, mask) {
  await page.evaluate(
    ({ seat, mask }) => window.ML3DLocalLinkSession.test.setSeatMask(seat, mask),
    { seat, mask }
  );
}

async function tapBoth(key, holdFrames = 4, settleFrames = 90) {
  const bit = 1 << key;
  await setMask(0, bit);
  await setMask(1, bit);
  await waitFrames(holdFrames);
  await setMask(0, 0);
  await setMask(1, 0);
  await waitFrames(settleFrames);
}

let shot = 0;
const states = [];
async function capture(label) {
  const s = await status();
  states.push({ label, ...s });
  console.log("STATE", label, JSON.stringify(s));
  await page.screenshot({
    path: path.join(outDir, String(shot++).padStart(2, "0") + "-" + label + ".png"),
    fullPage: true
  });
}

await waitFrames(240);
await capture("boot");

// Common SMA4 menu traversal candidates.
await tapBoth(3, 4, 180); // START
await capture("after-start");
await tapBoth(0, 4, 180); // A
await capture("after-a1");
await tapBoth(7, 4, 60);  // DOWN
await tapBoth(0, 4, 240); // A
await capture("after-down-a");
await tapBoth(3, 4, 120); // START
await capture("after-start2");
await tapBoth(0, 4, 180); // A
await capture("after-a2");

// Give any multiplayer handshake time to settle.
await waitFrames(600);
await capture("final");

await fs.writeFile(
  path.join(outDir, "states.json"),
  JSON.stringify(states, null, 2)
);

console.log("FINAL", JSON.stringify(await status()));
await browser.close();
