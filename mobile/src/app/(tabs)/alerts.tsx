import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button, SegmentedButtons, Text, useTheme } from "react-native-paper";
import { Panel, tones, type Tone } from "../../components/ui";
import { api } from "../../lib/api";
import type { Alert } from "../../lib/types";

const KIND_TONE: Record<Alert["kind"], Tone> = {
  suspicious: "leak",
  fee: "leak",
  price_hike: "leak",
  new_leak: "lavender",
  renewal: "yellow",
  mortgage: "yellow",
  hunt: "lavender",
  report: "green",
};
const KIND_MARK: Record<Alert["kind"], string> = {
  suspicious: "!",
  fee: "$",
  price_hike: "+",
  new_leak: "2×",
  renewal: "↻",
  mortgage: "⌂",
  hunt: "✓",
  report: "≡",
};

type Filter = "all" | "money" | "security";

/** Everything Looni noticed: fees, price rises, duplicates, renewals and security alerts. */
export default function Alerts() {
  const theme = useTheme();
  const t = tones(theme.dark);
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
  }

  const shown = (alerts ?? []).filter((a) => filter === "all" || (filter === "security" ? a.security : !a.security));
  const unread = (alerts ?? []).filter((a) => !a.read).length;

  return (
    <FlatList
      data={shown}
      keyExtractor={(a) => a.key}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <SegmentedButtons
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            buttons={[
              { value: "all", label: "All" },
              { value: "money", label: "Money" },
              { value: "security", label: "Security" },
            ]}
          />
          {unread > 0 && (
            <Button
              compact
              style={{ alignSelf: "flex-end" }}
              onPress={() => {
                api.markAlertsRead().catch(() => {});
                setAlerts((all) => all?.map((x) => ({ ...x, read: true })) ?? null);
              }}
            >
              Mark all read
            </Button>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const tone = t[KIND_TONE[item.kind]];
        return (
          <Panel onPress={() => open(item)} style={styles.item}>
            <View style={styles.row}>
              <View style={[styles.mark, { backgroundColor: tone.bg }]}>
                <Text style={{ color: tone.fg, fontWeight: "800" }}>{KIND_MARK[item.kind]}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: item.read ? "600" : "800" }}>{item.title}</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.body}
                </Text>
              </View>
              {!item.read && <View style={[styles.unread, { backgroundColor: theme.colors.primary }]} accessibilityLabel="Unread" />}
            </View>
          </Panel>
        );
      }}
      ListEmptyComponent={
        <Text style={{ textAlign: "center", marginTop: 32, color: theme.colors.onSurfaceVariant }}>
          {alerts === null ? "" : "Nothing yet. Looni writes here when a fee, price rise or renewal needs you."}
        </Text>
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  item: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  unread: { width: 10, height: 10, borderRadius: 5 },
});
