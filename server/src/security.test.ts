import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

// Config is read at import time, so set the environment before loading the app modules.
const dir = mkdtempSync(join(tmpdir(), "looni-test-"));
process.env.DATABASE_PATH = join(dir, "test.db");
process.env.MASTER_KEY = randomBytes(32).toString("base64");
process.env.MASTER_KEY_ID = "k1";

const { seal, open, keyIdOf } = await import("./crypto.js");
const { sealAccessToken, openAccessToken, openForUser, forgetDek } = await import("./keys.js");
const { db, deleteUserRow, getUser, insertItem, leaksForUser, setConsent } = await import("./db.js");
const { applyScan, ensureUser, labelLeak, readReceipt } = await import("./ledger.js");
const { buildLeakReceipt } = await import("./engine/receipt.js");
const { leakyScenario } = await import("./engine/scenario.js");
const { amountBucket, toTrainingFeatures } = await import("./engine/training.js");
const { verifyPlaidWebhook } = await import("./webhooks.js");
const { redact } = await import("./log.js");

const AS_OF = "2026-10-01";
const scenario = leakyScenario(AS_OF).map((t, i) => ({ id: `t${i}`, accountId: "a1", date: t.date, amount: t.amount, name: t.description }));

describe("crypto", () => {
  const keyring = { current: "k1", keys: new Map([["k1", randomBytes(32)]]) };

  it("round-trips and tags the key id", () => {
    const sealed = seal(keyring, "secret", "ctx");
    assert.equal(keyIdOf(sealed), "k1");
    assert.equal(open(keyring, sealed, "ctx").toString(), "secret");
    assert.ok(!sealed.includes("secret"));
  });

  it("rejects tampering and ciphertexts moved to another context", () => {
    const sealed = seal(keyring, "secret", "token:item-a");
    const parts = sealed.split(".");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 1;
    parts[3] = data.toString("base64");
    assert.throws(() => open(keyring, parts.join("."), "token:item-a"));
    assert.throws(() => open(keyring, sealed, "token:item-b"));
  });

  it("keeps old ciphertexts readable after a key rotation", () => {
    const old = seal(keyring, "before", "ctx");
    const rotated = { current: "k2", keys: new Map([...keyring.keys, ["k2", randomBytes(32)]]) };
    assert.equal(open(rotated, old, "ctx").toString(), "before");
    assert.equal(keyIdOf(seal(rotated, "after", "ctx")), "k2");
  });

  it("binds access tokens to their item", async () => {
    const sealed = await sealAccessToken("access-sandbox-123", "item-1");
    assert.equal(await openAccessToken(sealed, "item-1"), "access-sandbox-123");
    await assert.rejects(openAccessToken(sealed, "item-2"));
  });
});

describe("ledger", () => {
  it("tracks leaks across scans, resolves only on complete scans, and counts savings", async () => {
    const user = await ensureUser(randomUUID());
    const first = await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: "2026-10-01", complete: true });
    assert.ok(first.added > 0);
    const ids1 = leaksForUser(user.id).map((l) => [l.leak_id, l.first_seen]);

    const again = await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: "2026-10-02", complete: true });
    assert.equal(again.added, 0);
    assert.deepEqual(
      leaksForUser(user.id).map((l) => [l.leak_id, l.first_seen]),
      ids1,
    );

    const receipt = await readReceipt(user);
    assert.ok(receipt.leaks.every((l) => !l.isNew), "nothing is 'new' on the day of the first scan");
    const netflix = receipt.leaks.find((l) => l.kind === "subscription" && l.merchantKey === "netflix")!;
    assert.ok(netflix.history.length >= 3, "keeps the leak's own charge history");
    await labelLeak(user, netflix.id, "confirmed");

    // User cancels Netflix: the next scans no longer see it.
    const withoutNetflix = scenario.filter((t) => !t.name.startsWith("NETFLIX"));
    await applyScan(user, buildLeakReceipt(withoutNetflix, { asOf: AS_OF }), withoutNetflix, { today: "2026-10-03", complete: false });
    assert.equal((await readReceipt(user)).resolved.length, 0, "a partial scan must not resolve anything");

    await applyScan(user, buildLeakReceipt(withoutNetflix, { asOf: AS_OF }), withoutNetflix, { today: "2026-10-04", complete: true });
    const after = await readReceipt(user);
    assert.equal(after.resolved[0].id, netflix.id);
    assert.equal(after.resolved[0].resolvedAt, "2026-10-04");
    assert.equal(after.savedPerYear, netflix.annualImpact);
  });
});

describe("data at rest", () => {
  it("stores no raw transactions and no readable merchant data", async () => {
    const user = await ensureUser(randomUUID());
    insertItem({ item_id: "item-x", user_id: user.id, access_token_enc: await sealAccessToken("access-sandbox-zzz", "item-x"), institution_enc: null });
    await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: AS_OF, complete: true });

    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    assert.ok(!tables.includes("transactions") && !tables.includes("accounts"));

    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const path = process.env.DATABASE_PATH!;
    const bytes = [path, `${path}-wal`].filter(existsSync).map((p) => readFileSync(p).toString("latin1").toLowerCase()).join("");
    for (const needle of ["netflix", "spotify", "goodlife", "loblaws", "access-sandbox", "16.49"]) {
      assert.ok(!bytes.includes(needle), `found "${needle}" in the database file`);
    }
  });

  it("makes a deleted user's findings unreadable, even from a backup copy", async () => {
    const user = await ensureUser(randomUUID());
    await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: AS_OF, complete: true });
    const backup = leaksForUser(user.id)[0];

    deleteUserRow(user.id);
    forgetDek(user.wrapped_dek);
    assert.equal(getUser(user.id), undefined);
    assert.equal(leaksForUser(user.id).length, 0);

    // A restored backup row is useless without that user's key; another user's key can't open it.
    const other = await ensureUser(randomUUID());
    await assert.rejects(openForUser(user.id, other.wrapped_dek, backup.payload_enc, `leak:${backup.leak_id}`));
  });
});

describe("training labels", () => {
  const rows = () => db.prepare("SELECT * FROM training_labels").all() as Record<string, string>[];

  it("writes nothing without consent", async () => {
    const before = rows().length;
    const user = await ensureUser(randomUUID());
    await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: AS_OF, complete: true });
    await labelLeak(user, leaksForUser(user.id)[0].leak_id, "confirmed");
    assert.equal(rows().length, before);
  });

  it("writes de-identified rows with consent", async () => {
    const before = rows().length;
    const id = randomUUID();
    await ensureUser(id);
    setConsent(id, true, "2026-10");
    const user = getUser(id)!;
    await applyScan(user, buildLeakReceipt(scenario, { asOf: AS_OF }), scenario, { today: AS_OF, complete: true });
    const netflix = (await readReceipt(user)).leaks.find((l) => l.merchantKey === "netflix")!;
    await labelLeak(user, netflix.id, "confirmed");

    const row = rows().at(-1)!;
    assert.equal(rows().length, before + 1);
    assert.ok(!Object.keys(row).includes("user_id"));
    assert.notEqual(row.subject_id, id);
    assert.ok(!row.features.includes("16.49") && !row.features.includes("NETFLIX.COM"));
    assert.equal(JSON.parse(row.features).lastAmount, "10-20");
  });

  it("drops leaks that could name a person and buckets amounts", () => {
    assert.equal(toTrainingFeatures({ kind: "duplicate", merchantKey: "e-transfer john smith", features: {}, annualImpact: 50 }), null);
    assert.equal(amountBucket(16.49), "10-20");
    assert.equal(amountBucket(22200), "5000+");
  });
});

describe("plaid webhooks", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const fetchKey = async () => ({ ...jwk, expired_at: null });
  const now = 1_800_000_000;

  function jwtFor(body: Buffer, iat = now) {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const h = enc({ alg: "ES256", kid: "kid-1", typ: "JWT" });
    const p = enc({ iat, request_body_sha256: createHash("sha256").update(body).digest("hex") });
    const sig = sign("sha256", Buffer.from(`${h}.${p}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
    return `${h}.${p}.${sig}`;
  }

  const body = Buffer.from(JSON.stringify({ webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "x" }));

  it("accepts a valid signature", async () => {
    assert.equal(await verifyPlaidWebhook(body, jwtFor(body), fetchKey, now), true);
  });
  it("rejects a changed body, an old token, a missing header and alg=none", async () => {
    assert.equal(await verifyPlaidWebhook(Buffer.from(body.toString().replace("x", "y")), jwtFor(body), fetchKey, now), false);
    assert.equal(await verifyPlaidWebhook(body, jwtFor(body, now - 600), fetchKey, now), false);
    assert.equal(await verifyPlaidWebhook(body, undefined, fetchKey, now), false);
    const [, p, s] = jwtFor(body).split(".");
    const none = Buffer.from(JSON.stringify({ alg: "none", kid: "kid-1" })).toString("base64url");
    assert.equal(await verifyPlaidWebhook(body, `${none}.${p}.${s}`, fetchKey, now), false);
  });
});

describe("log redaction", () => {
  it("masks tokens and drops transaction fields", () => {
    const out = JSON.stringify(redact({ msg: "bad access-sandbox-0f3c-11aa", txn: { name: "NETFLIX", amount: 16.49 }, code: "X" }));
    assert.ok(!out.includes("0f3c") && !out.includes("NETFLIX") && !out.includes("16.49"));
    assert.ok(out.includes('"code":"X"'));
  });
});
