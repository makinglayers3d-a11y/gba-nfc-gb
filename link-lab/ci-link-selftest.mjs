import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const joinDelay = Math.max(0, Number(process.env.JOIN_DELAY || 420) | 0);
const transferCycles = Math.max(0, Number(process.env.LINK_TRANSFER_CYCLES || 0) | 0);
const progressiveTransfer = process.env.LINK_PROGRESSIVE === "1";
const outDir = path.resolve(`artifacts/link-selftest-${joinDelay}`);
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
  "&linkRoom=ci&linkPlayer=0&linkRole=host&linkTransport=dual&linkSelfTest=1" +
  (transferCycles ? `&linkTransferCycles=${transferCycles}` : "") +
  (progressiveTransfer ? "&linkProgressive=1" : "");

console.log("JOIN_DELAY", joinDelay);
console.log("TRANSFER_CYCLES", transferCycles || "default");
console.log("PROGRESSIVE_TRANSFER", progressiveTransfer);
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
    const cores = ctl?.cores || [];
    const byte = (v) => Number(v ?? 0) & 0xff;
    const marioLinkState = cores.map((core) => {
      const ram = core?.IOCore?.memory?.internalRAM;
      if (!ram) return null;
      return {
        childState: byte(ram[0x79B4]),
        linkFlags: byte(ram[0x79C0]),
        multi0: byte(ram[0x79C8]) | (byte(ram[0x79C9]) << 8),
        multi1: byte(ram[0x79CA]) | (byte(ram[0x79CB]) << 8),
        multi2: byte(ram[0x79CC]) | (byte(ram[0x79CD]) << 8),
        multi3: byte(ram[0x79CE]) | (byte(ram[0x79CF]) << 8)
      };
    });
    const hardwareState = cores.map((core) => {
      const io = core?.IOCore;
      const ram = io?.memory?.internalRAM;
      const gfx = io?.gfxState;
      const u16 = (off) => ram
        ? (byte(ram[off]) | (byte(ram[off + 1]) << 8))
        : null;
      const u32 = (off) => ram
        ? ((byte(ram[off]) |
            (byte(ram[off + 1]) << 8) |
            (byte(ram[off + 2]) << 16) |
            (byte(ram[off + 3]) << 24)) >>> 0)
        : null;
      return {
        irqSoftFlags0030: u16(0x30),
        irqVector7FFC: u32(0x7FFC),
        vblankHandler0C94: u32(0x0C94),
        gfx: gfx ? {
          currentScanLine: Number(gfx.currentScanLine) | 0,
          lcdTicks: Number(gfx.LCDTicks) | 0,
          statusFlags: Number(gfx.statusFlags) | 0,
          irqFlags: Number(gfx.IRQFlags) | 0,
          nextVBlankIRQ: typeof gfx.nextVBlankIRQEventTime === "function"
            ? (Number(gfx.nextVBlankIRQEventTime()) | 0)
            : null
        } : null,
        scheduler: io ? {
          linkCycleCounter: Number(io.linkCycleCounter) || 0,
          accumulatedClocks: Number(io.accumulatedClocks) | 0,
          graphicsClocks: Number(io.graphicsClocks) | 0,
          nextEventClocks: Number(io.nextEventClocks) | 0,
          cyclesToIterate: Number(io.cyclesToIterate) | 0
        } : null
      };
    });
    return {
      ...s,
      marioLinkState,
      hardwareState,
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

async function tapSeat(seat, key, holdFrames = 4, settleFrames = 90) {
  const bit = 1 << key;
  await setMask(seat, bit);
  await waitFrames(holdFrames);
  await setMask(seat, 0);
  await waitFrames(settleFrames);
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
await capture("language");

// Select English.
await tapBoth(0, 4, 360); // A
await capture("after-language");

// The intro only accepts START after formatting/early animation has advanced.
await waitFrames(320);
await tapBoth(3, 4, 180); // START
await capture("mode-menu");

// Multi-Pak flow: both consoles own the cartridge, so both players walk into
// MULTIPLAYER on their own screen. This is what a lobby session actually does.
await tapBoth(4, 4, 45); // RIGHT -> MULTIPLAYER on both seats
await capture("both-multiplayer-selected");

await waitFrames(joinDelay);
await capture("both-awaiting-peer");

await tapBoth(3, 4, 150); // START on both: begin the cable check
await capture("both-link-check");

// Mario Bros. Battle asks for a second START once the cable check passes.
await tapBoth(3, 4, 180);
await capture("both-second-start");

// Confirm the default Battle settings.
await tapBoth(3, 4, 120);
await capture("both-settings-confirmed");

// Keep sampling the protocol while the session runs.
for (let i = 1; i <= 6; i++) {
  await waitFrames(60);
  await capture("multipak-" + i);
}

await waitFrames(1450);
await capture("final");

await fs.writeFile(
  path.join(outDir, "states.json"),
  JSON.stringify(states, null, 2)
);

const finalState = await status();
console.log("FINAL", JSON.stringify(finalState));

// When the in-game link check fails, the game drops SIOCNT back to Normal
// mode and prints ERROR!, so a session still wired for Multi-Player is what
// actually proves the link held.
const finalModes = (finalState?.serial || []).map((s) => Number(s?.mode));
if (finalModes.length !== 2 || finalModes.some((mode) => mode !== 2)) {
  throw new Error(
    "Link collapsed out of Multi-Player mode (game reported a link error); " +
    "final SIOCNT modes=" + JSON.stringify(finalModes) +
    " transfers=" + String(finalState?.transfers ?? "unknown")
  );
}

if (!(Number(finalState?.transfers) > 0)) {
  throw new Error("No Multi-Player transfer ever completed between the two cores");
}

// Both games reaching their own protocol words (parent F00F / child FDFD)
// proves the two cartridges talked to each other rather than to a stub.
if (!finalState?.protocolTransition) {
  throw new Error(
    "The two cores never exchanged the Mario link handshake (F00F/FDFD); " +
    "transfers=" + String(finalState?.transfers ?? "unknown")
  );
}

if (finalState?.wedged) {
  throw new Error("Dual-core coordinator wedged during the session");
}

await browser.close();
