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
npm test                      # engine, security and engagement tests
npm run demo:receipt          # prints a Leak Receipt for the built-in test account, no Plaid needed
npm run smoke                 # with the server running: checks the whole demo path against Plaid Sandbox
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
| **Leaky test account** | Plaid `user_custom` seeded with a Canadian chequing account full of known leaks (bilingual monthly fees, NSF, FX fee, Netflix, a Spotify price hike, a GoodLife PAD, a double charge, Crave renewing tomorrow, and a $1 card-testing charge that triggers a suspicious-charge alert). Falls back to the Plaid sample data if your Plaid account rejects custom users. |
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

## Recording the demo video

**Before you record**
1. Put your Plaid **Sandbox** keys and a `MASTER_KEY` in `server/.env` (see step 2 above).
2. Start the server: `cd server && npm run dev`.
3. In a second terminal, run `npm run smoke`. Every line should be ✓, ending with "Ready to record". Two common
   failures:
   - "Plaid accepted the leaky test account" shows ✗: Plaid fell back to its sample data, which has fewer leaks.
     The demo still works, but the receipt will be smaller.
   - An error mentioning Canada: set `PLAID_COUNTRY_CODES=US` in `server/.env` and restart the server.
4. Start the app (`cd mobile && npx expo start`) on a phone on the same Wi-Fi, or in the iOS simulator. Expo Go is
   fine with the **Leaky test account** button. Use a development build only if you want to film Plaid's own
   bank-login screen (log in with `user_good` / `pass_good`).
5. Turn on Do Not Disturb, and set the phone to dark or light mode to match the look you want.

**Shot list**
1. Welcome → **Scan my accounts**.
2. Consent: show the four promises, flip on "Help improve leak detection" → **Continue**.
3. Connect → **Leaky test account**. Show the "Scanning…" screen.
4. Leak Receipt:
   - Pause on the yearly total.
   - Scroll the leaks: GoodLife, Crave, bank fees, Netflix, the Spotify price hike, the double charge.
5. The suspicious **$1.00 at QWKMART** card at the top → **Not me**. Show the four steps.
6. Mark a few leaks: **Don't need it** on GoodLife, **Keep it** on iCloud. The total updates.
7. Tap the calendar icon (top right) → **Bills**. Show "Bills may bounce" ($455.59 short before payday), the late
   daycare payment, the hydro spike, and the ⋮ menu (remind me 1/3/7 days before).
8. Back → tap the list icon → live accounts and transactions ("not stored by Looni").
9. Back → scroll down → **Disconnect & delete my data**. This doubles as the privacy story.

**Reset between takes:** step 9 wipes everything, so each take starts from the welcome screen.

**Or record it automatically.** `scripts/record-demo.mjs` drives the web build through the same story at phone size,
with captions and title cards, and writes a 2× MP4 (about 90 seconds). It needs the server running, Playwright and
ffmpeg:

```bash
cd mobile && EXPO_PUBLIC_API_URL=http://localhost:4000 npx expo export -p web --output-dir dist
npx serve -s dist -l 8090            # any static server with a single-page fallback
cd .. && node scripts/record-demo.mjs demo-out   # → demo-out/looni-demo.mp4
```

Home (Leak Score, Coming up), the Leak Hunt, Quests and the Alerts inbox already work on the server. They show up in
the app once the screens are built from the Stitch mocks; record the final video after that.

## The Phase 1 rules engine (`server/src/engine`)

| File | What it does |
| --- | --- |
| `fees.ts` | English and French descriptor regexes plus Plaid `personal_finance_category` → NSF, overdraft, monthly account, FX, ATM, transaction, interest, late and annual fees |
| `recurring.ts` | Normalizes merchants (strips PAD/POS/SQ*, store numbers, reference codes), then detects weekly-to-annual cadence, amount stability, active/inactive status and price steps |
| `receipt.ts` | Builds leaks (fee, subscription, price_hike, duplicate) with stable ids, a yearly cost and a feature snapshot. Refunds and reversals cancel their debit first. NSF fees above the $10 cap (since 2026-03-12) are their own finding; foreign purchases get a 2.5% spread estimate when no FX fee line shows. Totals skip dismissed leaks and never double count a price hike |
| `advice.ts` | Rule version (`v1.3`), confidence (high / check), a fix line and the exact words to say for every finding; the A–D "quiet score"; the one next move ranked by dollars saved |
| `switchkit.ts` | Every recurring deposit and payment (PADs, payroll, mortgage), deposits first, for moving banks without anything bouncing |
| `renewal.ts` | Mortgage countdown: 180 / 120 / 90 / 21-day milestones, the action for each, alert timing |
| `forecast.ts` | "Know before it bounces": 30 days of chequing balance from live balances plus the switch kit, the first short day, and which other account can cover it; net worth |
| `bills.ts` | Bill tracker: every active bill (rent, utilities, insurance, card and loan payments, subscriptions) with its next date, paydays from recurring income, late bills, unusual amounts, and whether the balance covers the bills due before the next payday |
| `scenario.ts` | Deterministic leaky test account, shared by the tests and the sandbox quick-link |
| `training.ts` | Turns a labeled leak into a de-identified training row (amount ranges, no person-like descriptors) |

Also on the server: `statement/csv.ts` reads CSV/TXT statement exports (ported from the loonifinancial.com scan:
delimiter, header and column detection, English and French dates and amounts, card payments and transfers never
counted as spending), `tools/calc.ts` holds the /tools calculators (they reproduce the site's published figures),
and `engagement/tracks.ts` the newcomer and student tracks.

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
    report, bills due (3 days ahead by default, per bill), late bills, and "bills may bounce before payday" (checked
    right after each scan, while the balance is in memory).
  - Each alert is created once and goes to the inbox.
  - At most 2 non-security pushes per 7 days. Quiet hours in the user's time zone.
  - Security alerts always push.
  - **Amounts are hidden on the lock screen by default.**

Push needs a development build and an EAS project id (`npx eas-cli@latest init` in `mobile/`). Android also needs FCM
credentials uploaded to EAS.

## Design

The app now uses the loonifinancial.com look: lavender, loonie yellow, green and burnt orange on white
(`mobile/src/theme.ts`, `mobile/src/ui/tokens.ts`). Five tabs: **Home** (net worth, bounce risk, renewal, leaks,
next move), **Receipt** (the Leak Receipt; every line opens its evidence and script), **Move** (renewal countdown,
switch kit, Rate Block pool), **Loon** (level, weekly check, quests, newcomer/student tracks, badges) and **Alerts**.
Plus statement import, the 30-day forecast, calculators and a shareable year receipt.
[design/STITCH_BRIEF.md](design/STITCH_BRIEF.md) is the earlier dark-theme brief.

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
| GET | `/api/bills` | Bills, paydays and the before-payday check. The balance is read **live from Plaid, not stored** (`?balance=0` skips it) |
| PUT | `/api/bills/:id` | `{ hidden?, remindDays? }`: hide something that isn't a bill, or change the reminder lead time (0–14 days) |
| GET | `/api/hunt` | This week's Leak Hunt (3 cards) and the hunt streak |
| GET | `/api/quests` · POST `/api/quests/:id/complete` | Quests; auto ones complete from the ledger, self-reported ones via POST |
| GET | `/api/badges` · POST `/api/badges/seen` | Achievements |
| GET | `/api/alerts` · POST `/api/alerts/read` | The alert inbox (every alert, pushed or not) |
| POST/DELETE | `/api/push-token` | Register an Expo push token (sealed with the user's key) |
| GET/PUT | `/api/settings/notifications` | Push on/off, hide amounts (default on), quiet hours, alert kinds, time zone |
| GET | `/api/share` | Privacy-safe numbers for the share card |
| GET | `/api/report?month=YYYY-MM` | Monthly Leak Report |
| POST | `/api/statements` | `{ files: [{ name, text }], save?: boolean }`: CSV/TXT statement import. Preview stores nothing; `save: true` stores findings only |
| GET | `/api/overview` | Net worth and the 30-day forecast, from **live balances, not stored** |
| GET | `/api/receipt/year?year=YYYY` | What your banks charged you that year, line by line, and what's fixed |
| GET/PUT/DELETE | `/api/renewal` | Mortgage maturity date (+ optional balance and rates) → countdown, milestones, letter cost, biweekly savings |
| GET · POST | `/api/switch-kit` · `/api/switch-kit/:key` | Recurring deposits and payments; `{ moved }` ticks |
| GET · POST | `/api/tracks` · `/api/tracks/:track/:task` | Newcomer and student tracks; `{ done }` ticks |
| GET · POST/DELETE | `/api/rate-block` · `/api/rate-block/join` | Rate Block pool pledge per province and renewal quarter (`{ province }`) |
| POST | `/api/tools/:id` | Calculators: `renewal`, `biweekly`, `break`, `rateblock`, `credit`, `budget`, `tfsa`, `rentvbuy`, `car` |

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

Real auth, AWS KMS wiring, Plaid OAuth redirect setup for production banks, hosted Postgres, and any ML. From the
website: PDF statement parsing, Pro billing, the AI coach, referral payouts, the household/family view, French UI,
and the Rate Block's actual lender negotiation (the app only takes pledges; it shows no group rate until a pool opens). The full
pre-launch list is in [SECURITY.md](SECURITY.md#before-production-not-done-in-the-mvp).
