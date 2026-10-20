import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bar, Figure, gradeTone, Overline, Panel, Pill, SectionTitle, tones } from "../../components/ui";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { Home, Overview } from "../../lib/types";

const LEVEL_LABEL: Record<Home["level"], string> = { egg: "Egg", chick: "Chick", fledgling: "Fledgling", loon: "Loon" };

export default function HomeScreen() {
  const theme = useTheme();
  const [home, setHome] = useState<Home | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setHome(await api.home());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
    // Live balances come from the banks; the rest of Home works without them.
    api.overview().then(setOverview).catch(() => setOverview(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (!home) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {error ? <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const t = tones(theme.dark);
  const scanned = !!home.lastScanAt;
  const forecast = overview?.forecast ?? null;
  const levelProgress = home.next ? home.loonies / home.next.at : 1;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Looni</Text>
          <Button compact mode="contained-tonal" icon="circle" onPress={() => router.push("/loon")} buttonColor={t.yellow.bg} textColor={t.yellow.fg}>
            {`${home.loonies} loonies`}
          </Button>
        </View>

        {overview && overview.accounts.length > 0 && (
          <Panel tone="lavender">
            <Overline color={t.lavender.fg}>EVERYTHING YOU HAVE</Overline>
            <Figure size={40} color={t.lavender.fg}>
              {money(overview.netWorth.net)}
            </Figure>
            <Text style={{ color: t.lavender.fg }}>
              {overview.accounts.length} accounts · {money(overview.netWorth.assets)} in, {money(overview.netWorth.debts)} owed
            </Text>
            <View style={{ gap: 6, marginTop: 4 }}>
              {overview.accounts.slice(0, 6).map((a) => (
                <View key={a.id} style={styles.row}>
                  <Text style={{ flex: 1, color: t.lavender.fg }} numberOfLines={1}>
                    {a.name}
                  </Text>
                  <Text style={{ fontWeight: "800", color: t.lavender.fg, fontVariant: ["tabular-nums"] }}>
                    {a.type === "credit" || a.type === "loan" ? `−${money(a.balance ?? 0)}` : money(a.balance ?? 0)}
                  </Text>
                </View>
              ))}
            </View>
          </Panel>
        )}

        <View style={styles.tiles}>
          <Panel style={styles.tile} onPress={() => router.push("/forecast")} tone={forecast?.bounce ? "leak" : "plain"}>
            <Overline color={forecast?.bounce ? t.leak.fg : undefined}>BOUNCE RISK</Overline>
            <Text style={[styles.tileValue, { color: forecast?.bounce ? t.leak.fg : theme.colors.onSurface }]}>
              {forecast?.bounce ? shortDate(forecast.bounce.date) : forecast ? "None" : "—"}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {forecast?.bounce ? `${money(forecast.bounce.shortBy)} short` : "next 30 days"}
            </Text>
          </Panel>
          <Panel style={styles.tile} onPress={() => router.push("/move")}>
            <Overline>RENEWAL</Overline>
            <Text style={styles.tileValue}>{home.renewal ? renewalLabel(home.renewal.daysLeft) : "Set"}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {home.renewal ? "to renewal" : "your date"}
            </Text>
          </Panel>
          <Panel style={styles.tile} onPress={() => router.push("/receipt")}>
            <Overline>LEAKS / YR</Overline>
            <Text style={styles.tileValue}>{scanned ? money(home.stillLeakingPerYear, "CAD", 0) : "—"}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {home.grade ? `grade ${home.grade}` : "not scanned"}
            </Text>
          </Panel>
        </View>

        {scanned ? (
          <Panel>
            <View style={styles.row}>
              <Overline>LEAKING THIS YEAR</Overline>
              {home.grade && <Pill label={`Bank grade ${home.grade}`} tone={gradeTone[home.grade]} />}
            </View>
            <Figure color={theme.colors.error}>{money(home.stillLeakingPerYear)}</Figure>
            {home.savedPerYear > 0 && <Text style={{ color: theme.colors.tertiary, fontWeight: "700" }}>{money(home.savedPerYear)} a year already plugged</Text>}
            <Button mode="contained" onPress={() => router.push("/receipt")} buttonColor={t.ink.bg} textColor={t.ink.fg} contentStyle={styles.cta}>
              Open my Leak Receipt
            </Button>
          </Panel>
        ) : (
          <Panel tone="lavender">
            <Text variant="titleMedium" style={{ fontWeight: "800", color: t.lavender.fg }}>
              Find the fees you never noticed
            </Text>
            <Text style={{ color: t.lavender.fg }}>Connect your bank read-only, or drop a statement export. About a minute either way.</Text>
            <Button mode="contained" onPress={() => router.push("/connect")} contentStyle={styles.cta}>
              Connect a bank
            </Button>
            <Button onPress={() => router.push("/import")}>Drop a statement instead</Button>
          </Panel>
        )}

        {home.nextMove && (
          <Panel tone="yellow" onPress={() => router.push({ pathname: "/leak/[id]", params: { id: home.nextMove!.leakId } })}>
            <Overline color={t.yellow.fg}>ONE NEXT MOVE</Overline>
            <Text variant="titleMedium" style={{ fontWeight: "700", color: t.yellow.fg }}>
              {home.nextMove.title}
            </Text>
            <Text style={{ color: t.yellow.fg, fontWeight: "700" }}>Saves {money(home.nextMove.savesPerYear)} a year · see the script</Text>
          </Panel>
        )}

        {home.upcoming.length > 0 && (
          <>
            <SectionTitle>Next 30 days</SectionTitle>
            <Panel>
              {home.upcoming.slice(0, 5).map((u) => (
                <View key={u.leakId + u.date} style={styles.row}>
                  <Text style={{ flex: 1 }} numberOfLines={1}>
                    {u.title.replace(/\s\((weekly|biweekly|monthly|quarterly|annual)\)$/, "")}
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant, marginRight: 12 }}>{u.inDays === 0 ? "today" : u.inDays === 1 ? "tomorrow" : `in ${u.inDays} days`}</Text>
                  <Text style={{ fontWeight: "800", fontVariant: ["tabular-nums"] }}>{u.amount !== null ? money(u.amount) : ""}</Text>
                </View>
              ))}
            </Panel>
          </>
        )}

        <Panel tone="lavender" onPress={() => router.push("/loon")}>
          <Text style={{ fontWeight: "800", color: t.lavender.fg }}>
            Your loon is {home.level === "egg" ? "an" : "a"} {LEVEL_LABEL[home.level]}
          </Text>
          <Bar value={levelProgress} track={theme.dark ? "#3B3375" : "#D8D0FA"} />
          <Text style={{ color: t.lavender.fg, fontWeight: "700" }}>
            {home.next ? `${home.next.at - home.loonies} loonies to ${LEVEL_LABEL[home.next.level]}` : "Fully grown. Keep the streak."}
          </Text>
        </Panel>

        <View style={styles.links}>
          <Button icon="calendar-clock" mode="outlined" onPress={() => router.push("/bills")}>
            Bills
          </Button>
          <Button icon="calculator-variant-outline" mode="outlined" onPress={() => router.push("/tools")}>
            Calculators
          </Button>
          <Button icon="share-variant-outline" mode="outlined" onPress={() => router.push("/year")}>
            Year receipt
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function renewalLabel(days: number): string {
  if (days < 0) return "Ended";
  if (days < 60) return `${days}d`;
  return `${Math.round(days / 30.4)}mo`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, gap: 14, paddingBottom: 32 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  wordmark: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: 14, gap: 4 },
  tileValue: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] },
  cta: { paddingVertical: 6 },
  links: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
});
