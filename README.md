# Looni

> "Plaid is the plumbing; our labeled Canadian transaction dataset is the IP."

This is the Phase 1 MVP from the deep-tech blueprint (**Rules + Plaid → ship the Leak Receipt**). Users connect a bank
with Plaid, Looni reads their transactions, runs a deterministic rules engine over them, and shows a **Leak Receipt**:
bank fees, recurring charges, silent price hikes and double charges, each with a yearly cost. With the user's opt-in,
every *confirm* or *dismiss* tap also becomes an anonymous training example for Phase 2's models.

**Looni doesn't keep bank history.** Each scan reads transactions from Plaid into memory, saves only the findings to
an encrypted per-user ledger, and discards the rest. See **[SECURITY.md](SECURITY.md)** for the data inventory and
key hierarchy.

```
mobile/   Expo (SDK 57) + expo-router + React Native Paper. Onboarding → Plaid Link → Leak Receipt
server/   Node + Express + TypeScript. Holds the Plaid secret, syncs transactions, runs the rules engine
```

```
 ┌────────────┐  link_token   ┌──────────────┐  /link/token/create        ┌───────┐
 │ Expo app   │ ────────────▶ │ Looni server │ ─────────────────────────▶ │ Plaid │
 │ Plaid Link │ public_token  │  (Express)   │  /item/public_token/exchange│       │
 │            │ ────────────▶ │  rules engine│  /transactions/sync        │       │
 │ Leak       │ ◀──────────── │  (in memory) │ ◀───────────────────────── │       │
 │ Receipt    │   receipt     │      │       │      webhooks ───────────▶ └───────┘
 └────────────┘  + labels ──▶ │  encrypted   │
                              │  leak ledger │  findings only, never transactions
                              └──────────────┘
```

## 1. Get Plaid sandbox keys (free)

1. Sign up at <https://dashboard.plaid.com/signup>.
2. Go to **Developers → Keys** and copy your `client_id` and **Sandbox** secret.
3. Sandbox uses fake banks and fake money. You never need real credentials.

## 2. Run the server

Requires Node 22.13+ (uses the built-in `node:sqlite`).

```bash
cd server
npm install
cp .env.example .env          # paste PLAID_CLIENT_ID + PLAID_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # → MASTER_KEY in .env
npm run dev                   # http://localhost:4000
npm test                      # rules-engine + security tests
npm run demo:receipt          # prints a Leak Receipt for the built-in test account, no Plaid needed
```

Try the whole pipeline with curl (any UUID works as the user id in the MVP):

```bash
U=$(node -e "console.log(crypto.randomUUID())")
curl -XPOST localhost:4000/api/sandbox/quick-link -H "x-looni-user: $U" -H 'content-type: application/json' -d '{"scenario":"leaky"}'
curl localhost:4000/api/receipt -H "x-looni-user: $U"
```

## 3. Run the app

```bash
cd mobile
npm install
npx expo run:ios        # or: npx expo run:android   (development build, includes the native Plaid Link SDK)
```

Plaid Link is a native module (`react-native-plaid-link-sdk` v13), so it needs a **development build**, not Expo Go.
If you don't have Xcode or Android Studio, use EAS: `npx eas-cli@latest build --profile development`.

You can still use **Expo Go** (`npx expo start`) or the web preview. The *Connect a bank* button is disabled there, and
the **Plaid Sandbox** card offers two shortcuts that create a sandbox connection on the server instead:

| Button | What it does |
| --- | --- |
| **Leaky test account** | Plaid `user_custom` seeded with a Canadian chequing account full of known leaks (bilingual monthly fees, NSF, FX fee, Netflix, a Spotify price hike, a GoodLife PAD, a double charge). Falls back to the Plaid sample data if your Plaid account rejects custom users. |
| **Plaid sample data** | Plaid's `user_transactions_dynamic` realistic transaction history. |

The app reaches the server on your computer's LAN IP (taken from Metro) on port 4000. Set `EXPO_PUBLIC_API_URL` in
`mobile/.env` if the server runs somewhere else.

### Plaid sandbox test credentials (inside Plaid Link)

| Username | Password | Result |
| --- | --- | --- |
| `user_good` | `pass_good` | Basic test account (MFA code `1234` if asked) |
| `user_transactions_dynamic` | any | Realistic recurring transactions. Best for the Leak Receipt |
| `user_good` | `error_ITEM_LOCKED` | Triggers an error, to test error handling |

Pick any institution, e.g. **First Platypus Bank** (`ins_109508`). `PLAID_COUNTRY_CODES=US,CA` also shows Canadian
institutions once Canada is enabled on your Plaid account.

## The Phase 1 rules engine (`server/src/engine`)

| File | What it does |
| --- | --- |
| `fees.ts` | English and French descriptor regexes plus Plaid `personal_finance_category` → NSF, overdraft, monthly account, FX, ATM, transaction, interest, late and annual fees |
| `recurring.ts` | Normalizes merchants (strips PAD/POS/SQ*, store numbers, reference codes), then detects weekly-to-annual cadence, amount stability, active/inactive status and price steps |
| `receipt.ts` | Builds leaks (fee, subscription, price_hike, duplicate) with stable ids, a yearly cost and a feature snapshot. Totals skip dismissed leaks and never double count a price hike |
| `scenario.ts` | Deterministic leaky test account, shared by the tests and the sandbox quick-link |
| `training.ts` | Turns a labeled leak into a de-identified training row (amount ranges, no person-like descriptors) |

**The leak ledger** (`server/src/ledger.ts`) is how Looni keeps track over time without storing transactions. Each
leak has a stable id, first and last seen dates, a status (`open` → `resolved` once it stops showing up in a complete
scan), the user's verdict, and that leak's own charge history. That's enough for "new leak", "you saved $198/yr since
cancelling Netflix" and trend charts.

**Training labels** (`training_labels`) are written only for users who opted in. Each row has a random `subject_id`
(no user id), the consent version, the merchant key, cadence, amount ranges, kind and verdict. These rows train the
Phase 2 recurring and leak classifiers.

## Engagement (`server/src/engagement`)

Everything is computed from the encrypted ledger. No transactions needed.

- **Leak Score** (0–100) with a breakdown that says how to win each point back.
- **Savings:** saved per year and saved to date (pro-rated since each leak stopped). **Loonies** (1 per $1 saved
  plus quest rewards) grow the loon from egg to chick to fledgling to loon.
- **Outcome streaks:** fee-free days, months without an NSF. They break only when money leaks, never for not opening
  the app.
- **Weekly Leak Hunt:** 3 swipe cards a week. A hunt streak with one forgiven miss per month.
- **Quests and badges,** including a seasonal Fall Cleanup.
- **Suspicious-charge alerts** (`server/src/engine/anomaly.ts`): card testing, a large first charge from a new merchant,
  foreign currency from a new merchant, and a "zombie" subscription that keeps charging after you said you don't need
  it. "Not me" returns the steps to take.
- **Alerts and push:**
  - Kinds: renewals (0–2 days ahead), new fees, price hikes, new leaks, suspicious charges, Monday hunt, monthly
    report.
  - Each alert is created once and goes to the inbox.
  - At most 2 non-security pushes per 7 days. Quiet hours in the user's time zone.
  - Security alerts always push.
  - **Amounts are hidden on the lock screen by default.**

Push needs a development build and an EAS project id (`npx eas-cli@latest init` in `mobile/`). Android also needs FCM
credentials uploaded to EAS.

## Design

The custom UI is being designed in Google Stitch. See **[design/STITCH_BRIEF.md](design/STITCH_BRIEF.md)** for the
brand brief, the style preamble and the 14 screen prompts. Mocks go in `design/mocks/`. `mobile/src/ui/tokens.ts`
holds the design tokens (placeholders until the mocks land).

## API

| Method | Path | |
| --- | --- | --- |
| POST | `/api/consent` | `{ training: boolean }`: the opt-in for anonymous training examples |
| POST | `/api/link/token` | Create a Plaid `link_token` |
| POST | `/api/link/update-token` | `{ itemId }` → a `link_token` in update mode, to repair a broken connection |
| POST | `/api/link/exchange` | `{ publicToken, institution }` → stores the encrypted access token, then scans |
| POST | `/api/sandbox/quick-link` | Sandbox only. `{ scenario: "leaky" \| "dynamic" }` |
| POST | `/api/scan` | Re-scan now: read from Plaid, update the ledger, return the receipt |
| GET | `/api/receipt` | The Leak Receipt, from the ledger (works while a bank is disconnected) |
| GET | `/api/transactions` | Accounts and recent transactions, **live from Plaid, not stored** |
| POST | `/api/labels` | `{ leakId, verdict: "confirmed" \| "dismissed" }` |
| DELETE | `/api/me` | Removes the Plaid items and deletes the user. Their key is destroyed |
| POST | `/webhooks/plaid` | Plaid webhooks (signature verified): rescans and connection status |
| GET | `/api/home` | Leak Score (+ how to raise it), saved per year / to date, loonies, level, streaks, upcoming renewals, hunt state, celebrations |
| GET | `/api/hunt` | This week's Leak Hunt (3 cards) and the hunt streak |
| GET | `/api/quests` · POST `/api/quests/:id/complete` | Quests; auto ones complete from the ledger, self-reported ones via POST |
| GET | `/api/badges` · POST `/api/badges/seen` | Achievements |
| GET | `/api/alerts` · POST `/api/alerts/read` | The alert inbox (every alert, pushed or not) |
| POST/DELETE | `/api/push-token` | Register an Expo push token (sealed with the user's key) |
| GET/PUT | `/api/settings/notifications` | Push on/off, hide amounts (default on), quiet hours, alert kinds, time zone |
| GET | `/api/share` | Privacy-safe numbers for the share card |
| GET | `/api/report?month=YYYY-MM` | Monthly Leak Report |

All `/api` calls need an `x-looni-user` header: an anonymous UUID the app keeps in SecureStore. **Replace it with real
auth before production.**

## Working with the GitHub repo

This repo is `github.com/DipinAnand/Loonie`.

```bash
git clone https://github.com/DipinAnand/Loonie.git && cd Loonie
git checkout claude/plaid-onboarding-expo-mvp-mfmzjo     # the MVP branch, until it's merged
```

- Open a PR from the branch into `main` on GitHub to review and merge.
- To use Claude Code on the web with this repo, connect GitHub at claude.ai/code and pick `DipinAnand/Loonie` when you
  start a session. Each session works on its own branch and pushes there.
- To build the app in the cloud on every push, link the repo in expo.dev → your project → **GitHub** (run
  `npx eas-cli@latest init` in `mobile/` first).

## Not in this MVP (on purpose)

Real auth, AWS KMS wiring, Plaid OAuth redirect setup for production banks, hosted Postgres, and any ML. The full
pre-launch list is in [SECURITY.md](SECURITY.md#before-production-not-done-in-the-mvp).
