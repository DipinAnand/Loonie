/**
 * Looni design tokens, taken from loonifinancial.com (the site's CSS variables).
 * src/theme.ts maps these onto React Native Paper; nothing else in the app
 * should hard-code a colour, size or radius.
 */
export const palette = {
  lavender: "#7C6CF0",
  lavenderDeep: "#4F3FD0",
  lavenderSoft: "#B8A9E8",
  yellow: "#FFC82E",
  green: "#12805A",
  leak: "#C2410C",
  ink: "#14141A",
  paper: "#FFFFFF",
} as const;

export const colors = {
  light: {
    bg: "#F6F5FB",
    surface: palette.paper,
    surfaceHigh: "#F0EDFE",
    text: palette.ink,
    textMuted: "#6C6A76",
    border: "#ECEAF2",
    primary: palette.lavenderDeep,
    onPrimary: palette.paper,
    money: "#5E4B00",
    moneyBg: "#FFF5D2",
    saved: palette.green,
    leak: palette.leak,
  },
  dark: {
    bg: "#111116",
    surface: "#1B1A22",
    surfaceHigh: "#24232C",
    text: "#F2F1F6",
    textMuted: "#B4B2BE",
    border: "#2E2D36",
    primary: palette.lavenderSoft,
    onPrimary: "#22186B",
    money: palette.yellow,
    moneyBg: "#4A3B00",
    saved: "#6FD3A8",
    leak: "#FF9E73",
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
