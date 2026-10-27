import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Button, Callout, Centered, Hero, Note, Screen, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { money, shortDate } from "../lib/format";
import type { Overview } from "../lib/types";
import { space, type } from "../theme";

const CHART_HEIGHT = 120;

/** "Know before it bounces": the next 30 days of chequing, across banks, as one line of bars. */
export default function ForecastScreen() {
  const c = useCalm();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .overview()
      .then(setOverview)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!overview) return <Centered>{error ? <Text style={[type.body, { color: c.leak, textAlign: "center" }]}>{error}</Text> : undefined}</Centered>;

  const f = overview.forecast;
  if (!f) {
    return (
      <Screen title="Know before it bounces" subtitle="Looni warns you days before your chequing account runs short. It needs a live balance, so connect a bank first.">
        <Button label="Connect a bank" onPress={() => router.push("/connect")} />
      </Screen>
    );
  }

  const values = f.series.map((p) => p.balance);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const zeroY = (max / span) * CHART_HEIGHT;

  return (
    <Screen>
      {f.bounce ? (
        <Hero
          label={`Chequing runs short on ${shortDate(f.bounce.date)}`}
          value={money(f.bounce.shortBy, "CAD", 0)}
          tone="leak"
          caption={f.bounce.before.length ? `${f.bounce.before.slice(0, 3).join(", ")} land before payday.` : "Your balance dips below zero before payday."}
        />
      ) : (
        <Hero label="Safe to spend" value={money(f.safeToSpend, "CAD", 0)} tone="saved" caption={`Your lowest chequing balance over the next ${f.days} days, after every bill Looni knows about.`} />
      )}

      <View style={{ gap: space.s }}>
        <View style={[styles.chart, { height: CHART_HEIGHT }]} accessible accessibilityLabel={`Lowest balance ${money(f.low?.balance ?? 0)} on ${f.low ? shortDate(f.low.date) : ""}`}>
          <View style={[styles.zero, { top: zeroY, backgroundColor: c.line }]} />
          {f.series.map((p) => {
            const negative = p.balance < 0;
            const top = ((max - Math.max(p.balance, 0)) / span) * CHART_HEIGHT;
            const bottom = ((max - Math.min(p.balance, 0)) / span) * CHART_HEIGHT;
            return (
              <View key={p.date} style={styles.col}>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: negative ? zeroY : top,
                    height: Math.max(2, negative ? bottom - zeroY : zeroY - top),
                    backgroundColor: negative ? c.leak : p.date === f.payday ? c.saved : c.line,
                    borderRadius: 2,
                  }}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.axis}>
          <Text style={[type.caption, { color: c.textTertiary }]}>{shortDate(f.series[0].date)}</Text>
          {f.payday && <Text style={[type.caption, { color: c.saved }]}>Payday {shortDate(f.payday)}</Text>}
          <Text style={[type.caption, { color: c.textTertiary }]}>{shortDate(f.series[f.series.length - 1].date)}</Text>
        </View>
      </View>

      {f.bounce && (
        <Callout title={f.cover ? `Move ${money(f.cover.amount, "CAD", 0)} from ${f.cover.name}` : "Move money in before then"}>
          {f.cover ? "That covers it and skips an NSF fee. Make the transfer in your bank's app." : "Or ask the biller to move the due date past payday."}
        </Callout>
      )}

      <Note>Looni never moves money. The forecast uses live balances, read for this screen and never stored.</Note>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: "row", gap: 2, position: "relative" },
  col: { flex: 1, position: "relative" },
  zero: { position: "absolute", left: 0, right: 0, height: 1 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
});
