/**
 * Records the Looni demo video from the web build, with captions.
 *
 *   1. Server: cd server && npm run dev        (any Plaid keys; the demo doesn't call Plaid)
 *   2. Web app: cd mobile && EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo export -p web --output-dir dist
 *      then serve mobile/dist on port 8090 with a single-page fallback (any static server works)
 *   3. node scripts/record-demo.mjs [out-dir]    → out-dir/looni-demo.mp4 (needs ffmpeg)
 *
 * No bank connection needed: the demo scans a year of statement data (written fresh, dated up to today)
 * through the real file picker. Net worth and the 30-day forecast need live balances, so the demo
 * shows a sample household there and says so on screen; set SAMPLE_BALANCES=0 to skip that.
 *
 * Playwright must be installed (npm i -g playwright, or set PLAYWRIGHT_MODULE to its path;
 * set CHROMIUM_PATH to use a specific Chromium build).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const APP = process.env.APP_URL || "http://localhost:8090";
const OUT = resolve(process.argv[2] || "demo-out");
const SAMPLE_BALANCES = process.env.SAMPLE_BALANCES !== "0";
// A 390×844 phone, rendered at 2× by zooming the page (Chrome's screencast only sends CSS-pixel frames).
const W = 390;
const H = 844;
const SCALE = 2;

rmSync(join(OUT, "raw"), { recursive: true, force: true });
mkdirSync(join(OUT, "raw"), { recursive: true });

// ---- demo data ------------------------------------------------------------------

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = Date.parse(`${iso(Date.now())}T00:00:00Z`);

/** A year of a Canadian chequing account with the leaks from loonifinancial.com's sample receipt. */
function demoStatement() {
  const rows = ["Date,Description,Withdrawals,Deposits"];
  const add = (t, desc, out, inn = "") => t <= today && rows.push(`${iso(t)},${desc},${out},${inn}`);
  for (let m = 12; m >= 0; m--) {
    const base = new Date(today);
    const at = (day) => Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - m, day);
    add(at(1), "MONTHLY PLAN FEE", "16.95");
    add(at(2), "MORTGAGE PAYMENT", "2410.00");
    add(at(5), "STREAMCO MONTHLY", at(5) >= today - 220 * DAY ? "19.99" : "16.99");
    add(at(12), "PAD GOODLIFE FITNESS", "64.99");
    add(at(18), "HYDRO ONE", (120 + (m % 4) * 9.5).toFixed(2));
    for (const d of [3, 11, 19, 26]) add(at(d), "LOBLAWS #1032", (40 + ((m * 7 + d) % 13) * 9.31).toFixed(2));
  }
  for (let t = today - 364 * DAY; t <= today; t += 14 * DAY) add(t, "PAYROLL DEPOSIT ACME", "", "2150.00");
  add(today - 280 * DAY, "NSF FEE", "48.00");
  add(today - 200 * DAY, "NSF FEE", "48.00");
  add(today - 110 * DAY, "HOTEL MIAMI USD 730.00 @ 1.3699", "1000.00");
  add(today - 109 * DAY, "UBER USD 31.00 @ 1.3710", "42.50");
  add(today - 36 * DAY, "RESTAURANT LE MARCHE", "64.20");
  add(today - 36 * DAY, "RESTAURANT LE MARCHE", "64.20");
  return rows.join("\n");
}

const statementPath = join(OUT, "chequing-statement.csv");
writeFileSync(statementPath, demoStatement());

/** A sample household for the screens that need live balances (Plaid isn't connected in the demo). */
function sampleOverview() {
  const accounts = [
    { id: "chq", name: "Chequing · Red bank", type: "depository", subtype: "checking", balance: 3240, available: 3240 },
    { id: "sav", name: "Savings · Green bank", type: "depository", subtype: "savings", balance: 8900, available: 8900 },
    { id: "visa", name: "Visa · Blue bank", type: "credit", subtype: "credit card", balance: 1180, available: null },
    { id: "inv", name: "TFSA + RRSP · Investments", type: "investment", subtype: "tfsa", balance: 18400, available: null },
    { id: "mtg", name: "Mortgage · Purple bank", type: "loan", subtype: "mortgage", balance: 412000, available: null },
  ];
  const series = Array.from({ length: 30 }, (_, i) => ({
    date: iso(today + i * DAY),
    balance: i < 6 ? 3240 - i * 60 : i < 11 ? -455 + (i - 6) * 3 : 1700 - (i - 11) * 30,
  }));
  return {
    complete: true,
    accounts,
    netWorth: { assets: 30540, debts: 413180, net: -382640 },
    forecast: {
      days: 30,
      series,
      low: { date: iso(today + 6 * DAY), balance: -455 },
      bounce: { date: iso(today + 6 * DAY), shortBy: 455, before: ["Mortgage Payment", "Hydro One", "Goodlife Fitness"] },
      cover: { accountId: "sav", name: "Savings · Green bank", amount: 455 },
      safeToSpend: 0,
      payday: iso(today + 11 * DAY),
    },
    leaksPerYear: 0,
    grade: null,
    renewal: null,
  };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
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
        background: rgba(20, 20, 26, 0.92); color: #fff; border-radius: 18px; padding: 14px 18px;
        font: 17px/1.35 PlusJakartaSans_700Bold, system-ui, sans-serif; text-align: center;
        box-shadow: 0 8px 24px rgba(0,0,0,.25); opacity: 0; transform: translateY(12px); transition: opacity .35s, transform .35s; }
      #demo-caption.on { opacity: 1; transform: none; }
      #demo-caption.top { bottom: auto; top: 64px; }
      #demo-caption small { display: block; font-family: PlusJakartaSans_500Medium, system-ui, sans-serif; font-size: 14px; opacity: .8; margin-top: 4px; }
      #demo-card { position: fixed; inset: 0; z-index: 100000; display: flex; flex-direction: column; justify-content: center;
        align-items: center; gap: 14px; padding: 32px; text-align: center; background: #4F3FD0; color: #fff;
        font-family: PlusJakartaSans_500Medium, system-ui, sans-serif; opacity: 0; transition: opacity .5s; pointer-events: none; }
      #demo-card.on { opacity: 1; }
      #demo-card .logo { font: 34px BricolageGrotesque_800ExtraBold, system-ui, sans-serif; }
      #demo-card .logo em { font-style: normal; color: #FFC82E; }
      #demo-card .big { font: 34px/1.15 BricolageGrotesque_800ExtraBold, system-ui, sans-serif; }
      #demo-card .big em { font-style: normal; color: #FFC82E; }
      #demo-card .sub { font-size: 17px; opacity: .9; line-height: 1.4; }
      #demo-tap { position: fixed; z-index: 99998; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
        background: rgba(79, 63, 208, .3); border: 2px solid rgba(79, 63, 208, .85); pointer-events: none;
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

if (SAMPLE_BALANCES) await context.route("**/api/overview", (route) => route.fulfill({ json: sampleOverview() }));

const LOGO = `<div class="logo">Looni<em>.</em></div>`;
const byText = (t) => page.getByText(t, { exact: true }).first();
const tab = (name) => page.getByRole("tab", { name: new RegExp(`${name}$`) });

await page.goto(APP);
await page.getByText("Drop a statement instead").waitFor();
await card(`${LOGO}<div class="big">Find the fees you <em>never noticed.</em></div><div class="sub">Not another budget app. It finds you money, every month.</div>`, 3400);

await caption("Every fee, price rise and double charge, with the receipts");
await wait(2600);
await caption("No bank login needed to try it", "Drop a statement export. The file is never stored.");
await wait(1600);
await tap(page.getByText("Drop a statement instead"), 900);
await wait(1200);
const chooser = page.waitForEvent("filechooser");
await tap(page.getByText("Choose statement files"), 200);
await (await chooser).setFiles(statementPath);
await caption("Reading 12 months of transactions…");
await page.getByText("LEAKING IN THIS FILE, PER YEAR").waitFor({ timeout: 60_000 });
await wait(500);
await caption("Found in seconds. Nothing stored yet.", "Your bank's quiet score, and the one move that saves the most.");
await wait(3600);
await scroll(520, 2200);
await caption("Each leak with a confidence level: HIGH, or CHECK");
await wait(2200);
await tap(page.getByText("Keep these findings on my receipt"), 300);
await page.getByText("Leak Receipt", { exact: true }).waitFor({ timeout: 30_000 });
await wait(600);

await caption("The Leak Receipt", "Every line opens to the charges behind it.", { top: true });
await wait(2800);
await scroll(260, 1400);
await caption("NSF fees above the $10 cap: money the bank owes you back", "", { top: true });
await wait(3000);
await caption("");
await tap(byText("Monthly account fees"), 1200);
await caption("12 charges × $16.95. The rule, the confidence, the evidence.", "", { top: true });
await wait(3400);
await scroll(520, 1800);
await caption("And the exact words to say", "Low-cost accounts are capped at $4 a month.", { top: true });
await wait(2600);
await tap(page.getByText("Copy script"), 1400);
await tap(byText("Confirm"), 1800);
await caption("");
await page.goBack();
await wait(800);

await tap(tab("Home"), 1500);
await caption("Banks, cards, investments, mortgage. One place.", SAMPLE_BALANCES ? "Sample balances: live once a bank is connected." : "");
await wait(3800);
await scroll(560, 1800);
await caption("Bounce risk, renewal, leaks: at a glance");
await wait(2400);
await tap(page.getByText("Bounce risk", { exact: false }).first(), 1500);
await caption("Know before it bounces", "Bills land before payday. Your savings at another bank can cover it.", { top: true });
await wait(4200);
await caption("");
await page.goBack();
await wait(800);

await tap(tab("Move"), 1300);
await caption("Your bank writes at 21 days. Looni starts at 180.", "", { top: true });
await wait(2400);
await page.getByPlaceholder("2027-02-09").fill(iso(today + 112 * DAY));
await page.getByText("Balance (optional)").first().click({ force: true });
await page.keyboard.type("450000", { delay: 40 });
await page.getByText("Letter rate %").first().click({ force: true });
await page.keyboard.type("4.89", { delay: 60 });
await page.getByText("Best quote %").first().click({ force: true });
await page.keyboard.type("4.29", { delay: 60 });
await tap(page.getByText("Start my countdown"), 1400);
await caption("112 days out: get two written quotes and a rate hold", "Reminders at 180, 120, 90 and 21 days.", { top: true });
await wait(3600);
await scroll(520, 1800);
await caption("Signing the letter costs $8,599 more than the best quote", "On $450,000, 4.89% vs 4.29%, over five years.", { top: true });
await wait(3600);
await scroll(560, 2000);
await caption("The switch kit: every payment and deposit, so nothing bounces", "", { top: true });
await wait(3600);
await scroll(820, 2400);
await caption("Rate Block: renewals pooled, lenders bid for the block", "Coming 2027. The commission is split half and half with you.", { top: true });
await wait(2600);
await tap(page.getByText("ON", { exact: true }).first(), 1400);
await wait(1800);

await caption("");
await tap(tab("Loon"), 1400);
await caption("Fix a leak, your loon grows", "One minute a week.", { top: true });
await wait(3200);
await scroll(1400, 2600);
await caption("Newcomer and student tracks: 12 tasks, one a week", "", { top: true });
await wait(3000);
await caption("");

await tap(tab("Home"), 900);
await scroll(2400, 1600);
await tap(page.getByRole("button", { name: "Year receipt", exact: true }), 1400);
await caption("The receipt people share", "Kinds of charges and totals only. No bank or account names.", { top: true });
await wait(4200);
await caption("");

await card(`${LOGO}<div class="big">Not another budget app.<br/><em>It finds you money, every month.</em></div><div class="sub">Read-only. Raw transactions are never stored. Built in Canada.</div>`, 4200);

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
