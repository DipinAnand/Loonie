import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Chip, Divider, IconButton, List, Menu, Snackbar, Text, useTheme } from "react-native-paper";
import { api } from "../lib/api";
import { cadenceLabel, inDaysLabel, money, shortDate } from "../lib/format";
import type { Bill, Bills } from "../lib/types";

const KIND_ICON: Record<Bill["kind"], string> = { bill: "file-document-outline", subscription: "repeat", debt: "credit-card-outline" };
const REMIND_CHOICES = [1, 3, 7];

export default function BillsScreen() {
  const theme = useTheme();
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

  const billRow = (b: Bill) => (
    <View key={b.id}>
      <List.Item
        title={b.name}
        titleStyle={{ fontWeight: "600" }}
        description={`${shortDate(b.nextDate)} · ${cadenceLabel(b.cadence)}${b.kind === "subscription" ? " · subscription" : ""}`}
        left={(p) => <List.Icon {...p} icon={KIND_ICON[b.kind]} />}
        right={() => (
          <View style={styles.right}>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="titleMedium" style={{ fontWeight: "700" }}>
                {money(b.amount)}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: b.status === "due_soon" ? theme.colors.secondary : theme.colors.onSurfaceVariant, fontWeight: b.status === "due_soon" ? "700" : "400" }}
              >
                {b.status === "late" ? `${b.lateDays} days late` : inDaysLabel(b.inDays)}
              </Text>
            </View>
            <Menu
              visible={menuFor === b.id}
              onDismiss={() => setMenuFor(null)}
              anchor={<IconButton icon="dots-vertical" size={20} onPress={() => setMenuFor(b.id)} />}
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
              <Menu.Item
                leadingIcon={b.hidden ? "eye-outline" : "eye-off-outline"}
                title={b.hidden ? "Track this again" : "Not a bill, hide it"}
                onPress={() => update(b, { hidden: !b.hidden })}
              />
            </Menu>
          </View>
        )}
      />
      {b.change && (
        <Chip
          compact
          icon={b.change.to > b.change.from ? "trending-up" : "trending-down"}
          style={[styles.changeChip, { backgroundColor: theme.colors.secondaryContainer }]}
          textStyle={{ color: theme.colors.onSecondaryContainer }}
        >
          {`Last bill ${money(b.change.to)}, usually ${money(b.change.from)}`}
        </Chip>
      )}
    </View>
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <CoverageCard data={data} />

        {late.map((b) => (
          <Card key={b.id} mode="contained" style={{ backgroundColor: theme.colors.errorContainer }}>
            <Card.Title
              title={`${b.name} hasn't come out yet`}
              titleNumberOfLines={2}
              titleStyle={{ color: theme.colors.onErrorContainer, fontWeight: "700" }}
              subtitle={`Usually ${money(b.amount)} around ${shortDate(b.nextDate)}. Check it was paid so you don't get a late fee.`}
              subtitleNumberOfLines={3}
              subtitleStyle={{ color: theme.colors.onErrorContainer }}
              left={(p) => <List.Icon {...p} icon="clock-alert-outline" color={theme.colors.onErrorContainer} />}
            />
            <Card.Actions>
              <Button textColor={theme.colors.onErrorContainer} onPress={() => update(b, { hidden: true })}>
                I stopped this
              </Button>
            </Card.Actions>
          </Card>
        ))}

        <Card mode="elevated">
          <Card.Title
            title="Coming up"
            titleStyle={{ fontWeight: "700" }}
            subtitle={`About ${money(data.monthlyTotal)} a month in bills and subscriptions`}
            subtitleNumberOfLines={2}
          />
          {upcoming.map(billRow)}
        </Card>

        {data.paydays.length > 0 && (
          <Card mode="contained" style={{ backgroundColor: theme.colors.tertiaryContainer }}>
            {data.paydays.map((p) => (
              <List.Item
                key={p.name}
                title={`Payday ${shortDate(p.nextDate)}`}
                titleStyle={{ color: theme.colors.onTertiaryContainer, fontWeight: "700" }}
                description={`${p.name} · ${money(p.amount)} ${cadenceLabel(p.cadence)}`}
                descriptionStyle={{ color: theme.colors.onTertiaryContainer }}
                left={(props) => <List.Icon {...props} icon="cash-plus" color={theme.colors.onTertiaryContainer} />}
              />
            ))}
          </Card>
        )}

        {hidden.length > 0 && (
          <Button onPress={() => setShowHidden((v) => !v)}>{showHidden ? "Hide" : `Show ${hidden.length} hidden`}</Button>
        )}
        {showHidden && <Card mode="outlined">{hidden.map(billRow)}</Card>}

        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
          Bills are found from your last scan on {shortDate(data.asOf)}. Your balance is read live and never stored.
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
  const c = data.coverage;
  const until = c.payday ? `before payday on ${shortDate(c.payday.date)}` : "in the next two weeks";
  const look = {
    ok: { bg: theme.colors.tertiaryContainer, fg: theme.colors.onTertiaryContainer, icon: "check-circle-outline", head: "You're covered" },
    tight: { bg: theme.colors.secondaryContainer, fg: theme.colors.onSecondaryContainer, icon: "alert-outline", head: "It'll be tight" },
    short: { bg: theme.colors.errorContainer, fg: theme.colors.onErrorContainer, icon: "alert-octagon-outline", head: "Bills may bounce" },
    unknown: { bg: theme.colors.surfaceVariant, fg: theme.colors.onSurfaceVariant, icon: "bank-outline", head: "Bills due" },
  }[c.status];

  // The first bill the balance can't cover: money has to be in before then.
  let running = 0;
  const firstShort = c.dueBills.find((b) => (running += b.amount) > (c.balance ?? Infinity));

  return (
    <Card mode="contained" style={{ backgroundColor: look.bg }}>
      <Card.Content style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <List.Icon icon={look.icon} color={look.fg} />
          <Text variant="titleLarge" style={{ color: look.fg, fontWeight: "800" }}>
            {look.head}
          </Text>
        </View>
        <Text variant="bodyLarge" style={{ color: look.fg }}>
          {money(c.due)} in {c.dueBills.length} bill{c.dueBills.length === 1 ? "" : "s"} {until}.
        </Text>
        {c.balance !== null && c.cushion !== null && (
          <Text variant="bodyLarge" style={{ color: look.fg, fontWeight: "700" }}>
            {c.cushion < 0
              ? `${money(-c.cushion)} short of your ${money(c.balance)} balance.`
              : `${money(c.cushion)} left over from your ${money(c.balance)} balance.`}
          </Text>
        )}
        {c.status === "short" && (
          <Text variant="bodyMedium" style={{ color: look.fg }}>
            Move money in before {shortDate(firstShort?.date ?? c.until)}, or call to push a due date. A bounced payment usually costs a
            $45–$50 NSF fee.
          </Text>
        )}
        <View style={styles.dueList}>
          {c.dueBills.map((b, i) => (
            <View key={`${b.id}-${b.date}-${i}`} style={styles.dueRow}>
              <Text variant="bodyMedium" style={{ color: look.fg, flex: 1 }} numberOfLines={1}>
                {shortDate(b.date)} · {b.name}
              </Text>
              <Text variant="bodyMedium" style={{ color: look.fg, fontWeight: "600" }}>
                {money(b.amount)}
              </Text>
            </View>
          ))}
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12 },
  right: { flexDirection: "row", alignItems: "center" },
  changeChip: { alignSelf: "flex-start", marginLeft: 56, marginBottom: 8, marginTop: -4 },
  dueList: { marginTop: 4, gap: 2 },
  dueRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});
