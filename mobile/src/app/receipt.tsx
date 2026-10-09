import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Banner, Button, Card, IconButton, List, Snackbar, Text, useTheme } from "react-native-paper";
import { LeakCard } from "../components/LeakCard";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { openPlaidLink } from "../lib/plaidLink";
import type { Connection, LeakReceipt, Verdict } from "../lib/types";
import { resetUserId } from "../lib/user";

const stoppedLabel = (n: number) => (n === 1 ? "1 leak you flagged has stopped" : `${n} leaks you flagged have stopped`);

export default function Receipt() {
  const theme = useTheme();
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

  useEffect(() => {
    load();
  }, [load]);

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
    setReceipt((r) => r && { ...r, leaks: r.leaks.map((l) => (l.id === leakId ? { ...l, verdict } : l)) });
    try {
      await api.label(leakId, verdict);
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

  return (
    <>
      <Stack.Screen
        options={{ headerRight: () => <IconButton icon="format-list-bulleted" onPress={() => router.push("/transactions")} /> }}
      />
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

            <Card mode="contained" style={{ backgroundColor: theme.colors.secondaryContainer }}>
              <Card.Content style={{ gap: 4 }}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSecondaryContainer, letterSpacing: 1.5 }}>
                  YOU'RE LEAKING
                </Text>
                <Text variant="displayMedium" style={{ fontWeight: "800", color: theme.colors.onSecondaryContainer }}>
                  {money(receipt.totalAnnualImpact)}
                  <Text variant="titleMedium" style={{ color: theme.colors.onSecondaryContainer }}>
                    {" "}
                    / year
                  </Text>
                </Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSecondaryContainer }}>
                  {receipt.leaks.length} {receipt.leaks.length === 1 ? "leak" : "leaks"}
                  {newCount ? ` (${newCount} new)` : ""} across {receipt.transactionCount} transactions
                  {receipt.windowStart ? ` since ${receipt.windowStart}` : ""}.{" "}
                  {confirmed ? `${confirmed} confirmed.` : "Tell us which ones are real."}
                </Text>
              </Card.Content>
            </Card>

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
                Last scanned {receipt.lastScanAt.replace(" ", " at ")} UTC{receipt.lastScanComplete ? "" : " (some accounts unavailable)"}.
                Pull down to scan again.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <LeakCard leak={item} onVerdict={(v) => label(item.id, v)} />}
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
