import { useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { Centered, Note, Row, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { money, prettyCategory, shortDate } from "../lib/format";
import type { Account, Txn } from "../lib/types";
import { layout, space, type } from "../theme";

export default function Transactions() {
  const c = useCalm();
  const [data, setData] = useState<{ accounts: Account[]; transactions: Txn[]; complete: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .transactions(200)
      .then((r) => setData(r))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!data) {
    return <Centered>{error && <Text style={[type.body, { color: c.leak }]}>{error}</Text>}</Centered>;
  }

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.body}
      data={data.transactions}
      keyExtractor={(t) => t.id}
      ListHeaderComponent={
        <View style={{ gap: layout.section, marginBottom: space.m }}>
          <Section title="Accounts">
            {data.accounts.map((a) => (
              <Row
                key={a.account_id}
                title={`${a.name}${a.mask ? ` ••${a.mask}` : ""}`}
                subtitle={[a.type, a.subtype].filter(Boolean).join(" · ")}
                value={a.current_balance == null ? "—" : money(a.current_balance, a.currency ?? "CAD")}
              />
            ))}
          </Section>
          <Text accessibilityRole="header" style={[type.label, { color: c.textSecondary }]}>
            Recent transactions
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <Row
          title={item.merchantName || item.name}
          subtitle={`${shortDate(item.date)} · ${prettyCategory(item.categoryPrimary)}${item.pending ? " · pending" : ""}`}
          // Plaid: positive = money out. Money in shows green.
          value={`${item.amount < 0 ? "+" : "−"}${money(Math.abs(item.amount), item.currency ?? "CAD")}`}
          valueTone={item.amount < 0 ? "saved" : "default"}
        />
      )}
      ListFooterComponent={
        <View style={{ marginTop: space.xl }}>
          <Note>
            Live from your bank through Plaid. Looni doesn't store transactions or balances.
            {data.complete ? "" : " Some accounts couldn't be reached."}
          </Note>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.margin, paddingTop: space.xl, paddingBottom: layout.section },
});
