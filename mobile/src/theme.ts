import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

// Looni palette from loonifinancial.com: lavender (brand), loonie yellow (money, next moves),
// green (saved, verified), burnt orange (leaks). Text-on-white shades all pass 4.5:1.
export const brand = {
  lavender: "#7C6CF0",
  lavenderDeep: "#4F3FD0",
  lavender50: "#F0EDFE",
  lavender200: "#D8D0FA",
  yellow: "#FFC82E",
  yellow50: "#FFF5D2",
  onYellow: "#5E4B00",
  green: "#12805A",
  green50: "#E3F4EB",
  leak: "#C2410C",
  leak50: "#FDECE4",
  ink: "#14141A",
  mute: "#6C6A76",
  line: "#ECEAF2",
  soft: "#F6F5FB",
};

/**
 * The site's type: Bricolage Grotesque for headlines and money, Plus Jakarta Sans for everything else.
 * Custom fonts pick their weight by file, not by fontWeight, so styles name the file directly
 * (`fontFamily: font.heavy`) instead of setting fontWeight.
 */
export const font = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  heavy: "PlusJakartaSans_800ExtraBold",
  display: "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
} as const;

// Paper's type scale on the site's fonts. fontWeight stays "400" so browsers don't fake-bold a face that is already bold.
const fonts = configureFonts({
  config: Object.fromEntries(
    Object.entries(MD3LightTheme.fonts).map(([variant, style]) => {
      const family = /^(display|headline)/.test(variant)
        ? font.display
        : /^title/.test(variant)
          ? font.bold
          : /^label/.test(variant)
            ? font.semibold
            : font.regular;
      return [variant, { ...style, fontFamily: family, fontWeight: "400" as const }];
    }),
  ),
});

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  fonts,
  roundness: 5,
  colors: {
    ...MD3LightTheme.colors,
    primary: brand.lavenderDeep,
    onPrimary: "#FFFFFF",
    primaryContainer: brand.lavender50,
    onPrimaryContainer: brand.lavenderDeep,
    secondary: brand.onYellow,
    onSecondary: "#FFFFFF",
    secondaryContainer: brand.yellow50,
    onSecondaryContainer: brand.onYellow,
    tertiary: brand.green,
    tertiaryContainer: brand.green50,
    onTertiaryContainer: "#0B5A3F",
    error: brand.leak,
    errorContainer: brand.leak50,
    onErrorContainer: "#7A2906",
    background: "#FFFFFF",
    onBackground: brand.ink,
    surface: "#FFFFFF",
    onSurface: brand.ink,
    surfaceVariant: brand.soft,
    onSurfaceVariant: brand.mute,
    outline: "#CFCCD9",
    outlineVariant: brand.line,
    elevation: { ...MD3LightTheme.colors.elevation, level1: "#FFFFFF", level2: "#FFFFFF" },
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  fonts,
  roundness: 5,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#B8A9E8",
    onPrimary: "#22186B",
    primaryContainer: "#2E2660",
    onPrimaryContainer: "#E4DEFF",
    secondary: brand.yellow,
    onSecondary: "#2E2400",
    secondaryContainer: "#4A3B00",
    onSecondaryContainer: "#FFE9A3",
    tertiary: "#6FD3A8",
    tertiaryContainer: "#0B4A33",
    onTertiaryContainer: "#C9F2DF",
    error: "#FF9E73",
    errorContainer: "#5A2108",
    onErrorContainer: "#FFDCCB",
    background: "#111116",
    onBackground: "#F2F1F6",
    surface: "#1B1A22",
    onSurface: "#F2F1F6",
    surfaceVariant: "#24232C",
    onSurfaceVariant: "#B4B2BE",
    outline: "#4A4855",
    outlineVariant: "#2E2D36",
  },
};

// ---- calm system (design/DESIGN_SYSTEM.md) --------------------------------------------------
// One hero number per screen, colour only as a signal, hairline lists instead of filled cards.

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
/** Screen side margin, gap between sections, smallest tappable row. */
export const layout = { margin: 24, section: 32, rowMin: 56, tabBar: 84 } as const;
export const radius = { s: 8, m: 14, l: 16, full: 999 } as const;

/** The whole type scale. Display face only for `hero` and `title`. */
export const type = {
  hero: { fontFamily: font.displayBold, fontSize: 52, lineHeight: 58, letterSpacing: -1.5 },
  title: { fontFamily: font.displayBold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  secondary: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
} as const;

export interface CalmColors {
  bg: string;
  /** Callouts and inputs: the only filled surface. */
  soft: string;
  line: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  chevron: string;
  /** Buttons, links, the current tab. */
  action: string;
  onAction: string;
  /** Money leaking. Nothing else is orange. */
  leak: string;
  /** Money saved or coming in. Nothing else is green. */
  saved: string;
  /** "Check it" findings: a dot plus this text colour. */
  caution: string;
  cautionDot: string;
  loonie: string;
}

export const calmColors: { light: CalmColors; dark: CalmColors } = {
  light: {
    bg: "#FFFFFF",
    soft: brand.soft,
    line: brand.line,
    text: brand.ink,
    textSecondary: brand.mute,
    textTertiary: "#706E7A",
    chevron: "#B4B2BE",
    action: brand.lavenderDeep,
    onAction: "#FFFFFF",
    leak: brand.leak,
    saved: brand.green,
    caution: "#7A5D00",
    cautionDot: "#E0A800",
    loonie: brand.yellow,
  },
  dark: {
    bg: "#111116",
    soft: "#1C1B23",
    line: "#2A2932",
    text: "#F2F1F6",
    textSecondary: "#B4B2BE",
    textTertiary: "#8E8C98",
    chevron: "#5C5A66",
    action: "#B8A9E8",
    onAction: "#16112E",
    leak: "#FF9E73",
    saved: "#6FD3A8",
    caution: "#F2CF5B",
    cautionDot: "#E0A800",
    loonie: brand.yellow,
  },
};
