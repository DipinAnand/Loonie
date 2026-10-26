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
    background: brand.soft,
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
