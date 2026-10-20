import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, HelperText, Text, useTheme } from "react-native-paper";
import { Figure, gradeTone, Overline, Panel, Pill, tones } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { StatementPreview } from "../lib/types";

const MAX_BYTES = 7_500_000;

type Phase = { name: "idle" } | { name: "reading" } | { name: "preview"; files: { name: string; text: string }[]; result: StatementPreview } | { name: "saving" };

/**
 * The free scan, in the app: drop one or more statement exports and see every
 * fee in about a minute. The preview stores nothing; saving keeps only the
 * findings, like a bank connection.
 */
export default function ImportStatement() {
  const theme = useTheme();
  const t = tones(theme.dark);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel"],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (picked.canceled) return;
    setPhase({ name: "reading" });
    try {
      const files = [];
      let bytes = 0;
      for (const asset of picked.assets) {
        // On web the picker hands back a browser File; on iOS/Android a file:// URI in the cache.
        const text = Platform.OS === "web" && asset.file ? await asset.file.text() : await new File(asset.uri).text();
        bytes += text.length;
        files.push({ name: asset.name, text });
      }
      if (bytes > MAX_BYTES) throw new Error("Those files are too big together. Try fewer months at a time.");
      const result = await api.previewStatements(files);
      setPhase({ name: "preview", files, result });
    } catch (e) {
      setError((e as Error).message);
      setPhase({ name: "idle" });
    }
  }

  async function save(files: { name: string; text: string }[]) {
    setPhase({ name: "saving" });
    try {
      await api.saveStatements(files);
      router.replace("/receipt");
    } catch (e) {
      setError((e as Error).message);
      setPhase({ name: "idle" });
    }
  }

  if (phase.name === "reading" || phase.name === "saving") {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
        <Text variant="titleMedium" style={{ marginTop: 20 }}>
          {phase.name === "reading" ? "Reading your statement…" : "Saving your findings…"}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: "center" }}>
          Plan fees, NSF charges, currency spreads, price rises and double charges.
        </Text>
      </View>
    );
  }

  if (phase.name === "preview") {
    const r = phase.result.receipt;
    const rows = phase.result.statements.reduce((s, f) => s + f.transactions, 0);
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Panel>
          <View style={styles.row}>
            <Overline>LEAKING IN THIS FILE, PER YEAR</Overline>
            <Pill label={`Your bank's quiet score: ${r.grade}`} tone={gradeTone[r.grade]} />
          </View>
          <Figure color={theme.colors.error}>{money(r.totalAnnualImpact)}</Figure>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {rows} transactions{r.windowStart ? ` from ${r.windowStart} to ${r.windowEnd}` : ""} · {phase.result.statements.length} file
            {phase.result.statements.length === 1 ? "" : "s"}
          </Text>
        </Panel>

        {r.nextMove && (
          <Panel tone="yellow">
            <Overline color={t.yellow.fg}>ONE NEXT MOVE</Overline>
            <Text variant="titleMedium" style={{ color: t.yellow.fg, fontWeight: "700" }}>
              {r.nextMove.title}
            </Text>
            {r.nextMove.script && <Text style={{ color: t.yellow.fg }}>“{r.nextMove.script}”</Text>}
          </Panel>
        )}

        {r.leaks.map((l) => (
          <Panel key={l.id}>
            <View style={styles.row}>
              <Text variant="titleMedium" style={{ fontWeight: "700", flex: 1 }}>
                {l.title}
              </Text>
              <Text style={{ fontWeight: "800", color: theme.colors.error, fontVariant: ["tabular-nums"] }}>{money(l.annualImpact)}</Text>
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{l.detail}</Text>
            {l.meta.confidence && <Pill label={l.meta.confidence === "high" ? "HIGH" : "CHECK"} tone={l.meta.confidence === "high" ? "leak" : "yellow"} />}
          </Panel>
        ))}
        {r.leaks.length === 0 && <Text style={{ textAlign: "center", color: theme.colors.onSurfaceVariant }}>No leaks in this file. Nice.</Text>}

        {error && <HelperText type="error">{error}</HelperText>}
        <Button mode="contained" contentStyle={styles.cta} onPress={() => save(phase.files)}>
          Keep these findings on my receipt
        </Button>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
          Looni keeps the findings, encrypted. The file and its transactions are never stored.
        </Text>
        <Button onPress={() => setPhase({ name: "idle" })}>Scan another file</Button>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
        Drop a statement, see your number
      </Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>
        Export your transactions as CSV from your bank's website (chequing or credit card, up to 12 months). Pick several files to merge them into one receipt.
      </Text>
      <Panel tone="lavender">
        <Text style={{ color: t.lavender.fg, fontWeight: "700" }}>✓ No bank login · ✓ Nothing moves · ✓ The file isn't kept</Text>
        <Text style={{ color: t.lavender.fg }}>CSV and plain-text exports work today, in English or French. PDF statements come next.</Text>
      </Panel>
      {error && (
        <HelperText type="error" visible style={{ fontSize: 14 }}>
          {error}
        </HelperText>
      )}
      <Button mode="contained" icon="file-upload-outline" contentStyle={styles.cta} onPress={pick}>
        Choose statement files
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cta: { paddingVertical: 8 },
});
