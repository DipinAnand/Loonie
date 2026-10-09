import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, HelperText, List, Text, useTheme } from "react-native-paper";
import { api, ApiError } from "../lib/api";
import { isPlaidLinkAvailable, openPlaidLink } from "../lib/plaidLink";

type Phase = { name: "idle" } | { name: "linking" } | { name: "scanning"; bank?: string } | { name: "error"; message: string };

export default function Connect() {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const linkAvailable = isPlaidLinkAvailable();
  // The test-bank shortcuts only make sense (and only work) against Plaid Sandbox.
  const [sandbox, setSandbox] = useState(false);
  useEffect(() => {
    api
      .health()
      .then((h) => setSandbox(h.plaidEnv === "sandbox"))
      .catch(() => {});
  }, []);
  const busy = phase.name === "linking" || phase.name === "scanning";

  const fail = (err: unknown) =>
    setPhase({ name: "error", message: err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong" });

  async function connectWithPlaid() {
    setPhase({ name: "linking" });
    try {
      const { linkToken } = await api.createLinkToken();
      const outcome = await openPlaidLink(linkToken);
      if (outcome.type === "exit") {
        const err = outcome.exit.error;
        setPhase(err ? { name: "error", message: err.displayMessage || err.errorMessage } : { name: "idle" });
        return;
      }
      const { publicToken, metadata } = outcome.success;
      setPhase({ name: "scanning", bank: metadata.institution?.name });
      await api.exchangePublicToken(publicToken, { id: metadata.institution?.id, name: metadata.institution?.name });
      router.replace("/receipt");
    } catch (err) {
      fail(err);
    }
  }

  async function quickLink(scenario: "leaky" | "dynamic") {
    setPhase({ name: "scanning", bank: "Plaid sandbox bank" });
    try {
      await api.sandboxQuickLink(scenario);
      router.replace("/receipt");
    } catch (err) {
      fail(err);
    }
  }

  if (phase.name === "scanning") {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
        <Text variant="titleMedium" style={{ marginTop: 24 }}>
          Scanning {phase.bank ?? "your accounts"}…
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: "center" }}>
          Pulling up to 12 months of transactions and checking them for fees, subscriptions and price hikes.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={{ fontWeight: "700" }}>
        Connect securely with Plaid
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
        Plaid connects Looni to your bank. You log in on your bank's screen; we never see your password.
      </Text>

      <Card mode="contained">
        <List.Item title="Read-only" description="Looni can see transactions. It can't move money." left={(p) => <List.Icon {...p} icon="eye-outline" />} />
        <List.Item title="Encrypted" description="Bank tokens are encrypted at rest (AES-256)." left={(p) => <List.Icon {...p} icon="lock-outline" />} />
        <List.Item title="Yours to delete" description="Disconnect anytime and your data is deleted." left={(p) => <List.Icon {...p} icon="delete-outline" />} />
      </Card>

      {phase.name === "error" && (
        <HelperText type="error" visible style={{ fontSize: 14 }}>
          {phase.message}
        </HelperText>
      )}

      <Button
        mode="contained"
        icon="bank"
        loading={phase.name === "linking"}
        disabled={busy || !linkAvailable}
        onPress={connectWithPlaid}
        contentStyle={styles.cta}
      >
        Connect a bank
      </Button>
      {!linkAvailable && (
        <HelperText type="info" visible>
          Plaid Link needs a development build (npx expo run:ios or run:android). In Expo Go or on web, use the sandbox
          shortcut below.
        </HelperText>
      )}

      {sandbox && (
        <Card mode="outlined" style={{ marginTop: 8 }}>
          <Card.Title title="Plaid Sandbox" subtitle="Test banks, no real money" />
          <Card.Content style={{ gap: 6 }}>
            <Text variant="bodyMedium">
              In Plaid Link, pick any bank (e.g. First Platypus Bank) and log in with{" "}
              <Text style={styles.mono}>user_good</Text> / <Text style={styles.mono}>pass_good</Text>. For realistic recurring
              data, use <Text style={styles.mono}>user_transactions_dynamic</Text> with any password. MFA code:{" "}
              <Text style={styles.mono}>1234</Text>.
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Or skip Link entirely and have the server create a sandbox connection:
            </Text>
          </Card.Content>
          <Card.Actions>
            <Button disabled={busy} onPress={() => quickLink("dynamic")}>
              Plaid sample data
            </Button>
            <Button mode="contained-tonal" disabled={busy} onPress={() => quickLink("leaky")}>
              Leaky test account
            </Button>
          </Card.Actions>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  cta: { paddingVertical: 8 },
  mono: { fontFamily: "monospace", fontWeight: "600" },
});
