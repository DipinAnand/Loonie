import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import type { Alert } from "../../lib/types";
import { space, type } from "../../theme";

type Filter = "all" | "money" | "security";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "money", label: "Money" },
  { value: "security", label: "Security" },
];

const BILL_KINDS = new Set<Alert["kind"]>(["bill_due", "bill_late", "low_balance"]);
const LEAK_KINDS = new Set<Alert["kind"]>(["fee", "price_hike", "suspicious", "low_balance", "bill_late"]);

/** Everything Looni noticed, newest first. Unread ones carry a dot; each opens what it's about. */
export default function Alerts() {
  const c = useCalm();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(() => {
    api
      .alerts()
      .then((r) => setAlerts(r.alerts))
      .catch(() => setAlerts([]));
  }, []);
  useFocusEffect(load);

  function open(a: Alert) {
    api.markAlertsRead([a.key]).catch(() => {});
    setAlerts((all) => all?.map((x) => (x.key === a.key ? { ...x, read: true } : x)) ?? null);
    if (a.leakId) router.push({ pathname: "/leak/[id]", params: { id: a.leakId } });
    else if (a.kind === "mortgage") router.push("/move");
    else if (a.kind === "hunt") router.push("/loon");
    else if (BILL_KINDS.has(a.kind)) router.push("/bills");
  }

  function readAll() {
    api.markAlertsRead().catch(() => {});
    setAlerts((all) => all?.map((x) => ({ ...x, read: true })) ?? null);
  }

  const shown = (alerts ?? []).filter((a) => filter === "all" || (filter === "security" ? a.security : !a.security));
  const unread = (alerts ?? []).filter((a) => !a.read).length;

  return (
    <Screen safeTop title="Alerts">
      <View style={styles.filters} accessibilityRole="tablist">
        {FILTERS.map((f) => {
          const on = f.value === filter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.filter, { borderColor: on ? c.text : "transparent" }]}
            >
              <Text style={[on ? type.bodyStrong : type.body, { color: on ? c.text : c.textSecondary }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {shown.length > 0 ? (
        <Section title={unread ? `${unread} new` : "All caught up"} action={unread ? { label: "Mark all read", onPress: readAll } : undefined}>
          {shown.map((a) => (
            <Row
              key={a.key}
              title={a.title}
              subtitle={a.body}
              subtitleTone={LEAK_KINDS.has(a.kind) && !a.read ? "default" : "secondary"}
              dot={a.read ? undefined : "action"}
              onPress={() => open(a)}
              accessibilityLabel={`${a.read ? "" : "New. "}${a.title}. ${a.body}`}
            />
          ))}
        </Section>
      ) : (
        alerts && <Text style={[type.body, { color: c.textSecondary }]}>Nothing yet. Looni writes here when a fee, price rise or bill needs you.</Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: "row", gap: space.xl, marginTop: -space.m },
  filter: { minHeight: 44, justifyContent: "center", borderBottomWidth: 2 },
});
