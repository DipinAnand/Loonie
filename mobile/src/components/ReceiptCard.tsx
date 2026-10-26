import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { money } from "../lib/format";
import type { Grade, Leak } from "../lib/types";
import { brand, font } from "../theme";
import { LoonMark } from "./LoonMark";

const MONO = { fontFamily: "monospace" as const };
const cadence = /\s\((weekly|biweekly|monthly|quarterly|annual)\)$/;

/**
 * The Leak Receipt as on loonifinancial.com: a paper receipt with a number,
 * dashed rules, one line per leak with its confidence, and the yearly total.
 * Every line opens the charges behind it. Always light, like paper.
 */
export function ReceiptCard({
  leaks,
  total,
  grade,
  number,
  subtitle,
  onOpen,
  edgeColor = brand.soft,
}: {
  leaks: Pick<Leak, "id" | "title" | "detail" | "annualImpact" | "meta" | "verdict">[];
  total: number;
  grade: Grade | null;
  number: string;
  subtitle: string;
  onOpen?: (id: string) => void;
  /** The screen behind the card, so the torn edge reads as cut out. */
  edgeColor?: string;
}) {
  return (
    <View style={styles.paper}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Leak Receipt</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        <Text style={[styles.sub, MONO]}>NO. {number}</Text>
      </View>
      <View style={styles.rule} />
      {leaks.map((l) => (
        <Pressable
          key={l.id}
          onPress={onOpen ? () => onOpen(l.id) : undefined}
          accessibilityRole={onOpen ? "button" : undefined}
          accessibilityHint={onOpen ? "Opens the charges behind it" : undefined}
          style={({ pressed }) => [styles.line, pressed && { opacity: 0.6 }, l.verdict === "dismissed" && { opacity: 0.45 }]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.lineTitle}>{l.title.replace(cadence, "")}</Text>
            <Text style={styles.sub} numberOfLines={1}>
              {l.detail}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={styles.amount}>{money(l.annualImpact)}</Text>
            {l.meta.confidence && (
              <Text style={[styles.conf, { color: l.meta.confidence === "high" ? brand.leak : brand.onYellow }]}>
                {l.meta.confidence === "high" ? "HIGH" : "CHECK"}
              </Text>
            )}
          </View>
        </Pressable>
      ))}
      {leaks.length === 0 && <Text style={styles.sub}>Nothing leaking. Looni keeps watching.</Text>}
      <View style={styles.rule} />
      <View style={styles.totalRow}>
        <Text style={styles.lineTitle}>Leaking this year</Text>
        <Text style={styles.total}>{money(total)}</Text>
      </View>
      <View style={styles.foot}>
        <Text style={[styles.sub, { flex: 1 }]}>Every amount opens to its source transactions. Nothing changes until you say so.</Text>
        {grade && (
          <View style={styles.grade} accessibilityLabel={`Your bank's quiet score: ${grade}`}>
            <Text style={styles.gradeLetter}>{grade}</Text>
            <Text style={styles.gradeLabel}>quiet score</Text>
          </View>
        )}
      </View>
      <View style={styles.brandRow}>
        <LoonMark size={26} water={false} />
        <Text style={[styles.sub, MONO]}>loonifinancial.com</Text>
      </View>
      {/* Torn edge */}
      <View style={styles.teeth}>
        {Array.from({ length: 18 }, (_, i) => (
          <View key={i} style={[styles.tooth, { backgroundColor: edgeColor }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: { backgroundColor: "#FFFFFF", borderRadius: 18, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 26, gap: 12, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  title: { fontFamily: font.display, fontSize: 24, color: brand.ink },
  sub: { fontFamily: font.regular, fontSize: 12, color: brand.mute },
  rule: { borderTopWidth: 2, borderStyle: "dashed", borderColor: brand.line },
  line: { flexDirection: "row", gap: 12, alignItems: "flex-start", minHeight: 44 },
  lineTitle: { fontFamily: font.bold, fontSize: 15, color: brand.ink },
  amount: { fontFamily: font.heavy, fontSize: 15, color: brand.ink, fontVariant: ["tabular-nums"] },
  conf: { fontFamily: font.heavy, fontSize: 11, letterSpacing: 0.5 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  total: { fontFamily: font.display, fontSize: 34, color: brand.leak, fontVariant: ["tabular-nums"] },
  foot: { flexDirection: "row", gap: 12, alignItems: "center" },
  grade: { width: 58, height: 58, borderRadius: 16, backgroundColor: brand.leak50, alignItems: "center", justifyContent: "center" },
  gradeLetter: { fontFamily: font.display, fontSize: 26, color: brand.leak, lineHeight: 28 },
  gradeLabel: { fontFamily: font.semibold, fontSize: 9, color: brand.leak },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  teeth: { position: "absolute", left: 0, right: 0, bottom: -7, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 },
  tooth: { width: 14, height: 14, borderRadius: 7 },
});
