/**
 * Records the Looni demo video from the web build, with captions.
 *
 *   1. Server: cd server && npm run dev        (Plaid Sandbox keys in server/.env)
 *   2. Web app: cd mobile && EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo export -p web --output-dir dist
 *      then serve mobile/dist on port 8090 with a single-page fallback (any static server works)
 *   3. node scripts/record-demo.mjs [out-dir]    → out-dir/looni-demo.mp4 (needs ffmpeg)
 *
 * Playwright must be installed (npm i -g playwright, or set PLAYWRIGHT_MODULE to its path).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const APP = process.env.APP_URL || "http://localhost:8090";
const OUT = resolve(process.argv[2] || "demo-out");
// A 390×844 phone, rendered at 2× by zooming the page (Chrome's screencast only sends CSS-pixel frames).
const W = 390;
const H = 844;
const SCALE = 2;

rmSync(join(OUT, "raw"), { recursive: true, force: true });
mkdirSync(join(OUT, "raw"), { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W * SCALE, height: H * SCALE }, colorScheme: "light" });
const page = await context.newPage();
await page.addInitScript((zoom) => document.addEventListener("DOMContentLoaded", () => (document.documentElement.style.zoom = zoom)), String(SCALE));
page.on("dialog", (d) => d.dismiss());

// Chrome's screencast: every frame Chrome paints (Playwright's recordVideo is lower quality).
const frames = [];
const cdp = await context.newCDPSession(page);
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const file = join(OUT, "raw", `${String(frames.length).padStart(6, "0")}.jpg`);
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, t: metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * SCALE, maxHeight: H * SCALE });

const wait = (ms) => page.waitForTimeout(ms);

// ---- overlays ---------------------------------------------------------------

async function installOverlays() {
  await page.evaluate(() => {
    if (document.getElementById("demo-caption")) return;
    const style = document.createElement("style");
    style.textContent = `
      #demo-caption { position: fixed; left: 14px; right: 14px; bottom: 26px; z-index: 99999; pointer-events: none;
        background: rgba(30, 27, 46, 0.92); color: #fff; border-radius: 16px; padding: 14px 18px;
        font: 600 17px/1.35 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center;
        box-shadow: 0 8px 24px rgba(0,0,0,.25); opacity: 0; transform: translateY(12px); transition: opacity .35s, transform .35s; }
      #demo-caption.on { opacity: 1; transform: none; }
      #demo-caption.top { bottom: auto; top: 64px; }
      #demo-caption small { display: block; font-weight: 500; font-size: 14px; opacity: .8; margin-top: 4px; }
      #demo-card { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; justify-content: center;
        align-items: center; gap: 14px; padding: 32px; text-align: center; background: #5B4FD6; color: #fff;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; opacity: 0; transition: opacity .5s; pointer-events: none; }
      #demo-card.on { opacity: 1; }
      #demo-card .logo { font-size: 22px; font-weight: 700; letter-spacing: .5px; opacity: .9; }
      #demo-card .big { font-size: 34px; font-weight: 800; line-height: 1.15; }
      #demo-card .big em { font-style: normal; color: #F5D36B; }
      #demo-card .sub { font-size: 17px; opacity: .9; line-height: 1.4; }
      #demo-tap { position: fixed; z-index: 99998; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        background: rgba(91, 79, 214, .35); border: 2px solid rgba(91, 79, 214, .8); pointer-events: none;
        transform: scale(.4); opacity: 0; transition: transform .3s, opacity .3s; }
      #demo-tap.on { transform: scale(1); opacity: 1; }`;
    document.head.appendChild(style);
    for (const id of ["demo-caption", "demo-card", "demo-tap"]) {
      const el = document.createElement("div");
      el.id = id;
      document.body.appendChild(el);
    }
  });
}

/** Caption at the bottom of the screen, or at the top when it would cover what's being shown. */
async function caption(text, sub = "", { top = false } = {}) {
  await installOverlays();
  await page.evaluate(
    ({ text, sub, top }) => {
      const el = document.getElementById("demo-caption");
      el.classList.remove("on");
      setTimeout(() => {
        el.innerHTML = "";
        el.classList.toggle("top", top);
        if (!text) return;
        el.append(text);
        if (sub) {
          const s = document.createElement("small");
          s.textContent = sub;
          el.append(s);
        }
        el.classList.add("on");
      }, 200);
    },
    { text, sub, top },
  );
  await wait(450);
}

async function card(html, ms) {
  await installOverlays();
  await page.evaluate((html) => {
    const el = document.getElementById("demo-card");
    el.innerHTML = html;
    el.classList.add("on");
  }, html);
  await wait(ms);
  await page.evaluate(() => document.getElementById("demo-card").classList.remove("on"));
  await wait(500);
}

/** Shows a tap ripple on the element, then clicks it. */
async function tap(locator, pause = 500) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await installOverlays();
    await page.evaluate(
      ({ x, y }) => {
        const el = document.getElementById("demo-tap");
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.classList.add("on");
        setTimeout(() => el.classList.remove("on"), 450);
      },
      { x: (box.x + box.width / 2) / SCALE, y: (box.y + box.height / 2) / SCALE },
    );
    await wait(350);
  }
  try {
    // force: Paper's List.Item marks its row aria-disabled when the row itself isn't pressable,
    // which Playwright reads as disabling the buttons inside it.
    await locator.click({ timeout: 15_000, force: true });
  } catch (err) {
    await page.screenshot({ path: join(OUT, "failed-tap.png") });
    throw err;
  }
  await wait(pause);
}

/** Smoothly scrolls the main scroll view by `dy` pixels over `ms`. */
async function scroll(dy, ms = 1200) {
  await page.evaluate(
    async ({ dy, ms }) => {
      const el = document
        .elementsFromPoint(innerWidth / 2, innerHeight / 2)
        .find((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      if (!el) return;
      const start = el.scrollTop;
      const t0 = performance.now();
      await new Promise((done) => {
        const step = (t) => {
          const p = Math.min(1, (t - t0) / ms);
          el.scrollTop = start + dy * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
          if (p < 1) requestAnimationFrame(step);
          else done();
        };
        requestAnimationFrame(step);
      });
    },
    { dy, ms },
  );
  await wait(250);
}

// ---- the demo -----------------------------------------------------------------

await page.goto(APP);
await page.getByText("Scan my accounts").waitFor();
await card(
  `<div class="logo">🐦 looni</div><div class="big">Your bank won't tell you where your money <em>leaks</em>.</div><div class="sub">Looni finds it, and makes sure you never miss a bill.</div>`,
  3200,
);

await caption("Looni scans your accounts for money you're losing every year");
await wait(2600);
await tap(page.getByText("Scan my accounts"), 900);

await caption("Your data, your call", "Bank-grade encryption. Raw transactions are never stored.", { top: true });
await wait(2400);
await tap(page.getByLabel("Share anonymous examples"), 600);
await tap(page.getByText("Continue", { exact: true }), 900);

await caption("Connect a bank through Plaid", "Demo: Plaid Sandbox test account");
await wait(1800);
await tap(page.getByText("Leaky test account"), 300);
await caption("Scanning a year of transactions…");
await page.getByText("YOU'RE LEAKING").waitFor({ timeout: 90_000 });
await wait(600);

await caption("$1,986 a year leaking, found in seconds");
await wait(1800);
await caption("A $1 charge from a merchant you've never used", "Fraudsters test stolen cards this way. One tap to act on it.");
await wait(3200);
await scroll(330);
await caption("Bank fees, forgotten subscriptions, price hikes, double charges");
await wait(1200);
await scroll(520, 1800);
await wait(800);
await caption("Tell Looni which leaks are real", "\"Keep it\" takes a charge off your total. \"Don't need it\" tracks it until it stops.");
await tap(page.getByText("Don't need it").first(), 1600);
await scroll(700, 2000);
await wait(900);
await scroll(-2000, 1400);
await wait(400);

await caption("New: every bill, in one place");
await tap(page.getByLabel("Bills").first(), 300);
await page.getByText("Coming up").waitFor({ timeout: 30_000 });
await wait(400);
await scroll(-3000, 10); // the web build can open scrolled; start at the top
await caption("Will your balance cover the bills before payday?", "Looni checks your live balance against what's due. It's never stored.");
await wait(4200);
await caption("$455 short, and the exact day money needs to be in", "An NSF fee costs about $48. This warning costs nothing.");
await wait(3800);
await scroll(330, 1300);
await caption("A bill that should have come out but didn't", "Catch it before it turns into a late fee.");
await wait(3400);
await scroll(380, 1500);
await caption("Every due date, with reminders when you want them");
await wait(1600);
await scroll(160, 900);
await caption("Hydro jumped to $142.60. Looni flags bills that change.");
await wait(3200);
await tap(page.getByLabel(/Options for Rent/), 900);
await caption("Choose when to be reminded, per bill");
await wait(1500);
await tap(page.getByText("Remind me 7 days before"), 800);
await scroll(600, 1800);
await caption("Paydays are spotted automatically", "So Looni knows what has to be covered, and until when.", { top: true });
await wait(2600);
await caption("");

await card(
  `<div class="logo">🐦 looni</div><div class="big">Stop the leaks.<br/><em>Never miss a bill.</em></div><div class="sub">Built on Plaid. Your raw transactions and balances are never stored.</div>`,
  3800,
);

await cdp.send("Page.stopScreencast");
await browser.close();

// Chrome only sends a frame when the screen changes: hold each one until the next.
const list = frames.map((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 1;
  return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
});
writeFileSync(join(OUT, "raw", "frames.txt"), `${list.join("\n")}\nfile '${frames.at(-1).file}'\n`);
const mp4 = join(OUT, "looni-demo.mp4");
execFileSync("ffmpeg", [
  "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(OUT, "raw", "frames.txt"),
  "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
  "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4,
]);
rmSync(join(OUT, "raw"), { recursive: true, force: true });
console.log(`${mp4} (${frames.length} frames, ${(frames.at(-1).t - frames[0].t).toFixed(1)}s)`);
