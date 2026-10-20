import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { brand } from "../theme";

/** Rounded white card, the site's basic surface. */
export function Panel({ children, style, onPress, tone = "plain" }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: Tone }) {
  const theme = useTheme();
  const t = tones(theme.dark)[tone];
  const body = <View style={[styles.panel, { backgroundColor: t.bg, borderColor: t.border }, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

export type Tone = "plain" | "lavender" | "yellow" | "green" | "leak" | "ink";

export function tones(dark: boolean): Record<Tone, { bg: string; fg: string; border: string }> {
  if (dark) {
    return {
      plain: { bg: "#1B1A22", fg: "#F2F1F6", border: "#2E2D36" },
      lavender: { bg: "#2E2660", fg: "#E4DEFF", border: "#2E2660" },
      yellow: { bg: "#4A3B00", fg: "#FFE9A3", border: "#4A3B00" },
      green: { bg: "#0B4A33", fg: "#C9F2DF", border: "#0B4A33" },
      leak: { bg: "#5A2108", fg: "#FFDCCB", border: "#5A2108" },
      ink: { bg: "#000000", fg: "#FFFFFF", border: "#2E2D36" },
    };
  }
  return {
    plain: { bg: "#FFFFFF", fg: brand.ink, border: brand.line },
    lavender: { bg: brand.lavender50, fg: brand.lavenderDeep, border: brand.lavender50 },
    yellow: { bg: brand.yellow50, fg: brand.onYellow, border: brand.yellow50 },
    green: { bg: brand.green50, fg: brand.green, border: brand.green50 },
    leak: { bg: brand.leak50, fg: brand.leak, border: brand.leak50 },
    ink: { bg: brand.ink, fg: "#FFFFFF", border: brand.ink },
  };
}

/** Small caps label above a figure ("LEAKING THIS YEAR"). */
export function Overline({ children, color }: { children: ReactNode; color?: string }) {
  const theme = useTheme();
  return <Text style={[styles.overline, { color: color ?? theme.colors.onSurfaceVariant }]}>{children}</Text>;
}

export function Pill({ label, tone = "lavender" }: { label: string; tone?: Tone }) {
  const theme = useTheme();
  const t = tones(theme.dark)[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <Text style={[styles.pillText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Big tabular figure for money and counts. */
export function Figure({ children, size = 48, color }: { children: ReactNode; size?: number; color?: string }) {
  const theme = useTheme();
  return (
    <Text style={{ fontSize: size, lineHeight: size * 1.08, fontWeight: "800", letterSpacing: -size / 28, color: color ?? theme.colors.onSurface, fontVariant: ["tabular-nums"] }}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text variant="titleLarge" style={{ fontWeight: "800" }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Horizontal progress bar (switch kit, tracks, loon level). */
export function Bar({ value, color, track }: { value: number; color?: string; track?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: track ?? theme.colors.primaryContainer }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(1, value)) * 100}%`, backgroundColor: color ?? theme.colors.primary }]} />
    </View>
  );
}

export const gradeTone: Record<string, Tone> = { A: "green", B: "lavender", C: "yellow", D: "leak" };

const styles = StyleSheet.create({
  panel: { borderRadius: 24, borderWidth: 1, padding: 18, gap: 10 },
  overline: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "800" },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  bar: { height: 10, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
});
