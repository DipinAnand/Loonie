import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../lib/api";

const POINTS = [
  { icon: "receipt-text-outline", title: "Every fee, with the receipts", body: "Plan fees, NSF charges, currency spreads and quiet price rises, each with the transactions behind it." },
  { icon: "bank-outline", title: "Every account, one view", body: "Chequing, savings, cards, mortgage. Read-only through Plaid, so Looni never sees your password." },
  { icon: "swap-horizontal", title: "Your next best move", body: "The exact words to get a fee back, a renewal countdown that starts at 180 days, and a switch kit so nothing bounces." },
] as const;

export default function Welcome() {
  const theme = useTheme();
  const [checking, setChecking] = useState(true);

  // Returning users (a bank connected or a statement scanned) go straight to Home.
  useEffect(() => {
    api
      .receipt()
      .then(({ connections, lastScanAt }) => {
        if (connections.length || lastScanAt) router.replace("/home");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="titleLarge" style={{ fontWeight: "800" }}>
          Looni
        </Text>
        <Text variant="displaySmall" style={styles.headline}>
          Find the fees you{" "}
          <Text variant="displaySmall" style={{ color: theme.colors.primary, fontWeight: "800" }}>
            never noticed.
          </Text>
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Not another budget app. Looni reads your accounts read-only and finds you money, every month. Built in Canada.
        </Text>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <MaterialCommunityIcons name={p.icon} size={28} color={theme.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium">{p.title}</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  {p.body}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button mode="contained" contentStyle={styles.cta} onPress={() => router.push("/consent")}>
          Scan my accounts
        </Button>
        <Button onPress={() => router.push("/import")}>Drop a statement instead</Button>
        <Text variant="bodySmall" style={{ textAlign: "center", color: theme.colors.onSurfaceVariant }}>
          ✓ Read-only · ✓ No passwords stored · ✓ Nothing moves without you
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 24, gap: 16 },
  headline: { fontWeight: "800", marginTop: 24 },
  points: { gap: 20, marginTop: 16 },
  point: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  footer: { padding: 24, paddingTop: 8, gap: 4 },
  cta: { paddingVertical: 8 },
});
