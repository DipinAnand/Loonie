import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Button, Callout, Centered, Hero, Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { Home, Overview } from "../../lib/types";
import { space, type } from "../../theme";

const cadence = /\s\((weekly|biweekly|monthly|quarterly|annual)\)$/;

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const when = (days: number) => (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

/** Home answers one question: what is leaking. Everything else is a row that opens more. */
export default function HomeScreen() {
  const c = useCalm();
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

  if (!home) return <Centered>{error ? <Text style={[type.body, { color: c.leak, textAlign: "center" }]}>{error}</Text> : undefined}</Centered>;

  const scanned = !!home.lastScanAt;
  const bounce = overview?.forecast?.bounce ?? null;
  const cover = overview?.forecast?.cover ?? null;

  // Coming up: the next three things that will move money, bills and subscriptions together, then payday.
  const upcoming = [
    ...(home.bills?.next ?? []).map((b) => ({ key: b.billId + b.date, name: b.name, date: b.date, inDays: b.inDays, amount: b.amount })),
    ...home.upcoming.map((u) => ({ key: u.leakId + u.date, name: u.title.replace(cadence, ""), date: u.date, inDays: u.inDays, amount: u.amount ?? 0 })),
  ]
    .filter((u, i, all) => all.findIndex((x) => x.name === u.name && x.date === u.date) === i)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  const payday = home.bills?.payday ?? null;

  return (
    <Screen safeTop refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.header}>
        <Text style={[type.body, { color: c.textSecondary }]}>{greeting()}</Text>
        <Pressable onPress={() => router.push("/loon")} accessibilityRole="button" accessibilityLabel={`${home.loonies} loonies. Open your loon`} hitSlop={12} style={styles.loonies}>
          <View style={[styles.loonieDot, { backgroundColor: c.loonie }]} />
          <Text style={[type.bodyStrong, { color: c.text, fontVariant: ["tabular-nums"] }]}>{home.loonies}</Text>
        </Pressable>
      </View>

      {scanned ? (
        <View style={{ gap: space.l }}>
          <Hero
            label="Leaking this year"
            value={money(home.stillLeakingPerYear, "CAD", 0)}
            caption={[home.grade && `Your bank scores ${home.grade}`, home.savedPerYear > 0 && `${money(home.savedPerYear, "CAD", 0)} a year already saved`].filter(Boolean).join(" · ")}
          />
          <Button label="Review the leaks" onPress={() => router.push("/receipt")} />
        </View>
      ) : (
        <View style={{ gap: space.l }}>
          <Text accessibilityRole="header" style={[type.title, { color: c.text }]}>
            Find the fees you never noticed
          </Text>
          <Text style={[type.body, { color: c.textSecondary }]}>Connect your bank read-only through Plaid. It takes about a minute.</Text>
          <View>
            <Button label="Connect a bank" onPress={() => router.push("/connect")} />
            <Button label="Scan a statement instead" variant="secondary" onPress={() => router.push("/import")} />
          </View>
        </View>
      )}

      {home.nextMove && (
        <Section title="Your next move">
          <Row
            title={home.nextMove.title}
            subtitle={home.nextMove.script ? "We wrote what to say." : undefined}
            value={`+${money(home.nextMove.savesPerYear, "CAD", 0)}/yr`}
            valueTone="saved"
            onPress={() => router.push({ pathname: "/leak/[id]", params: { id: home.nextMove!.leakId } })}
          />
        </Section>
      )}

      {bounce && (
        <Callout title={`Heads up for ${shortDate(bounce.date)}`} onPress={() => router.push("/forecast")}>
          {`${bounce.before.slice(0, 2).join(" and ") || "Bills"} land before payday and chequing runs ${money(bounce.shortBy, "CAD", 0)} short.${cover ? ` Your ${cover.name.split(" · ")[0].toLowerCase()} can cover it.` : ""}`}
        </Callout>
      )}

      {(upcoming.length > 0 || payday) && (
        <Section title="Coming up" action={home.bills ? { label: "See all", onPress: () => router.push("/bills") } : undefined}>
          {upcoming.map((u) => (
            <Row key={u.key} title={u.name} subtitle={when(u.inDays)} value={money(u.amount)} />
          ))}
          {payday && <Row title="Payday" subtitle={shortDate(payday.date)} value={`+${money(payday.amount)}`} valueTone="saved" />}
        </Section>
      )}

      <Section>
        {overview && overview.accounts.length > 0 && (
          <Row
            title={`${overview.accounts.length} ${overview.accounts.length === 1 ? "account" : "accounts"}`}
            subtitle="Net worth and balances"
            onPress={() => router.push("/accounts")}
          />
        )}
        {home.renewal && (
          <Row
            title={home.renewal.daysLeft >= 0 ? `Mortgage renews in ${home.renewal.daysLeft} days` : "Mortgage term ended"}
            subtitle={home.renewal.action}
            onPress={() => router.push("/move")}
          />
        )}
        <Row title="Your year receipt" subtitle="What your banks charged you, ready to share" onPress={() => router.push("/year")} />
        <Row title="Calculators" subtitle="Renewal, credit, TFSA and more" onPress={() => router.push("/tools")} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -space.l },
  loonies: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingLeft: space.m },
  loonieDot: { width: 10, height: 10, borderRadius: 5 },
});
