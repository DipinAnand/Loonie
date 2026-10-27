# Looni design system: calm

The app shows money, which makes people anxious when there is too much of it on screen. Every screen
answers one question with one number, and puts the detail one tap away.

Code: tokens in `mobile/src/theme.ts` (`space`, `layout`, `radius`, `type`, `calmColors`), components in
`mobile/src/components/calm.tsx`. Mock-ups: the "Calm redesign" page of the design canvas.

## Rules

1. **One hero number per screen.** Everything else supports it. Home: what you're leaking this year.
2. **Colour is a signal, not decoration.** Lavender for actions, orange only on money leaking, green only on
   money saved or coming in. Everything else is ink and grey on white.
3. **Lists, not boxes.** Rows separated by hairlines. The only filled surface is a `Callout`, for a single
   message (a heads-up, the words to say).
4. **Three weights.** Regular, semibold, and the display face (Bricolage Grotesque) for the hero and the
   screen title only.
5. **Air.** 24px side margins, 32px between sections, rows at least 56px tall.
6. **Plain words.** Sentence-case labels, no ALL CAPS, no badges. Confidence is a small dot plus "Certain"
   or "Check it".
7. **Detail on tap.** Home summarises; the next screen explains; the one after that proves it.

## Tokens

| Token | Values |
| --- | --- |
| `space` | xs 4, s 8, m 12, l 16, xl 24, xxl 32, xxxl 48 |
| `layout` | margin 24, section 32, rowMin 56, tabBar 84 |
| `radius` | s 8, m 14 (buttons), l 16 (callouts), full |
| `type.hero` | Bricolage 700, 52/58, tabular numbers |
| `type.title` | Bricolage 700, 28/34 (screen titles) |
| `type.heading` | Plus Jakarta 600, 17/24 |
| `type.body` / `bodyStrong` | Plus Jakarta 400 / 600, 16/22 |
| `type.secondary` | Plus Jakarta 400, 14/20 (subtitles) |
| `type.label` | Plus Jakarta 600, 13/18 (section labels, sentence case) |
| `type.caption` | Plus Jakarta 400, 12/16 (small print only) |

| Colour (light / dark) | Use |
| --- | --- |
| `bg` #FFFFFF / #111116 | Every screen |
| `soft` #F6F5FB / #1C1B23 | Callouts only |
| `line` #ECEAF2 / #2A2932 | Hairlines |
| `text`, `textSecondary`, `textTertiary` | Ink, subtitles, small print (all pass 4.5:1 on `bg` except tertiary, which is for non-essential notes at 12px+) |
| `action` #4F3FD0 / #B8A9E8 | Buttons, links, the current tab |
| `leak` #C2410C / #FF9E73 | Money leaking |
| `saved` #12805A / #6FD3A8 | Money saved, deposits |
| `caution` + `cautionDot` | "Check it" findings |
| `loonie` #FFC82E | The loonie dot and the mascot only |

## Components

| Component | Use when | Don't |
| --- | --- | --- |
| `Screen` | Every screen: margins, section gaps, optional title, pinned `footer` for the primary action | Nest scroll views inside it |
| `Hero` | The one number a screen exists for | Use twice on a screen |
| `Section` | A labelled group of rows, with an optional "See all" | Wrap it in a card |
| `Row` | Anything listed: leaks, bills, accounts, payments. Chevron appears when it opens something | Put more than one number in it |
| `Callout` | One message that needs a moment: the heads-up, the script | Stack several in a row |
| `Button` | `primary`: the single main action. `secondary`: the quiet alternative under it | Two primaries on one screen |
| `Progress` | A thin 4px line for steps done | Thick bars or rings |
| `Note` | Small print, sources, privacy lines | Information the user needs to act |

## Screen recipes

- **Home:** greeting, `Hero` (leaking this year), one `Button` (review the leaks), next move `Row`,
  coming up `Section` (3 rows), one heads-up `Callout` if money may bounce, accounts `Row`.
- **Leak Receipt:** title, total `Hero`, one `Row` per leak, `Note`.
- **Evidence:** `Hero` (yearly cost), one sentence, thin chart, script `Callout`, `Button` pair in the footer.
- **Move:** `Hero` (days to renewal) with `Progress`, the action `Callout`, rows into the switch kit,
  the Rate Block and calculators.
