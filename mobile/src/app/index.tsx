import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Text, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../lib/api";

const POINTS = [
  { emoji: "🧾", title: "A Leak Receipt in under a minute", body: "Junk fees, forgotten subscriptions, silent price hikes and double charges, totalled for the year." },
  { emoji: "🏦", title: "Every bank, one view", body: "Connect your Big-6 bank, credit union or neobank through Plaid. Read-only, always." },
  { emoji: "🔒", title: "Your data stays yours", body: "We analyze your transactions and keep only the findings. Encrypted, never sold, deleted when you leave." },
];

export default function Welcome() {
  const theme = useTheme();
  const [checking, setChecking] = useState(true);

  // Returning users go straight to their receipt.
  useEffect(() => {
    api
      .receipt()
      .then(({ connections }) => {
        if (connections.length) router.replace("/receipt");
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
        <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
          🐦 looni
        </Text>
        <Text variant="displaySmall" style={styles.headline}>
          Find out where your money{" "}
          <Text variant="displaySmall" style={{ color: theme.colors.secondary, fontWeight: "700" }}>
            leaks.
          </Text>
        </Text>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Your bank won't tell you. Looni scans every account and shows you what you're losing each year.
        </Text>

        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.title} style={styles.point}>
              <Text style={styles.emoji}>{p.emoji}</Text>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 24, gap: 16 },
  headline: { fontWeight: "700", marginTop: 24 },
  points: { gap: 20, marginTop: 16 },
  point: { flexDirection: "row", gap: 16, alignItems: "flex-start" },
  emoji: { fontSize: 28 },
  footer: { padding: 24, paddingTop: 8 },
  cta: { paddingVertical: 8 },
});
