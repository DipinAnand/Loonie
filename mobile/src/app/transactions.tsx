import { useEffect, useState } from "react";
import { SectionList, StyleSheet, View } from "react-native";
import { ActivityIndicator, Card, Divider, List, Text, useTheme } from "react-native-paper";
import { api } from "../lib/api";
import { money, prettyCategory } from "../lib/format";
import type { Account, Txn } from "../lib/types";

export default function Transactions() {
  const theme = useTheme();
  const [data, setData] = useState<{ accounts: Account[]; transactions: Txn[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.accounts(), api.transactions(200)])
      .then(([a, t]) => setData({ accounts: a.accounts, transactions: t.transactions }))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!data) {
    return (
      <View style={styles.center}>{error ? <Text style={{ color: theme.colors.error }}>{error}</Text> : <ActivityIndicator />}</View>
    );
  }

  return (
    <SectionList
      contentContainerStyle={{ paddingBottom: 32 }}
      ListHeaderComponent={
        <View style={styles.accounts}>
          {data.accounts.map((a) => (
            <Card key={a.account_id} mode="outlined" style={{ marginBottom: 8 }}>
              <Card.Title
                title={`${a.name}${a.mask ? ` ••${a.mask}` : ""}`}
                subtitle={[a.institution_name, a.subtype].filter(Boolean).join(" · ")}
                right={() => (
                  <Text variant="titleMedium" style={{ marginRight: 16 }}>
                    {a.current_balance == null ? "—" : money(a.current_balance, a.currency ?? "CAD")}
                  </Text>
                )}
              />
            </Card>
          ))}
        </View>
      }
      sections={[{ title: "Recent transactions", data: data.transactions }]}
      keyExtractor={(t) => t.id}
      renderSectionHeader={({ section }) => (
        <List.Subheader style={{ backgroundColor: theme.colors.background }}>{section.title}</List.Subheader>
      )}
      ItemSeparatorComponent={Divider}
      renderItem={({ item }) => (
        <List.Item
          title={item.merchantName || item.name}
          description={`${item.date} · ${prettyCategory(item.categoryPrimary)}${item.pending ? " · pending" : ""}`}
          right={() => (
            // Plaid: positive = money out. Show inflows in green.
            <Text style={{ alignSelf: "center", color: item.amount < 0 ? theme.colors.tertiary : theme.colors.onSurface }}>
              {item.amount < 0 ? "+" : "−"}
              {money(Math.abs(item.amount), item.currency ?? "CAD")}
            </Text>
          )}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  accounts: { padding: 16, paddingBottom: 0 },
});
