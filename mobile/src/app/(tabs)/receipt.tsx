import { router, useFocusEffect, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Banner, Button, Card, IconButton, List, Snackbar, Text, useTheme } from "react-native-paper";
import { LeakCard } from "../../components/LeakCard";
import { gradeTone, Overline, Panel, Pill, tones } from "../../components/ui";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { openPlaidLink } from "../../lib/plaidLink";
import { enablePush } from "../../lib/push";
import type { Connection, LeakReceipt, Verdict } from "../../lib/types";
import { resetUserId } from "../../lib/user";

const stoppedLabel = (n: number) => (n === 1 ? "1 leak you flagged has stopped" : `${n} leaks you flagged have stopped`);

export default function Receipt() {
  const theme = useTheme();
  const navigation = useNavigation();
  const [receipt, setReceipt] = useState<LeakReceipt | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReceipt(await api.receipt());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Reload when the tab comes back into view (a verdict on the evidence screen changes the total).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <IconButton icon="format-list-bulleted" accessibilityLabel="Accounts and transactions" onPress={() => router.push("/transactions")} /> });
  }, [navigation]);

  // Ask for notifications only after the user has seen their leaks (never at first launch).
  const leakCount = receipt?.leaks.length ?? 0;
  useEffect(() => {
    if (leakCount > 0) enablePush().catch(() => {});
  }, [leakCount]);

  // Pull to refresh = a fresh scan: the server re-reads Plaid, updates the ledger, keeps no transactions.
  async function rescan() {
    setRefreshing(true);
    try {
      setReceipt((await api.scan()).receipt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function reconnect(c: Connection) {
    try {
      const { linkToken } = await api.createUpdateLinkToken(c.itemId);
      const outcome = await openPlaidLink(linkToken);
      if (outcome.type === "success") await rescan();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function label(leakId: string, verdict: Verdict) {
    // Optimistic: flip the card now, then pull the recomputed total.
    const flip = (ls: LeakReceipt["leaks"]) => ls.map((l) => (l.id === leakId ? { ...l, verdict } : l));
    setReceipt((r) => r && { ...r, leaks: flip(r.leaks), suspicious: flip(r.suspicious) });
    try {
      const result = await api.label(leakId, verdict);
      if (result.notMeSteps) {
        const text = result.notMeSteps.map((step, i) => `${i + 1}. ${step}`).join("\n\n");
        if (Platform.OS === "web") globalThis.alert?.(text);
        else Alert.alert("Here's what to do", text);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteEverything() {
    try {
      await api.deleteMe();
      await resetUserId();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function disconnect() {
    const message = "This removes your bank connections and destroys your encryption key, so your findings can't be read again.";
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(message)) deleteEverything();
      return;
    }
    Alert.alert("Disconnect & delete?", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: deleteEverything },
    ]);
  }

  if (!receipt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {error ? <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const broken = receipt.connections.filter((c) => c.status !== "healthy");
  const confirmed = receipt.leaks.filter((l) => l.verdict === "confirmed").length;
  const newCount = receipt.leaks.filter((l) => l.isNew).length;
  const t = tones(theme.dark);
  const openLeak = (id: string) => router.push({ pathname: "/leak/[id]", params: { id } });

  return (
    <>
      <FlatList
        data={receipt.leaks}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={rescan} />}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 16 }}>
            {broken.map((c) => (
              <Banner
                key={c.itemId}
                visible
                icon="bank-off"
                style={{ borderRadius: 12 }}
                actions={
                  c.status === "login_required"
                    ? [{ label: "Reconnect", onPress: () => reconnect(c) }]
                    : [{ label: "Connect again", onPress: () => router.push("/connect") }]
                }
              >
                {`${c.institution ?? "A bank"} needs attention. ${
                  c.status === "login_required" ? "Log in again to keep scanning." : "Access was removed."
                } Your findings below are safe.`}
              </Banner>
            ))}

            {receipt.suspicious
              .filter((l) => l.verdict === null)
              .map((l) => (
                <LeakCard key={l.id} leak={l} onVerdict={(v) => label(l.id, v)} onOpen={() => openLeak(l.id)} />
              ))}

            <Panel>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Overline>LEAKING THIS YEAR</Overline>
                {receipt.grade && <Pill label={`Your bank's quiet score: ${receipt.grade}`} tone={gradeTone[receipt.grade]} />}
              </View>
              <Text variant="displayMedium" style={{ fontWeight: "800", color: theme.colors.error, fontVariant: ["tabular-nums"] }}>
                {money(receipt.totalAnnualImpact)}
                <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {" "}
                  / year
                </Text>
              </Text>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {receipt.leaks.length} {receipt.leaks.length === 1 ? "leak" : "leaks"}
                  {newCount ? ` (${newCount} new)` : ""} across {receipt.transactionCount} transactions
                  {receipt.windowStart ? ` since ${receipt.windowStart}` : ""}.{" "}
                {confirmed ? `${confirmed} confirmed.` : "Tell us which ones are real."} Every amount opens to the charges behind it.
              </Text>
            </Panel>

            {receipt.nextMove && (
              <Panel tone="yellow" onPress={() => openLeak(receipt.nextMove!.leakId)}>
                <Overline color={t.yellow.fg}>ONE NEXT MOVE</Overline>
                <Text variant="titleMedium" style={{ fontWeight: "700", color: t.yellow.fg }}>
                  {receipt.nextMove.title}
                </Text>
                <Text style={{ color: t.yellow.fg, fontWeight: "700" }}>Saves {money(receipt.nextMove.savesPerYear)} a year</Text>
              </Panel>
            )}

            {receipt.savedPerYear > 0 && (
              <Card mode="contained" style={{ backgroundColor: theme.colors.tertiaryContainer }}>
                <Card.Title
                  title={`${money(receipt.savedPerYear)} / year saved`}
                  titleStyle={{ color: theme.colors.onTertiaryContainer, fontWeight: "700" }}
                  subtitle={stoppedLabel(receipt.resolved.filter((l) => l.verdict === "confirmed").length)}
                  subtitleStyle={{ color: theme.colors.onTertiaryContainer }}
                  left={(p) => <List.Icon {...p} icon="party-popper" color={theme.colors.onTertiaryContainer} />}
                />
              </Card>
            )}

            {receipt.lastScanAt && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {receipt.connections.length
                  ? `Last scanned ${receipt.lastScanAt.replace(" ", " at ")} UTC${receipt.lastScanComplete ? "" : " (some accounts unavailable)"}. Pull down to scan again.`
                  : `From your statement scan on ${receipt.lastScanAt.slice(0, 10)}. Connect a bank to keep it up to date.`}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <LeakCard leak={item} onVerdict={(v) => label(item.id, v)} onOpen={() => openLeak(item.id)} />}
        ListEmptyComponent={
          <Text variant="bodyLarge" style={{ textAlign: "center", marginTop: 32, color: theme.colors.onSurfaceVariant }}>
            {receipt.lastScanAt ? "No leaks found. Nice!" : "No scan yet. Plaid can take a minute to fetch transactions. Pull down to scan."}
          </Text>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {receipt.resolved.length > 0 && (
              <List.Section title="Stopped leaks">
                {receipt.resolved.map((l) => (
                  <List.Item
                    key={l.id}
                    title={l.title}
                    description={`Not seen since ${l.lastSeen}${l.verdict === "confirmed" ? " · you flagged it" : ""}`}
                    left={(p) => <List.Icon {...p} icon="check-circle-outline" color={theme.colors.tertiary} />}
                    right={() => <Text style={{ alignSelf: "center" }}>{money(l.annualImpact)}/yr</Text>}
                  />
                ))}
              </List.Section>
            )}
            <Button icon="bank-plus" onPress={() => router.push("/connect")}>
              Add another account
            </Button>
            <Button icon="file-upload-outline" onPress={() => router.push("/import")}>
              Scan a statement file
            </Button>
            <Button icon="share-variant-outline" onPress={() => router.push("/year")}>
              Share your year receipt
            </Button>
            <Button icon="delete-outline" textColor={theme.colors.error} onPress={disconnect}>
              Disconnect & delete my data
            </Button>
          </View>
        }
      />
      <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
        {error}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16 },
  footer: { marginTop: 16, gap: 4 },
});
