import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Snackbar, Text, useTheme } from "react-native-paper";
import { Figure, Overline, Panel, Pill, tones } from "../../components/ui";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { Leak, Verdict } from "../../lib/types";
import { font } from "../../theme";

const MONTH = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/** "Every fee, with the receipts": the charges behind one leak, what to do, and the words to use. */
export default function Evidence() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [leak, setLeak] = useState<Leak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .receipt()
      .then((r) => {
        const found = [...r.leaks, ...r.suspicious, ...r.resolved].find((l) => l.id === id);
        if (found) setLeak(found);
        else setError("This leak isn't on your receipt any more.");
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  if (!leak) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {error ? <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const t = tones(theme.dark);
  const charges = leak.history;
  const max = Math.max(...charges.map((c) => c.amount), 1);
  const total = charges.reduce((s, c) => s + c.amount, 0);
  // The spread's evidence is the foreign purchases themselves; the leak is the markup inside them.
  const spread = leak.merchantKey === "fx_spread";
  const sameAmount = charges.length > 1 && charges.every((c) => Math.abs(c.amount - charges[0].amount) < 0.005);

  async function verdict(v: Verdict) {
    setBusy(true);
    try {
      const result = await api.label(leak!.id, v);
      const loonies = result.celebrate.quests.length + result.celebrate.badges.length;
      setLeak({ ...leak!, verdict: v });
      setToast(v === "confirmed" ? (loonies ? "Confirmed. Your loon grew." : "Confirmed. It stays on your receipt until it stops.") : "Dismissed. It no longer counts in your total.");
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copyScript() {
    await Clipboard.setStringAsync(leak!.meta.script!);
    setToast("Copied. Paste it into your bank's chat, or read it on the phone.");
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={{ gap: 6 }}>
          <Text variant="headlineSmall" style={{ fontFamily: font.display }}>
            {leak.title}
          </Text>
          <View style={styles.row}>
            <Figure size={40} color={theme.colors.error}>
              {money(leak.annualImpact)}
            </Figure>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{leak.kind === "duplicate" || leak.merchantKey === "nsf_over_cap" ? "to get back" : "a year"}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {leak.meta.confidence && <Pill label={leak.meta.confidence === "high" ? "Confidence: High" : "Confidence: check it"} tone={leak.meta.confidence === "high" ? "leak" : "yellow"} />}
            {leak.verdict && <Pill label={leak.verdict === "confirmed" ? "You confirmed it" : "You dismissed it"} tone={leak.verdict === "confirmed" ? "green" : "plain"} />}
          </View>
        </View>

        {charges.length > 0 && (
          <Panel>
            <Overline>{spread ? "THE FOREIGN PURCHASES BEHIND IT" : "THE CHARGES BEHIND IT"}</Overline>
            <View style={styles.chart} accessibilityLabel={`${charges.length} charges totalling ${money(total)}`}>
              {charges.slice(-12).map((c, i) => (
                <View key={c.date + i} style={styles.barCol}>
                  <View style={[styles.bar, { height: 8 + (c.amount / max) * 64, backgroundColor: i === Math.min(charges.length, 12) - 1 ? theme.colors.primary : "#7C6CF0" }]} />
                  <Text style={[styles.barLabel, { color: theme.colors.onSurfaceVariant }]}>{MONTH[+c.date.slice(5, 7) - 1]}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>
              {spread
                ? `${money(total)} of foreign-currency spend × about 2.5% = ${money(total * 0.025)}`
                : sameAmount
                  ? `${charges.length} charges × ${money(charges[0].amount)} = ${money(total)}`
                  : `${charges.length} charges = ${money(total)}`}
            </Text>
            {leak.meta.ruleVersion && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Rule v{leak.meta.ruleVersion} · {leak.detail}
              </Text>
            )}
            <View style={{ gap: 2, marginTop: 4 }}>
              {[...charges].reverse().slice(0, 6).map((c, i) => (
                <View key={c.date + i} style={[styles.row, styles.txn, { borderColor: theme.colors.outlineVariant }]}>
                  <Text>{shortDate(c.date)}</Text>
                  <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>−{money(c.amount)}</Text>
                </View>
              ))}
            </View>
          </Panel>
        )}

        {leak.meta.fix && (
          <Panel tone="lavender">
            <Overline color={t.lavender.fg}>WHAT TO DO</Overline>
            <Text style={{ color: t.lavender.fg, fontFamily: font.semibold }}>{leak.meta.fix}</Text>
          </Panel>
        )}

        {leak.meta.script && (
          <Panel tone="yellow">
            <Overline color={t.yellow.fg}>SAY THIS</Overline>
            <Text variant="titleMedium" style={{ color: t.yellow.fg, lineHeight: 24 }}>
              “{leak.meta.script}”
            </Text>
            <Button mode="outlined" icon="content-copy" onPress={copyScript} textColor={t.yellow.fg} style={{ alignSelf: "flex-start", borderColor: t.yellow.fg }}>
              Copy script
            </Button>
          </Panel>
        )}

        <View style={styles.actions}>
          <Button mode="contained" style={{ flex: 2 }} contentStyle={styles.cta} loading={busy} disabled={busy} onPress={() => verdict("confirmed")}>
            {leak.kind === "suspicious" ? "Not me" : "Confirm"}
          </Button>
          <Button mode="outlined" style={{ flex: 1 }} contentStyle={styles.cta} disabled={busy} onPress={() => verdict("dismissed")}>
            {leak.kind === "suspicious" ? "It was me" : "Dismiss"}
          </Button>
        </View>
        <Button onPress={() => router.back()}>Back to the receipt</Button>
      </ScrollView>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 92 },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "100%", borderRadius: 6 },
  barLabel: { fontSize: 11, fontFamily: font.bold },
  txn: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: "row", gap: 10 },
  cta: { paddingVertical: 6 },
});
