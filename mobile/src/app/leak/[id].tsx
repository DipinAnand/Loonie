import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Button, Callout, Centered, Hero, Note, Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { Leak, Verdict } from "../../lib/types";
import { space, type } from "../../theme";

const cadence = /\s\((weekly|biweekly|monthly|quarterly|annual)\)$/;

/** "Every fee, with the receipts": what it costs, what to do, the words to use, and the charges as proof. */
export default function Evidence() {
  const c = useCalm();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [leak, setLeak] = useState<Leak | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [steps, setSteps] = useState<string[] | null>(null);

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

  if (!leak) return <Centered>{error ? <Text style={[type.body, { color: c.leak, textAlign: "center" }]}>{error}</Text> : undefined}</Centered>;

  const suspicious = leak.kind === "suspicious";
  const charges = leak.history;
  const spread = leak.merchantKey === "fx_spread";
  const max = Math.max(...charges.map((h) => h.amount), 1);
  const oneOff = leak.kind === "duplicate" || leak.merchantKey === "nsf_over_cap";

  async function verdict(v: Verdict) {
    setBusy(true);
    try {
      const result = await api.label(leak!.id, v);
      setLeak({ ...leak!, verdict: v });
      if (result.notMeSteps) setSteps(result.notMeSteps);
      const grew = result.celebrate.quests.length + result.celebrate.badges.length > 0;
      setToast(v === "confirmed" ? (grew ? "Confirmed. Your loon grew." : "Confirmed. Looni tracks it until it stops.") : "Got it. It no longer counts in your total.");
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

  const decided = leak.verdict !== null;

  return (
    <>
      <Screen
        footer={
          decided ? (
            <Text style={[type.secondary, { color: c.textSecondary, textAlign: "center", paddingVertical: space.m }]}>
              {leak.verdict === "confirmed" ? (suspicious ? "You said this wasn't you." : "You confirmed this leak.") : suspicious ? "You said this was you." : "You said this was expected."}
            </Text>
          ) : (
            <>
              <Button label={suspicious ? "This wasn't me" : "Yes, this is a leak"} onPress={() => verdict("confirmed")} loading={busy} />
              <Button label={suspicious ? "It was me" : "I expected this"} variant="secondary" onPress={() => verdict("dismissed")} disabled={busy} />
            </>
          )
        }
      >
        <Hero
          label={leak.title.replace(cadence, "")}
          value={money(leak.annualImpact)}
          unit={suspicious ? undefined : oneOff ? "to get back" : "a year"}
          caption={leak.meta.fix ?? leak.detail}
        />

        {steps && (
          <Section title="What to do now">
            {steps.map((s, i) => (
              <Row key={i} title={`${i + 1}. ${s}`} />
            ))}
          </Section>
        )}

        {charges.length > 0 && (
          <View style={{ gap: space.s }}>
            <View style={styles.chart} accessible accessibilityLabel={`${charges.length} charges, the latest ${money(charges[charges.length - 1].amount)}`}>
              {charges.slice(-12).map((h, i, shown) => (
                <View key={h.date + i} style={[styles.bar, { height: 6 + (h.amount / max) * 44, backgroundColor: i === shown.length - 1 ? c.action : c.line }]} />
              ))}
            </View>
            <Text style={[type.secondary, { color: c.textSecondary }]}>{spread ? `Foreign-currency purchases: ${leak.detail}` : leak.detail}</Text>
            {showAll ? (
              <Section>
                {[...charges].reverse().map((h, i) => (
                  <Row key={h.date + i} title={shortDate(h.date)} value={`−${money(h.amount)}`} />
                ))}
              </Section>
            ) : (
              <Button label={`See all ${charges.length} ${spread ? "purchases" : charges.length === 1 ? "charge" : "charges"}`} variant="secondary" onPress={() => setShowAll(true)} />
            )}
          </View>
        )}

        {leak.meta.script && (
          <Callout title="What to say" action={{ label: "Copy", onPress: copyScript }}>
            <Text style={[type.body, { color: c.text, lineHeight: 24 }]}>{`"${leak.meta.script}"`}</Text>
          </Callout>
        )}

        {leak.meta.ruleVersion && (
          <Note>{`Found by rule ${leak.meta.ruleVersion} · ${leak.meta.confidence === "high" ? "certain" : "worth checking"}. Nothing changes until you say so.`}</Note>
        )}
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 52 },
  bar: { flex: 1, borderRadius: 3 },
});
