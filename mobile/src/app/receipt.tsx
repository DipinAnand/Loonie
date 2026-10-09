import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, IconButton, Snackbar, Text, useTheme } from "react-native-paper";
import { LeakCard } from "../components/LeakCard";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { LeakReceipt, Verdict } from "../lib/types";
import { resetUserId } from "../lib/user";

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

  async function refresh() {
    setRefreshing(true);
    try {
      await api.sync();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
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

  function disconnect() {
    Alert.alert("Disconnect & delete?", "This removes your bank connections and deletes all your Looni data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteMe();
            await resetUserId();
            router.replace("/");
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);
  }

  if (!receipt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        {error ? <Text style={{ color: theme.colors.error, padding: 24 }}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const confirmed = receipt.leaks.filter((l) => l.verdict === "confirmed").length;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="format-list-bulleted" onPress={() => router.push("/transactions")} />,
        }}
      />
      <FlatList
        data={receipt.leaks}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <Card mode="contained" style={[styles.total, { backgroundColor: theme.colors.secondaryContainer }]}>
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
                {receipt.leaks.length} leaks found in {receipt.transactionCount} transactions
                {receipt.windowStart ? ` since ${receipt.windowStart}` : ""}. {confirmed ? `${confirmed} confirmed.` : "Tell us which ones are real."}
              </Text>
            </Card.Content>
          </Card>
        }
        renderItem={({ item }) => <LeakCard leak={item} onVerdict={(v) => label(item.id, v)} />}
        ListEmptyComponent={
          <Text variant="bodyLarge" style={{ textAlign: "center", marginTop: 32, color: theme.colors.onSurfaceVariant }}>
            {receipt.transactionCount
              ? "No leaks found. Nice!"
              : "No transactions yet. Plaid can take a minute to fetch them. Pull down to refresh."}
          </Text>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Button icon="bank-plus" onPress={() => router.push("/connect")}>
              Add another account
            </Button>
            <Button icon="delete-outline" textColor={theme.colors.error} onPress={disconnect}>
              Disconnect & delete my data
            </Button>
          </View>
        }
      />
      <Snackbar visible={!!error && !!receipt} onDismiss={() => setError(null)} duration={4000}>
        {error}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16 },
  total: { marginBottom: 16 },
  footer: { marginTop: 16, gap: 4 },
});
