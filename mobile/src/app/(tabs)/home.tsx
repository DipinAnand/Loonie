import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoonMark } from "../../components/LoonMark";
import { Bar, Figure, gradeTone, Overline, Panel, Pill, SectionTitle, tones } from "../../components/ui";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { Home, Overview, OverviewAccount } from "../../lib/types";
import { brand, font } from "../../theme";

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
          <View style={styles.brand}>
            <LoonMark size={34} water={false} />
            <Text style={styles.wordmark}>
              Looni<Text style={{ color: brand.yellow }}>.</Text>
            </Text>
          </View>
          <Button compact mode="contained-tonal" icon="circle" onPress={() => router.push("/loon")} buttonColor={t.yellow.bg} textColor={t.yellow.fg}>
            {`${home.loonies} loonies`}
          </Button>
        </View>

        {overview && overview.accounts.length > 0 && (
          <>
            <View style={styles.worth}>
              <View style={styles.row}>
                <Overline color="#D8D0FA">EVERYTHING YOU HAVE</Overline>
                {/* The household view is planned (Pro); for now this only shows whose accounts these are. */}
                <View style={styles.toggle} accessibilityLabel="Showing your accounts. Family view coming soon">
                  <Text style={styles.toggleOn}>Me</Text>
                  <Text style={styles.toggleOff}>Family · soon</Text>
                </View>
              </View>
              <Figure size={42} color="#FFFFFF">
                {money(overview.netWorth.net, "CAD", 0)}
              </Figure>
              <Text style={{ color: "#D8D0FA", fontFamily: font.medium }}>
                {overview.accounts.length} {overview.accounts.length === 1 ? "account" : "accounts"} · live from your banks
              </Text>
            </View>
            <Panel style={{ paddingVertical: 8, gap: 0 }}>
              {overview.accounts.map((a) => {
                const look = accountLook(a);
                const owed = a.type === "credit" || a.type === "loan";
                return (
                  <View key={a.id} style={styles.account}>
                    <View style={[styles.accountIcon, { backgroundColor: look.color }]}>
                      <MaterialCommunityIcons name={look.icon} size={16} color="#FFFFFF" />
                    </View>
                    <Text style={{ flex: 1, fontFamily: font.semibold }} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>
                      {owed ? `−${money(a.balance ?? 0, "CAD", 0)}` : money(a.balance ?? 0, "CAD", 0)}
                    </Text>
                  </View>
                );
              })}
            </Panel>
          </>
        )}

        <View style={styles.tiles}>
          <Panel style={styles.tile} onPress={() => router.push("/forecast")} tone={forecast?.bounce ? "leak" : "plain"}>
            <MaterialCommunityIcons name="alert-outline" size={20} color={forecast?.bounce ? t.leak.fg : theme.colors.onSurfaceVariant} />
            <Text style={[styles.tileValue, { color: forecast?.bounce ? t.leak.fg : theme.colors.onSurface }]}>
              {forecast?.bounce ? shortDate(forecast.bounce.date) : forecast ? "None" : "—"}
            </Text>
            <Text variant="bodySmall" style={{ color: forecast?.bounce ? t.leak.fg : theme.colors.onSurfaceVariant }}>
              {forecast?.bounce ? `Bounce risk · ${money(forecast.bounce.shortBy, "CAD", 0)}` : "Bounce risk"}
            </Text>
          </Panel>
          <Panel style={styles.tile} onPress={() => router.push("/move")}>
            <MaterialCommunityIcons name="home-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.tileValue}>{home.renewal ? renewalLabel(home.renewal.daysLeft) : "Set"}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {home.renewal ? "To renewal" : "Renewal date"}
            </Text>
          </Panel>
          <Panel style={styles.tile} onPress={() => router.push("/receipt")}>
            <MaterialCommunityIcons name="water-outline" size={20} color={t.yellow.fg} />
            <Text style={styles.tileValue}>{scanned ? money(home.stillLeakingPerYear, "CAD", 0) : "—"}</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {home.grade ? `Leaks / yr · ${home.grade}` : "Leaks / yr"}
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
            {home.savedPerYear > 0 && <Text style={{ color: theme.colors.tertiary, fontFamily: font.bold }}>{money(home.savedPerYear)} a year already plugged</Text>}
            <Button mode="contained" onPress={() => router.push("/receipt")} buttonColor={t.ink.bg} textColor={t.ink.fg} contentStyle={styles.cta}>
              Open my Leak Receipt
            </Button>
          </Panel>
        ) : (
          <Panel tone="lavender">
            <Text variant="titleMedium" style={{ fontFamily: font.heavy, color: t.lavender.fg }}>
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
            <Text variant="titleMedium" style={{ fontFamily: font.bold, color: t.yellow.fg }}>
              {home.nextMove.title}
            </Text>
            <Text style={{ color: t.yellow.fg, fontFamily: font.bold }}>Saves {money(home.nextMove.savesPerYear)} a year · see the script</Text>
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
                  <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>{u.amount !== null ? money(u.amount) : ""}</Text>
                </View>
              ))}
            </Panel>
          </>
        )}

        <Panel tone="lavender" onPress={() => router.push("/loon")}>
          <Text style={{ fontFamily: font.heavy, color: t.lavender.fg }}>
            Your loon is {home.level === "egg" ? "an" : "a"} {LEVEL_LABEL[home.level]}
          </Text>
          <Bar value={levelProgress} track={theme.dark ? "#3B3375" : "#D8D0FA"} />
          <Text style={{ color: t.lavender.fg, fontFamily: font.bold }}>
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

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Banks are shown by colour and kind only, as on the site. */
function accountLook(a: OverviewAccount): { icon: IconName; color: string } {
  if (a.type === "credit") return { icon: "credit-card-outline", color: "#3B6FD8" };
  if (a.type === "loan") return { icon: "home-outline", color: "#7C4DCC" };
  if (a.type === "investment") return { icon: "trending-up", color: "#12805A" };
  if (a.subtype === "savings") return { icon: "piggy-bank-outline", color: "#1F9D6A" };
  return { icon: "bank-outline", color: "#D2453A" };
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
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  worth: { borderRadius: 26, padding: 20, gap: 8, backgroundColor: "#4F3FD0" },
  toggle: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 999, padding: 3 },
  toggleOn: { backgroundColor: "#FFFFFF", color: "#4F3FD0", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontFamily: font.heavy, overflow: "hidden" },
  toggleOff: { color: "#D8D0FA", paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontFamily: font.semibold },
  account: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  accountIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  wordmark: { fontSize: 28, fontFamily: font.display, letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: 14, gap: 4 },
  tileValue: { fontSize: 22, fontFamily: font.display, fontVariant: ["tabular-nums"] },
  cta: { paddingVertical: 6 },
  links: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
});
