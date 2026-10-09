# Looni: Google Stitch design brief

How to use this:
1. In Stitch, choose **Mobile** (an app, not web).
2. Start a project with the **Style preamble** below. Then paste one **screen prompt** at a time into the same
   project, so every screen stays on one visual system.
3. Generate 2–3 variants of the **Home** and **Leak reveal** screens first. They set the tone for everything else.
   Pick a favourite, then ask Stitch to "match the style of [screen]" for the rest.
4. Send back, per screen: a **PNG** and the **code export (HTML/Tailwind)**, and a Figma export if you use Figma. Put
   them in `design/mocks/` (e.g. `06-home.png`, `06-home.html`) or upload them in chat. I take the exact colours, type,
   spacing and corner radii from the code export, so please include it.

---

## Brand brief

**Looni** finds the money Canadians lose without noticing: junk bank fees, forgotten subscriptions, silent price
hikes, double charges and suspicious charges. It connects read-only to every bank and shows a **Leak Receipt**, then
keeps watch and pings you before money leaves.

- **Personality:** a sharp, warm friend who's good with money. Playful, never childish. Confident, never preachy.
  Tagline energy: *"Your bank won't tell you. Looni will."*
- **Canadian, not cliché:** no maple-leaf overload. The loon (the bird on the $1 loonie) is the mascot: a simple,
  geometric loon that grows as you save (egg → chick → fledgling → loon). Points are called **loonies**.
- **Feeling to aim for:** the satisfaction of finding money in an old coat pocket. Every screen should make saving
  feel like *winning*, not like doing chores.
- **References for the bar we want:** the polish of Revolut and Monzo, the delight of Duolingo, the restraint of
  Copilot Money, the shareability of Spotify Wrapped.

## Style preamble (paste first, every time)

```
Design a premium iOS-style mobile app called "Looni", a Canadian money app that finds hidden fees,
forgotten subscriptions and price hikes. Visual style: modern, bold and playful but trustworthy, like
Revolut meets Duolingo. Deep night-indigo dark theme as primary (background #0F0D1A, elevated surfaces
#1A1730), with a light theme variant later. Brand colors: electric indigo #6C5CE7 (primary), loonie gold
#E8B931 (money, highlights, rewards), mint green #2ED8A3 (savings, success), coral red #FF5D5D (leaks,
warnings). Large, confident numerals for money (rounded geometric sans like "Plus Jakarta Sans" or
"Satoshi", tabular figures). Generous spacing, 24px corner radius cards, soft glows and subtle gradients
instead of hard shadows, glassmorphism only for sheets and the tab bar. A friendly geometric loon
mascot (simple shapes, indigo body, gold beak) appears sparingly. Icons: rounded line icons. Bottom tab
bar: Home, Hunt, Quests, Alerts, Me. Use realistic Canadian data (CAD $, Big Six banks, Interac,
bilingual fee names). No stock photos.
```

## Screen prompts

### 01 · Onboarding story (3 swipeable panels)
```
Onboarding carousel with 3 full-screen panels and page dots, "Skip" top right, big primary button bottom.
Panel 1: headline "Canadians lose ~$250 a year to bank fees alone." with an illustration of coins
dripping out of a cracked piggy bank, gold coins glowing. Panel 2: "Looni scans every account and finds
the leaks." showing three floating cards (Netflix $16.49/mo, NSF fee $48, Spotify +$2 price hike) with
coral "leak" tags. Panel 3: "Plug them. Watch your savings grow." showing the loon mascot standing on a
growing stack of gold loonie coins, a mint "+$612 saved" pill. Button: "Find my leaks".
```

### 02 · Consent: "Your data, your call"
```
Trust screen titled "How Looni handles your bank data". Four stacked rows with large rounded icons:
"We read, then let go" (eye-off), "We keep only the findings" (shield-key), "Read-only, always"
(lock), "Gone when you say so" (key being destroyed). Below, a highlighted card with a toggle:
"Help improve leak detection: share anonymous examples (merchant, how often, a price range). Never your
name, account or exact amounts." Calm, reassuring, lots of breathing room, small loon mascot holding a
shield in the header. Primary button "Continue".
```

### 03 · Connect a bank
```
Screen to connect a bank via Plaid. Title "Connect your accounts". A 2-column grid of bank tiles with
logos-as-monograms: RBC, TD, Scotiabank, BMO, CIBC, National Bank, Tangerine, Simplii, EQ Bank,
Desjardins, plus "Search 10,000+ institutions" field on top. Footer note with lock icon: "Secured by
Plaid. Looni can't move money or see your password." Primary button "Continue with Plaid".
```

### 04 · Scanning
```
Full-screen scanning state. The loon mascot in the center diving underwater (stylised waves), with a
circular radar sweep in indigo. Below, a live checklist that ticks off one by one: "Reading 12 months of
transactions ✓", "Checking 58 bank fees…", "Finding recurring charges…", "Looking for price hikes…".
A subtle counter "1,284 transactions scanned". Dark, focused, anticipation-building.
```

### 05 · Leak reveal (the "wow" moment)
```
Dramatic reveal screen. Top small caps label "YOU'RE LEAKING". Giant gold count-up number "$1,412"
with "/ year" beside it, glowing, confetti-like particles in coral and gold. Below, a horizontal stacked
bar showing the split: Subscriptions $1,197, Bank fees $327, Price hikes $24, Double charges $90, with a
legend. Three preview cards peeking from the bottom: "GoodLife Fitness $779.88/yr", "Monthly account
fees $210.91/yr", "Netflix $197.88/yr". Primary button "Let's plug them", secondary text button
"Share my receipt".
```

### 06 · Home (dashboard)
```
Home dashboard. Header: "Hi Dipin" with loon avatar (fledgling stage) and a gold loonies counter "612 🪙".
Hero card: circular Leak Score ring 0–100 showing 72 in mint-to-indigo gradient, label "Leak Score",
"+8 this month", and a hint "Review 3 leaks to reach 80". Next to it two stat tiles: "Saved so far
$184.20" (mint) and "Still leaking $1,214/yr" (coral). Section "Coming up" with a horizontal list of
renewal chips: "Netflix · tomorrow · $16.49", "iCloud · in 4 days · $4.99", "Prime · Nov 2 · $99/yr"
with a "Cancel?" link. Card "This week's Leak Hunt: 3 cards waiting · 5-week streak 🔥". Card "Fee-free
for 47 days" with a mini progress track. Bottom tab bar.
```

### 07 · Weekly Leak Hunt (swipe cards)
```
Tinder-style swipe deck screen titled "Leak Hunt · Week 41" with progress "1 of 3". Front card: large
merchant monogram "GoodLife Fitness", "$64.99 monthly · since April", a tiny sparkline of charges, and
the question "Still using it?". Buttons under the deck: a round coral "Plug it" (swipe left) and a round
mint "Keep it" (swipe right), with arrow hints. Behind it, two stacked cards slightly rotated. Top right:
streak flame "5". Playful, tactile, Duolingo-energy.
```

### 08 · Leak detail
```
Detail screen for a leak "Spotify raised its price". Header with Spotify monogram, coral pill "Price
hike +18%". Big line: "$10.99 → $12.99 / month". A bar chart of the last 6 monthly charges with the
step-up highlighted in coral. "Costs you $24 more per year". Section "What you can do" with three action
rows: "Switch to Spotify Duo/Family" , "Cancel subscription (guide)", "Remind me before next charge".
Section "Tracked since May 2026 · last seen Oct 1". Buttons at bottom: "I knew" (secondary) and
"Didn't know: it's a leak" (primary).
```

### 09 · Quests
```
Quests screen. Top: level progress bar "Fledgling → Loon: 612 / 1,000 loonies". List of quest cards,
each with an icon, title, reward pill and progress: "Plug an unused subscription · +100 🪙 · saves up to
$780/yr" (in progress), "Get a bank fee refunded · +75 🪙 · we'll give you the script" , "Move idle cash
to a high-interest account · +150 🪙 · +$225/yr", "Switch to a cheaper phone plan · +120 🪙 · CRTC fee
ban helps", completed quest greyed with a mint check. Seasonal banner on top: "Fall Cleanup: plug 3
leaks before Nov 30".
```

### 10 · Achievements & the loon
```
Profile achievements screen. Center: large loon mascot at "Fledgling" stage on a lake, with the four
growth stages shown as a small timeline below (Egg, Chick, Fledgling, Loon), current stage highlighted.
Grid of badges (hexagonal, gold rim when unlocked, greyscale when locked): "First leak plugged", "$100
saved/yr", "$500 saved/yr", "$1,000 saved/yr", "6 months fee-free", "4-week hunt streak", "Price-hike
spotter", "Scam spotter". Unlocked badge has a soft gold glow.
```

### 11 · Share card
```
A vertical 9:16 share card for Instagram stories, generated from the app. Bold indigo-to-night
gradient, loon mascot, huge gold text "I found $1,412/yr in leaks", sub "and plugged $612 of them with
Looni", stats row "7 leaks plugged · Leak Score 72", footer "looni.app · Your bank won't tell you."
No bank names or merchants. Also show the in-app share sheet behind it with "Hide amounts" toggle.
```

### 12 · Alerts inbox
```
Alerts screen with grouped notifications (Today, This week). Alert rows with colored icon badges:
coral shield "Suspicious charge: $1.00 at an unknown merchant (TD Visa)" with buttons "This was me" /
"Not me"; gold "Netflix renews tomorrow: $16.49"; coral "New fee: NSF $48 at RBC · Get refund script";
indigo "Spotify raised its price +$2/mo"; mint "You plugged GoodLife Fitness: +$779.88/yr saved 🎉".
Unread dot, swipe to dismiss hint. Top segmented control: All · Security · Money.
```

### 13 · Privacy & settings
```
Settings screen. Sections: "Connections" (RBC Chequing ••4242 healthy green dot, Tangerine "needs
login" amber dot with Reconnect button), "Notifications" (toggles: Renewal reminders, Price hikes, New
fees, Suspicious charges, Weekly Leak Hunt; "Hide amounts on lock screen" ON; quiet hours 9pm–8am),
"Privacy" (Share anonymous examples toggle, "What Looni stores" link, "Download my data"), and a
destructive "Disconnect & delete everything" at the bottom. Clean grouped list style, iOS-like.
```

### 14 · Looni Pro paywall
```
Paywall screen "Looni Pro". Top: the loon mascot wearing a tiny gold crown, headline "Pays for itself:
Pro members save $380/yr on average" (placeholder). Feature list with icons: Renewal & trial alerts,
Suspicious charge alerts, Cash-flow warnings before NSF fees, Unlimited banks, Monthly Leak Report,
Bill negotiation (coming soon). Two plan cards: Monthly $6.99, Yearly $59.99 "Save 28%" (selected,
gold border). Primary button "Start 7-day free trial", fine print "Cancel anytime. Of course we'll
remind you before it renews." Restore purchases link.
```

---

## Motion notes (I build these in code, so Stitch doesn't need to animate)
- **Count-ups** on every money number (leak total, saved). Haptic tick at the end.
- **The Leak Score ring** fills on load, and pulses mint when the score goes up.
- **Swipe deck** with physics: the card tilts while dragging, coral or mint tint by direction, and a haptic on commit.
- **Confetti** (gold and mint) on plugged leaks, quest completions and badge unlocks.
- **The loon** idles (blink, bob on the water) and celebrates when it levels up.
- **Shared-element transition** from leak cards into the leak detail screen.
