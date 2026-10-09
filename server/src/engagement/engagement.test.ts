import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), "looni-eng-")), "test.db");
process.env.MASTER_KEY = randomBytes(32).toString("base64");

const { isoWeek, localNow } = await import("./time.js");
const { leakScore } = await import("./score.js");
const { huntStreak, levelFor, savedToDate, outcomeStreaks } = await import("./progress.js");
const { evaluateQuests } = await import("./quests.js");
const { buildCandidates, deliverAlerts, hashToken } = await import("./notify.js");
const { homeFor, notifyUser, alertInbox } = await import("./service.js");
const { currentHunt } = await import("./hunt.js");
const { getUser, upsertPushToken, setNotifySettings, setTimezone } = await import("../db.js");
const { sealForUser } = await import("../keys.js");
const { applyScan, ensureUser, labelLeak, readReceipt } = await import("../ledger.js");
const { buildLeakReceipt } = await import("../engine/receipt.js");
const { leakyScenario } = await import("../engine/scenario.js");
import type { LedgerLeak } from "../ledger.js";

const leak = (over: Partial<LedgerLeak>): LedgerLeak => ({
  id: randomUUID(),
  kind: "subscription",
  status: "open",
  isNew: false,
  firstSeen: "2026-09-01",
  lastSeen: "2026-10-01",
  resolvedAt: null,
  verdict: null,
  verdictAt: null,
  title: "Netflix (monthly)",
  detail: "",
  merchantKey: "netflix",
  annualImpact: 197.88,
  meta: {},
  history: [],
  ...over,
});

describe("time", () => {
  it("computes ISO weeks, including year boundaries", () => {
    assert.equal(isoWeek("2026-10-09"), "2026-W41");
    assert.equal(isoWeek("2026-01-01"), "2026-W01");
    assert.equal(isoWeek("2027-01-01"), "2026-W53");
  });
  it("gives the local date and hour in the user's time zone", () => {
    const n = localNow(new Date("2026-10-09T03:30:00Z"), "America/Vancouver");
    assert.deepEqual([n.date, n.hour], ["2026-10-08", 20]);
  });
});

describe("leak score", () => {
  it("is 100 with nothing to fix and explains every lost point", () => {
    assert.equal(leakScore([], [], [], "2026-10-09").score, 100);
    const s = leakScore(
      [
        leak({ kind: "fee", merchantKey: "nsf", annualImpact: 100, history: [{ date: "2026-10-01", amount: 48 }] }),
        leak({ verdict: "confirmed" }),
        leak({}),
      ],
      [],
      [leak({ kind: "suspicious" })],
      "2026-10-09",
    );
    // fees -10, unwanted sub still charging -8, two unreviewed (the fee and the plain leak) -4, suspicious -10
    assert.equal(s.score, 100 - 10 - 8 - 4 - 10);
    assert.ok(s.breakdown.every((b) => b.hint.length > 0));
  });
  it("rewards plugged leaks", () => {
    assert.equal(leakScore([leak({})], [leak({ status: "resolved", verdict: "confirmed" })], [], "2026-10-09").score, 100);
  });
});

describe("progress", () => {
  it("pro-rates savings since each leak stopped", () => {
    const r = [leak({ status: "resolved", verdict: "confirmed", resolvedAt: "2026-07-11", annualImpact: 365 })];
    assert.equal(savedToDate(r, "2026-10-09"), 90);
    assert.equal(savedToDate([{ ...r[0], verdict: "dismissed" }], "2026-10-09"), 0);
  });
  it("levels up on loonies", () => {
    assert.equal(levelFor(0).level, "egg");
    assert.deepEqual(levelFor(612), { level: "fledgling", next: { level: "loon", at: 1000 } });
    assert.equal(levelFor(5000).next, null);
  });
  it("counts hunt weeks with one forgiven miss per month", () => {
    assert.equal(huntStreak(new Set(["2026-W41", "2026-W40", "2026-W39"]), "2026-10-09"), 3);
    // This week not done yet: count from last week.
    assert.equal(huntStreak(new Set(["2026-W40", "2026-W39"]), "2026-10-09"), 2);
    // W39 missed but forgiven (first miss that month), W37 missed too in the same month → stop.
    assert.equal(huntStreak(new Set(["2026-W41", "2026-W40", "2026-W38", "2026-W36"]), "2026-10-09"), 3);
    assert.equal(huntStreak(new Set(), "2026-10-09"), 0);
  });
  it("tracks fee-free days from the last fee charge", () => {
    const s = outcomeStreaks([leak({ kind: "fee", merchantKey: "nsf", history: [{ date: "2026-08-10", amount: 48 }] })], "2026-10-09");
    assert.deepEqual(s, { feeFreeDays: 60, nsfFreeMonths: 2 });
  });
});

describe("quests", () => {
  it("auto-completes from the ledger and hides seasonal quests out of season", () => {
    const ctx = {
      today: "2026-10-20",
      open: [leak({})],
      resolved: [leak({ status: "resolved", verdict: "confirmed", resolvedAt: "2026-10-15", kind: "subscription" })],
      huntStreak: 4,
    };
    const { quests, newlyCompleted } = evaluateQuests(ctx, new Map());
    assert.ok(newlyCompleted.includes("plug_subscription"));
    assert.ok(newlyCompleted.includes("hunt_streak_4"));
    assert.ok(quests.some((q) => q.id === "fall_cleanup_2026"));
    const later = evaluateQuests({ ...ctx, today: "2027-01-05" }, new Map());
    assert.ok(!later.quests.some((q) => q.id === "fall_cleanup_2026"));
    // Already completed stays completed, not "new".
    assert.ok(!evaluateQuests(ctx, new Map([["plug_subscription", "2026-10-16"]])).newlyCompleted.includes("plug_subscription"));
  });
});

describe("alert candidates", () => {
  const base = { lastScanAt: "2026-10-09 10:00:00", lastScanComplete: true, totalAnnualImpact: 0, savedPerYear: 0, transactionCount: 0, windowStart: null, resolved: [], connections: [] };

  it("reminds before renewals, hides amounts in the private text, and skips subscriptions the user keeps", () => {
    const sub = leak({ meta: { nextExpectedDate: "2026-10-10", lastAmount: 16.49 } });
    const kept = leak({ id: "kept", verdict: "dismissed", meta: { nextExpectedDate: "2026-10-10", lastAmount: 4.99 } });
    const c = buildCandidates({ ...base, leaks: [sub, kept], suspicious: [] }, { today: "2026-10-09", weekday: 4, huntRemaining: 0 });
    assert.equal(c.length, 1);
    assert.equal(c[0].title, "Netflix renews tomorrow");
    assert.ok(c[0].body.includes("$16.49"));
    assert.ok(!c[0].privateBody.includes("$"));
  });

  it("puts security first and adds the Monday hunt and the monthly report", () => {
    const c = buildCandidates(
      { ...base, leaks: [], suspicious: [leak({ kind: "suspicious", title: "$1.00 at QWKMART" })] },
      { today: "2026-11-01", weekday: 0, huntRemaining: 3 },
    );
    assert.deepEqual(c.map((x) => x.kind), ["suspicious", "hunt", "report"]);
    assert.equal(c.at(-1)!.title, "Your October Leak Report");
  });
});

describe("delivery", () => {
  async function userWithToken(settings = {}) {
    const id = randomUUID();
    await ensureUser(id);
    setTimezone(id, "America/Toronto");
    setNotifySettings(id, JSON.stringify(settings));
    const u = getUser(id)!;
    const token = `ExponentPushToken[${randomUUID()}]`;
    upsertPushToken(id, hashToken(token), await sealForUser(id, u.wrapped_dek, token, "push"));
    return getUser(id)!;
  }
  const sent: { to: string; title: string; body: string }[][] = [];
  const sender = { send: async (m: { to: string; title: string; body: string }[]) => (sent.push(m), { deadTokens: [] }) };
  const receiptWith = (leaks: LedgerLeak[], suspicious: LedgerLeak[] = []) => ({
    lastScanAt: null, lastScanComplete: true, totalAnnualImpact: 0, savedPerYear: 0, transactionCount: 0, windowStart: null, resolved: [], connections: [], leaks, suspicious,
  });
  const noon = new Date("2026-10-08T16:00:00Z"); // 12:00 in Toronto, a Thursday
  const night = new Date("2026-10-09T02:00:00Z"); // 22:00 in Toronto

  it("creates each alert once, caps non-security pushes at 2 a week, and hides amounts", async () => {
    const user = await userWithToken();
    const subs = ["a", "b", "c"].map((id) => leak({ id, title: `Svc ${id} (monthly)`, meta: { nextExpectedDate: "2026-10-09", lastAmount: 9.99 } }));
    const first = await deliverAlerts(user, receiptWith(subs), { now: noon, huntRemaining: 0, sender });
    assert.equal(first.created.length, 3);
    assert.equal(first.pushed.length, 2);
    assert.ok(first.pushed.every((p) => !p.body.includes("$")));

    const again = await deliverAlerts(user, receiptWith(subs), { now: noon, huntRemaining: 0, sender });
    assert.equal(again.created.length, 0, "idempotent");
    assert.equal((await alertInbox(user)).length, 3, "the inbox has all of them");
  });

  it("holds money alerts during quiet hours but always pushes security alerts", async () => {
    const user = await userWithToken();
    const sub = leak({ meta: { nextExpectedDate: "2026-10-09", lastAmount: 9.99 } });
    const sus = leak({ kind: "suspicious", title: "$1.00 at QWKMART" });
    const r = await deliverAlerts(user, receiptWith([sub], [sus]), { now: night, huntRemaining: 0, sender });
    assert.deepEqual(r.created.map((c) => c.kind), ["suspicious"]);
    assert.equal(r.pushed.length, 1);
  });

  it("shows amounts only when the user opts in, and respects turned-off kinds", async () => {
    const user = await userWithToken({ hideAmounts: false, kinds: { renewal: false } });
    const sub = leak({ meta: { nextExpectedDate: "2026-10-09", lastAmount: 9.99 } });
    const fee = leak({ kind: "fee", title: "Monthly account fees", history: [{ date: "2026-10-07", amount: 16.95 }] });
    const r = await deliverAlerts(user, receiptWith([sub, fee]), { now: noon, huntRemaining: 0, sender });
    assert.deepEqual(r.created.map((c) => c.kind), ["fee"]);
    assert.ok(r.pushed[0].body.includes("$16.95"));
  });
});

describe("home, end to end on a seeded ledger", () => {
  it("returns score, savings, hunt and celebrations from real scans", async () => {
    const id = randomUUID();
    let user = await ensureUser(id);
    const today = new Date().toISOString().slice(0, 10);
    const txns = leakyScenario(today).map((t, i) => ({ id: `t${i}`, accountId: "a", date: t.date, amount: t.amount, name: t.description }));
    await applyScan(user, buildLeakReceipt(txns, { asOf: today }), txns, { today, complete: true });

    const hunt = await currentHunt(user, today);
    assert.equal(hunt.total, 3);
    for (const card of hunt.cards) await labelLeak(user, card.id, card.merchantKey === "netflix" ? "confirmed" : "dismissed");
    const netflix = (await readReceipt(user)).leaks.find((l) => l.merchantKey === "netflix")!;
    if (!netflix.verdict) await labelLeak(user, netflix.id, "confirmed");

    const noNetflix = txns.filter((t) => !t.name.startsWith("NETFLIX"));
    await applyScan(user, buildLeakReceipt(noNetflix, { asOf: today }), noNetflix, { today, complete: true });
    user = getUser(id)!;

    const home = await homeFor(user);
    assert.equal((await currentHunt(user, home.today)).completed, true);
    assert.equal(home.savedPerYear, 197.88);
    assert.ok(home.score.score > 0 && home.score.score <= 100);
    assert.ok(home.celebrate.badges.some((b) => b.id === "first_plug"));
    assert.ok(home.celebrate.badges.some((b) => b.id === "saved_100"));
    assert.ok(home.celebrate.quests.includes("plug_subscription"));
    assert.ok(home.loonies >= 100, "quest reward counted");
    assert.equal(home.streaks.huntWeeks, 1);

    // Celebrations fire once.
    const again = await homeFor(user);
    assert.equal(again.celebrate.badges.length, 0);
    assert.equal(again.celebrate.quests.length, 0);

    // notifyUser runs without a device token and still fills the inbox.
    await notifyUser(user, new Date(), { send: async () => ({ deadTokens: [] }) });
  });
});
