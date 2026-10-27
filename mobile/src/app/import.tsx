import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Text } from "react-native-paper";
import { Button, Centered, Hero, Note, Row, Screen, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { StatementPreview } from "../lib/types";
import { space, type } from "../theme";

const MAX_BYTES = 7_500_000;
const cadence = /\s\((weekly|biweekly|monthly|quarterly|annual)\)$/;

type Phase = { name: "idle" } | { name: "reading" } | { name: "preview"; files: { name: string; text: string }[]; result: StatementPreview } | { name: "saving" };

/**
 * The free scan, in the app: drop one or more statement exports and see every
 * fee in about a minute. The preview stores nothing; saving keeps only the
 * findings, like a bank connection.
 */
export default function ImportStatement() {
  const c = useCalm();
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
      <Centered>
        <View style={{ alignItems: "center", gap: space.l }}>
          <ActivityIndicator color={c.action} />
          <Text style={[type.heading, { color: c.text }]}>{phase.name === "reading" ? "Reading your statement" : "Saving your findings"}</Text>
          <Text style={[type.secondary, { color: c.textSecondary, textAlign: "center" }]}>Plan fees, NSF charges, currency markups, price rises and double charges.</Text>
        </View>
      </Centered>
    );
  }

  if (phase.name === "preview") {
    const r = phase.result.receipt;
    const rows = phase.result.statements.reduce((s, f) => s + f.transactions, 0);
    return (
      <Screen
        footer={
          <>
            <Button label="Keep these findings on my receipt" onPress={() => save(phase.files)} />
            <Button label="Scan another file" variant="secondary" onPress={() => setPhase({ name: "idle" })} />
          </>
        }
      >
        <Hero
          label="Leaking per year, from this file"
          value={money(r.totalAnnualImpact, "CAD", 0)}
          tone={r.totalAnnualImpact > 0 ? "leak" : "default"}
          caption={`${rows} transactions · your bank scores ${r.grade}. Nothing is stored yet.`}
        />
        {r.nextMove && (
          <Section title="Your next move">
            <Row title={r.nextMove.title} value={`+${money(r.nextMove.savesPerYear, "CAD", 0)}/yr`} valueTone="saved" />
          </Section>
        )}
        {r.leaks.length > 0 ? (
          <Section title="What Looni found">
            {r.leaks.map((l) => (
              <Row
                key={l.id}
                title={l.title.replace(cadence, "")}
                subtitle={l.meta.confidence === "high" ? "Certain" : "Check it"}
                dot={l.meta.confidence === "high" ? "leak" : "caution"}
                value={money(l.annualImpact)}
              />
            ))}
          </Section>
        ) : (
          <Text style={[type.body, { color: c.textSecondary }]}>No leaks in this file.</Text>
        )}
        {error && <Text style={[type.secondary, { color: c.leak }]}>{error}</Text>}
        <Note>If you keep them, Looni saves the findings, encrypted. The file and its transactions are never stored.</Note>
      </Screen>
    );
  }

  return (
    <Screen
      title="Scan a statement"
      subtitle="Export your transactions as CSV from your bank's website: chequing or card, up to 12 months. Pick several files to merge them."
      footer={<Button label="Choose statement files" icon="file-upload-outline" onPress={pick} />}
    >
      <Section>
        <Row title="No bank login" subtitle="Nothing connects to your bank" />
        <Row title="Nothing moves" subtitle="Looni only reads the file" />
        <Row title="The file isn't kept" subtitle="CSV and text exports, English or French. PDF comes next." />
      </Section>
      {error && <Text style={[type.secondary, { color: c.leak }]}>{error}</Text>}
    </Screen>
  );
}
