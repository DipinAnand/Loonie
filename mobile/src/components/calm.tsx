import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { calmColors, type CalmColors, layout, radius, space, type } from "../theme";

/**
 * The calm system's building blocks (design/DESIGN_SYSTEM.md). Screens compose these
 * instead of styling boxes themselves, so every screen gets the same rhythm:
 * one hero number, hairline lists, colour only where money moves.
 */

export function useCalm(): CalmColors {
  return useTheme().dark ? calmColors.dark : calmColors.light;
}

export type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];
export type Tone = "default" | "secondary" | "leak" | "saved" | "caution" | "action";

function toneColor(c: CalmColors, tone: Tone): string {
  return { default: c.text, secondary: c.textSecondary, leak: c.leak, saved: c.saved, caution: c.caution, action: c.action }[tone];
}

/** A scrolling screen with the standard margins and section spacing. `safeTop` for tab screens without a header. */
export function Screen({
  children,
  title,
  subtitle,
  safeTop = false,
  refreshing,
  onRefresh,
  footer,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  safeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned under the scroll area (a primary action). */
  footer?: ReactNode;
}) {
  const c = useCalm();
  const body = (
    <>
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
      >
        {(title || subtitle) && (
          <View style={{ gap: space.s }}>
            {title && (
              <Text accessibilityRole="header" style={[type.title, { color: c.text }]}>
                {title}
              </Text>
            )}
            {subtitle && <Text style={[type.body, { color: c.textSecondary }]}>{subtitle}</Text>}
          </View>
        )}
        {children}
      </ScrollView>
      {footer && <View style={[styles.footer, { borderColor: c.line, backgroundColor: c.bg }]}>{footer}</View>}
    </>
  );
  return safeTop ? (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: c.bg }}>
      {body}
    </SafeAreaView>
  ) : (
    <View style={{ flex: 1, backgroundColor: c.bg }}>{body}</View>
  );
}

/** The one big number on a screen: a plain label above, an optional sentence below. */
export function Hero({
  label,
  value,
  unit,
  caption,
  tone = "default",
  captionTone = "secondary",
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
  tone?: Tone;
  captionTone?: Tone;
}) {
  const c = useCalm();
  return (
    <View style={{ gap: space.s }} accessible accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}. ${caption ?? ""}`}>
      <Text style={[type.body, { color: c.textSecondary }]}>{label}</Text>
      <Text style={[type.hero, { color: toneColor(c, tone), fontVariant: ["tabular-nums"] }]}>
        {value}
        {unit && <Text style={[type.body, { color: c.textSecondary, letterSpacing: 0 }]}>{` ${unit}`}</Text>}
      </Text>
      {caption && <Text style={[type.body, { color: toneColor(c, captionTone) }]}>{caption}</Text>}
    </View>
  );
}

/** A group of rows under a small label. The rows draw their own hairlines; the section closes the last one. */
export function Section({ title, action, children }: { title?: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const c = useCalm();
  return (
    <View>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? (
            <Text accessibilityRole="header" style={[type.label, { color: c.textSecondary }]}>
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action && (
            <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={14}>
              <Text style={[type.label, { color: c.action }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.line }}>{children}</View>
    </View>
  );
}

/** A list row: title and subtitle on the left, a value on the right, a chevron when it opens something. */
export function Row({
  title,
  subtitle,
  value,
  valueTone = "default",
  subtitleTone = "secondary",
  onPress,
  left,
  right,
  dot,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: Tone;
  subtitleTone?: Tone;
  onPress?: () => void;
  left?: ReactNode;
  /** Replaces the value and chevron (a switch, a small button). */
  right?: ReactNode;
  /** A small coloured dot before the subtitle (confidence, status). */
  dot?: Tone;
  accessibilityLabel?: string;
}) {
  const c = useCalm();
  const content = (
    <>
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: c.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle && (
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            {dot && <View style={[styles.dot, { marginTop: 7 }, { backgroundColor: dot === "caution" ? c.cautionDot : toneColor(c, dot) }]} />}
            <Text style={[type.secondary, { color: toneColor(c, subtitleTone), flexShrink: 1 }]} numberOfLines={onPress ? 2 : undefined}>
              {subtitle}
            </Text>
          </View>
        )}
      </View>
      {right ??
        (value !== undefined && (
          <Text style={[type.body, { color: toneColor(c, valueTone), fontVariant: ["tabular-nums"] }]}>{value}</Text>
        ))}
      {onPress && !right && <MaterialCommunityIcons name="chevron-right" size={20} color={c.chevron} />}
    </>
  );
  const style = [styles.row, { borderTopColor: c.line }];
  // Read a plain row as one item; a row with its own control (switch, checkbox) stays separate so the control is reachable.
  if (!onPress)
    return (
      <View style={style} accessible={!right} accessibilityLabel={right ? undefined : (accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(", "))}>
        {content}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(", ")}
      style={({ pressed }) => [...style, pressed && { backgroundColor: c.soft }]}
    >
      {content}
    </Pressable>
  );
}

/** The only filled surface: a soft block for one message (a heads-up, the script to say). */
export function Callout({
  title,
  children,
  onPress,
  action,
  style,
}: {
  title?: string;
  children?: ReactNode;
  onPress?: () => void;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const c = useCalm();
  const body = (
    <View style={[styles.callout, { backgroundColor: c.soft }, style]}>
      <View style={{ flex: 1, gap: space.xs + 2 }}>
        {title && <Text style={[type.bodyStrong, { color: c.text }]}>{title}</Text>}
        {typeof children === "string" ? <Text style={[type.secondary, { color: c.textSecondary }]}>{children}</Text> : children}
        {action && (
          <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={12} style={{ alignSelf: "flex-start", paddingTop: space.xs }}>
            <Text style={[type.label, { color: c.action, fontSize: 14 }]}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {onPress && <MaterialCommunityIcons name="chevron-right" size={20} color={c.chevron} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {body}
    </Pressable>
  );
}

/** Primary: one per screen. Secondary: quiet text button underneath. Danger: a text button for destructive actions. */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const c = useCalm();
  const primary = variant === "primary";
  const fg = primary ? c.onAction : variant === "danger" ? c.leak : c.action;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: c.action } : { minHeight: 48 },
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <MaterialCommunityIcons name={icon} size={18} color={fg} />}
          <Text style={[type.bodyStrong, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** A text field: plain label above, soft filled box, no outline until focused. */
export function Field({ label, prefix, suffix, style, ...input }: TextInputProps & { label: string; prefix?: string; suffix?: string }) {
  const c = useCalm();
  return (
    <View style={[{ gap: space.s, flex: 1 }, style as StyleProp<ViewStyle>]}>
      <Text style={[type.label, { color: c.textSecondary }]}>{label}</Text>
      <View style={[styles.field, { backgroundColor: c.soft }]}>
        {prefix && <Text style={[type.body, { color: c.textSecondary }]}>{prefix}</Text>}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.textTertiary}
          {...input}
          style={[type.body, { flex: 1, color: c.text, paddingVertical: 0, minHeight: 24 }]}
        />
        {suffix && <Text style={[type.body, { color: c.textSecondary }]}>{suffix}</Text>}
      </View>
    </View>
  );
}

/** A thin progress line (switch kit, tracks, renewal). */
export function Progress({ value, tone = "action" }: { value: number; tone?: Tone }) {
  const c = useCalm();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: c.line }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: toneColor(c, tone) }} />
    </View>
  );
}

/** Small print under a section: sources, privacy notes. */
export function Note({ children }: { children: ReactNode }) {
  const c = useCalm();
  return <Text style={[type.caption, { color: c.textTertiary, lineHeight: 18 }]}>{children}</Text>;
}

/** Loading or empty state, centred. */
export function Centered({ children }: { children?: ReactNode }) {
  const c = useCalm();
  return <View style={[styles.centered, { backgroundColor: c.bg }]}>{children ?? <ActivityIndicator color={c.action} />}</View>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: layout.margin, paddingTop: space.xl, paddingBottom: space.xxxl, gap: layout.section },
  footer: { paddingHorizontal: layout.margin, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth, gap: space.xs },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: space.s },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, minHeight: layout.rowMin, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth },
  dot: { width: 6, height: 6, borderRadius: 3 },
  callout: { flexDirection: "row", alignItems: "center", gap: space.m, padding: space.xl - 4, borderRadius: radius.l },
  button: { minHeight: 52, borderRadius: radius.m, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s, paddingHorizontal: space.l },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  field: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 52, borderRadius: radius.m - 2, paddingHorizontal: space.l },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxl },
});
