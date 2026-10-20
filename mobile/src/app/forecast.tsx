import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { Figure, Overline, Panel, Pill, tones } from "../components/ui";
import { api } from "../lib/api";
import { money, shortDate } from "../lib/format";
import type { Overview } from "../lib/types";

const CHART_HEIGHT = 140;

/** "Know before it bounces": every chequing balance for the next 30 days, across banks. */
export default function ForecastScreen() {
  const theme = useTheme();
  const t = tones(theme.dark);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .overview()
      .then(setOverview)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!overview) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {error ? <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const f = overview.forecast;
  if (!f) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
          Know before it bounces
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          The forecast needs a live chequing balance, so it works once a bank is connected. Looni adds up your recurring deposits and payments from every account and warns you days ahead.
        </Text>
        <Button mode="contained" onPress={() => router.push("/connect")}>
          Connect a bank
        </Button>
      </ScrollView>
    );
  }

  const values = f.series.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zeroY = ((max - 0) / span) * CHART_HEIGHT;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
        Know before it bounces
      </Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>Only possible because Looni sees every account.</Text>

      <Panel>
        <View style={styles.row}>
          <Overline>BALANCE · ALL CHEQUING</Overline>
          {f.bounce ? <Pill label={`⚠ ${money(f.bounce.shortBy, "CAD", 0)} short`} tone="leak" /> : <Pill label="No bounce ahead" tone="green" />}
        </View>
        <View style={[styles.chart, { height: CHART_HEIGHT }]} accessibilityLabel={`Lowest balance ${money(f.low?.balance ?? 0)} on ${f.low ? shortDate(f.low.date) : ""}`}>
          <View style={[styles.zero, { top: zeroY, borderColor: theme.colors.error }]} />
          {f.series.map((p) => {
            const top = ((max - Math.max(p.balance, 0)) / span) * CHART_HEIGHT;
            const bottom = ((max - Math.min(p.balance, 0)) / span) * CHART_HEIGHT;
            const negative = p.balance < 0;
            return (
              <View key={p.date} style={styles.col}>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: negative ? zeroY : top,
                    height: Math.max(2, negative ? bottom - zeroY : zeroY - top),
                    backgroundColor: negative ? theme.colors.error : p.date === f.payday ? theme.colors.tertiary : "#B8A9E8",
                    borderRadius: 2,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.row}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {shortDate(f.series[0].date)}
          </Text>
          {f.payday && (
            <Text variant="bodySmall" style={{ color: theme.colors.tertiary, fontWeight: "700" }}>
              Payday {shortDate(f.payday)}
            </Text>
          )}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {shortDate(f.series[f.series.length - 1].date)}
          </Text>
        </View>
      </Panel>

      {f.bounce ? (
        <Panel tone="leak">
          <Overline color={t.leak.fg}>{shortDate(f.bounce.date).toUpperCase()}</Overline>
          <Text variant="titleMedium" style={{ fontWeight: "800", color: t.leak.fg }}>
            {f.bounce.before.length ? `${f.bounce.before.join(", ")} land before payday.` : "Your balance dips below zero."}
          </Text>
          <Text style={{ color: t.leak.fg }}>
            {f.cover ? `Your ${f.cover.name} can cover it.` : "Move money in before then, or ask for a payment date change."}
          </Text>
          {f.cover && (
            <Text style={{ color: t.leak.fg, fontWeight: "800" }}>
              Move {money(f.cover.amount, "CAD", 0)} from {f.cover.name} to skip an NSF fee.
            </Text>
          )}
          <Text variant="bodySmall" style={{ color: t.leak.fg }}>
            Looni never moves money. Make the transfer in your bank's app.
          </Text>
        </Panel>
      ) : (
        <Panel tone="green">
          <Overline color={t.green.fg}>SAFE TO SPEND</Overline>
          <Figure size={36} color={t.green.fg}>
            {money(f.safeToSpend)}
          </Figure>
          <Text style={{ color: t.green.fg }}>Your lowest chequing balance over the next {f.days} days, after every bill Looni knows about.</Text>
        </Panel>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chart: { flexDirection: "row", gap: 2, position: "relative" },
  col: { flex: 1, position: "relative" },
  zero: { position: "absolute", left: 0, right: 0, borderTopWidth: 1, borderStyle: "dashed" },
});
