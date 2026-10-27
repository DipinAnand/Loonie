import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Centered, Hero, Note, Progress, Row, Screen, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { cadenceLabel, money, shortDate } from "../lib/format";
import type { SwitchItem, SwitchKit } from "../lib/types";
import { radius, space, type } from "../theme";

/** Canada has no one-click account switch: move deposits first, then payments, earliest first. */
export default function SwitchKitScreen() {
  const c = useCalm();
  const [kit, setKit] = useState<SwitchKit | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .switchKit()
      .then(setKit)
      .catch((e) => setToast((e as Error).message));
  }, []);
  useEffect(load, [load]);

  async function toggle(item: SwitchItem) {
    try {
      setKit(await api.setMoved(item.key, !item.moved));
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  if (!kit) return <Centered />;

  const deposits = kit.items.filter((i) => i.direction === "deposit");
  const payments = kit.items.filter((i) => i.direction === "payment");
  const row = (i: SwitchItem) => (
    <Row
      key={i.key}
      title={i.name}
      subtitle={`${money(i.amount)} ${cadenceLabel(i.cadence)} · next ${shortDate(i.nextDate)}`}
      right={
        <Pressable
          onPress={() => toggle(i)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: i.moved }}
          accessibilityLabel={`${i.name} moved`}
          hitSlop={10}
          style={[styles.check, i.moved ? { backgroundColor: c.saved, borderColor: c.saved } : { borderColor: c.textTertiary }]}
        >
          {i.moved && <Text style={{ color: "#FFFFFF", fontSize: 14, lineHeight: 16 }}>✓</Text>}
        </Pressable>
      }
    />
  );

  return (
    <>
      <Screen>
        {kit.total > 0 ? (
          <View style={{ gap: space.m }}>
            <Hero label="Payments moved" value={`${kit.moved} of ${kit.total}`} caption="Point deposits at the new account first, then move payments, earliest first." />
            <Progress value={kit.moved / kit.total} tone="saved" />
          </View>
        ) : (
          <Text style={[type.body, { color: c.textSecondary }]}>Connect a bank or scan a statement and Looni lists every pre-authorized payment and deposit here.</Text>
        )}
        {deposits.length > 0 && <Section title="1. Deposits">{deposits.map(row)}</Section>}
        {payments.length > 0 && <Section title="2. Payments">{payments.map(row)}</Section>}
        <Note>Tick each one once you've changed it with the payer. Looni never moves money.</Note>
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  check: { width: 26, height: 26, borderRadius: radius.s - 1, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
