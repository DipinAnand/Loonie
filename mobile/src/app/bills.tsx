import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { ActivityIndicator, Button, Divider, IconButton, Menu, Snackbar, Text, useTheme } from "react-native-paper";
import { Figure, Overline, Panel, Pill, SectionTitle, tones, type Tone } from "../components/ui";
import { api } from "../lib/api";
import { cadenceLabel, inDaysLabel, money, weekdayDate } from "../lib/format";
import type { Bill, Bills } from "../lib/types";
import { font } from "../theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const KIND_ICON: Record<Bill["kind"], IconName> = { bill: "file-document-outline", subscription: "repeat", debt: "credit-card-outline" };
const KIND_TONE: Record<Bill["kind"], Tone> = { bill: "lavender", subscription: "yellow", debt: "leak" };
const REMIND_CHOICES = [1, 3, 7];

export default function BillsScreen() {
  const theme = useTheme();
  const t = tones(theme.dark);
  const [data, setData] = useState<Bills | null>(null);
  const [empty, setEmpty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.bills();
      if (res.ready) setData(res);
      else setEmpty(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function update(bill: Bill, patch: { hidden?: boolean; remindDays?: number }) {
    setMenuFor(null);
    setData((d) => d && { ...d, bills: d.bills.map((b) => (b.id === bill.id ? { ...b, ...patch } : b)) });
    try {
      await api.updateBill(bill.id, patch);
      if (patch.hidden !== undefined) await load(); // the coverage total changes
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {empty ? (
          <Text variant="bodyLarge" style={{ textAlign: "center", padding: 24, color: theme.colors.onSurfaceVariant }}>
            Your bills show up after the first full scan. Pull down on your Leak Receipt to scan.
          </Text>
        ) : error ? (
          <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const visible = data.bills.filter((b) => !b.hidden);
  const late = visible.filter((b) => b.status === "late");
  const upcoming = visible.filter((b) => b.status !== "late");
  const hidden = data.bills.filter((b) => b.hidden);

  const billRow = (b: Bill, i: number) => (
    <View key={b.id} style={[styles.bill, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.outlineVariant }]}>
      <View style={styles.billMain}>
        <View style={[styles.billIcon, { backgroundColor: t[KIND_TONE[b.kind]].bg }]}>
          <MaterialCommunityIcons name={KIND_ICON[b.kind]} size={18} color={t[KIND_TONE[b.kind]].fg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontFamily: font.bold }} numberOfLines={1}>
            {b.name}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {weekdayDate(b.nextDate)} · {cadenceLabel(b.cadence)}
            {b.kind === "subscription" ? " · subscription" : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>{money(b.amount)}</Text>
          <Text variant="bodySmall" style={{ color: b.status === "due_soon" ? t.yellow.fg : theme.colors.onSurfaceVariant, fontFamily: b.status === "due_soon" ? font.bold : font.regular }}>
            {b.status === "late" ? `${b.lateDays} days late` : inDaysLabel(b.inDays)}
          </Text>
        </View>
        <Menu
          visible={menuFor === b.id}
          onDismiss={() => setMenuFor(null)}
          anchor={<IconButton icon="dots-vertical" size={20} style={{ margin: 0 }} accessibilityLabel={`Options for ${b.name}`} onPress={() => setMenuFor(b.id)} />}
        >
          {REMIND_CHOICES.map((d) => (
            <Menu.Item
              key={d}
              leadingIcon={b.remindDays === d ? "bell-check" : "bell-outline"}
              title={`Remind me ${d} day${d === 1 ? "" : "s"} before`}
              onPress={() => update(b, { remindDays: d })}
            />
          ))}
          <Divider />
          <Menu.Item leadingIcon={b.hidden ? "eye-outline" : "eye-off-outline"} title={b.hidden ? "Track this again" : "Not a bill, hide it"} onPress={() => update(b, { hidden: !b.hidden })} />
        </Menu>
      </View>
      {b.change && (
        <View style={styles.changeRow}>
          <Pill label={`${b.change.to > b.change.from ? "↑" : "↓"} Last bill ${money(b.change.to)}, usually ${money(b.change.from)}`} tone="yellow" />
        </View>
      )}
    </View>
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <CoverageCard data={data} />

        {late.map((b) => (
          <Panel key={b.id} tone="leak">
            <Overline color={t.leak.fg}>RUNNING LATE</Overline>
            <Text variant="titleMedium" style={{ color: t.leak.fg }}>
              {b.name} hasn't come out yet
            </Text>
            <Text style={{ color: t.leak.fg }}>Usually {money(b.amount)} around {weekdayDate(b.nextDate)}. Check it was paid so you don't get a late fee.</Text>
            <Button mode="outlined" textColor={t.leak.fg} style={{ alignSelf: "flex-start", borderColor: t.leak.fg }} onPress={() => update(b, { hidden: true })}>
              I stopped this
            </Button>
          </Panel>
        ))}

        <SectionTitle>Coming up</SectionTitle>
        <Panel style={{ paddingVertical: 6, gap: 0 }}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 8 }}>
            About {money(data.monthlyTotal)} a month in bills and subscriptions
          </Text>
          {upcoming.map(billRow)}
        </Panel>

        {data.paydays.map((p) => (
          <Panel key={p.name} tone="green">
            <View style={styles.billMain}>
              <MaterialCommunityIcons name="cash-plus" size={22} color={t.green.fg} />
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={{ color: t.green.fg }}>
                  Payday {weekdayDate(p.nextDate)}
                </Text>
                <Text style={{ color: t.green.fg }}>
                  {p.name} · {money(p.amount)} {cadenceLabel(p.cadence)}
                </Text>
              </View>
            </View>
          </Panel>
        ))}

        {hidden.length > 0 && <Button onPress={() => setShowHidden((v) => !v)}>{showHidden ? "Hide" : `Show ${hidden.length} hidden`}</Button>}
        {showHidden && <Panel style={{ paddingVertical: 6, gap: 0 }}>{hidden.map(billRow)}</Panel>}

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
          Bills are found from your last scan on {weekdayDate(data.asOf)}. Your balance is read live and never stored.
        </Text>
      </ScrollView>
      <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
        {error}
      </Snackbar>
    </>
  );
}

function CoverageCard({ data }: { data: Bills }) {
  const theme = useTheme();
  const t = tones(theme.dark);
  const c = data.coverage;
  const until = c.payday ? `before payday on ${weekdayDate(c.payday.date)}` : "in the next two weeks";
  const look = {
    ok: { tone: "green", icon: "check-circle-outline", head: "You're covered" },
    tight: { tone: "yellow", icon: "alert-outline", head: "It'll be tight" },
    short: { tone: "leak", icon: "alert-octagon-outline", head: "Bills may bounce" },
    unknown: { tone: "lavender", icon: "calendar-clock", head: "Bills due before payday" },
  }[c.status] as { tone: Tone; icon: IconName; head: string };
  const fg = t[look.tone].fg;

  // The first bill the balance can't cover: money has to be in before then.
  let running = 0;
  const firstShort = c.dueBills.find((b) => (running += b.amount) > (c.balance ?? Infinity));

  return (
    <Panel tone={look.tone}>
      <View style={styles.billMain}>
        <MaterialCommunityIcons name={look.icon} size={24} color={fg} />
        <Text variant="titleLarge" style={{ color: fg, fontFamily: font.display, flex: 1 }}>
          {look.head}
        </Text>
      </View>
      <Figure size={36} color={fg}>
        {money(c.due)}
      </Figure>
      <Text style={{ color: fg }}>
        in {c.dueBills.length} bill{c.dueBills.length === 1 ? "" : "s"} {until}.
      </Text>
      {c.balance !== null && c.cushion !== null && (
        <Text style={{ color: fg, fontFamily: font.bold }}>
          {c.cushion < 0 ? `${money(-c.cushion)} short of your ${money(c.balance)} balance.` : `${money(c.cushion)} left over from your ${money(c.balance)} balance.`}
        </Text>
      )}
      {c.status === "short" && (
        <Text style={{ color: fg }}>
          Move money in before {weekdayDate(firstShort?.date ?? c.until)}, or call to push a due date. A bounced payment can cost an NSF fee (capped at $10 at federally regulated banks since March 12, 2026).
        </Text>
      )}
      {c.dueBills.length > 0 && (
        <View style={styles.dueList}>
          {c.dueBills.map((b, i) => (
            <View key={`${b.id}-${b.date}-${i}`} style={styles.dueRow}>
              <Text style={{ color: fg, flex: 1 }} numberOfLines={1}>
                {weekdayDate(b.date)} · {b.name}
              </Text>
              <Text style={{ color: fg, fontFamily: font.bold, fontVariant: ["tabular-nums"] }}>{money(b.amount)}</Text>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 20, gap: 14, paddingBottom: 40 },
  bill: { paddingVertical: 10, gap: 6 },
  billMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  billIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  changeRow: { paddingLeft: 48 },
  dueList: { marginTop: 4, gap: 4 },
  dueRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
