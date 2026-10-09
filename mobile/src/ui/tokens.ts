/**
 * Looni design tokens.
 *
 * PLACEHOLDER VALUES, taken from design/STITCH_BRIEF.md. When the Stitch mocks
 * come back, these get replaced with the exact values from the code export,
 * and every component in src/ui reads from here. Nothing else in the app
 * should hard-code a colour, size or radius.
 */
export const palette = {
  indigo: "#6C5CE7",
  gold: "#E8B931",
  mint: "#2ED8A3",
  coral: "#FF5D5D",
  night: "#0F0D1A",
  nightRaised: "#1A1730",
  white: "#FFFFFF",
} as const;

export const colors = {
  dark: {
    bg: palette.night,
    surface: palette.nightRaised,
    surfaceHigh: "#24203F",
    text: "#F4F2FF",
    textMuted: "#A39FC0",
    border: "rgba(255,255,255,0.08)",
    primary: palette.indigo,
    onPrimary: palette.white,
    money: palette.gold,
    saved: palette.mint,
    leak: palette.coral,
    glow: "rgba(108,92,231,0.35)",
  },
  light: {
    bg: "#FBFAFF",
    surface: palette.white,
    surfaceHigh: "#F1EEFF",
    text: "#17142B",
    textMuted: "#6B6787",
    border: "rgba(23,20,43,0.08)",
    primary: palette.indigo,
    onPrimary: palette.white,
    money: "#B98A00",
    saved: "#13A57A",
    leak: "#E04444",
    glow: "rgba(108,92,231,0.18)",
  },
} as const;

export type ColorScheme = keyof typeof colors;
export type Colors = (typeof colors)[ColorScheme];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const;

/** Font families get loaded with expo-font once the mocks pick a typeface. */
export const type = {
  display: { fontSize: 56, lineHeight: 60, fontWeight: "800" as const, letterSpacing: -1.5 },
  h1: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const, letterSpacing: -0.5 },
  h2: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const },
  title: { fontSize: 18, lineHeight: 24, fontWeight: "700" as const },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
  overline: { fontSize: 12, lineHeight: 16, fontWeight: "700" as const, letterSpacing: 1.6, textTransform: "uppercase" as const },
  /** Money is always tabular so count-ups don't jitter. */
  money: { fontVariant: ["tabular-nums" as const] },
} as const;

export const motion = {
  /** Spring for cards, sheets and the swipe deck. */
  spring: { damping: 18, stiffness: 180, mass: 1 },
  countUpMs: 1200,
  ringFillMs: 900,
} as const;
