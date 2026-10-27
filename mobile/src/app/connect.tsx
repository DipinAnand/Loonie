import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "react-native-paper";
import { Button, Centered, Note, Row, Screen, Section, useCalm } from "../components/calm";
import { api, ApiError } from "../lib/api";
import { isPlaidLinkAvailable, openPlaidLink } from "../lib/plaidLink";
import { space, type } from "../theme";

type Phase = { name: "idle" } | { name: "linking" } | { name: "scanning"; bank?: string } | { name: "error"; message: string };

export default function Connect() {
  const c = useCalm();
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
    setPhase({ name: "error", message: err instanceof ApiError || err instanceof Error ? err.message : "Couldn't connect. Check your internet and try again." });

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
    setPhase({ name: "scanning", bank: "the test bank" });
    try {
      await api.sandboxQuickLink(scenario);
      router.replace("/receipt");
    } catch (err) {
      fail(err);
    }
  }

  if (phase.name === "scanning") {
    return (
      <Centered>
        <View style={{ alignItems: "center", gap: space.l }}>
          <ActivityIndicator color={c.action} />
          <Text style={[type.heading, { color: c.text }]}>Scanning {phase.bank ?? "your accounts"}</Text>
          <Text style={[type.secondary, { color: c.textSecondary, textAlign: "center" }]}>
            Checking up to 12 months of transactions for fees, subscriptions and price rises.
          </Text>
        </View>
      </Centered>
    );
  }

  return (
    <Screen
      title="Connect securely with Plaid"
      subtitle="You log in on your bank's own screen. Looni never sees your password."
      footer={
        <>
          <Button label="Connect a bank" icon="bank" onPress={connectWithPlaid} loading={phase.name === "linking"} disabled={busy || !linkAvailable} />
          <Button label="Scan a statement instead" variant="secondary" onPress={() => router.push("/import")} disabled={busy} />
        </>
      }
    >
      <Section>
        <Row title="Read-only" subtitle="Looni sees transactions. It can't move money." />
        <Row title="Encrypted" subtitle="Your bank connection is stored with strong encryption." />
        <Row title="Yours to delete" subtitle="Disconnect any time and your data is deleted." />
      </Section>
      {phase.name === "error" && (
        <Text accessibilityRole="alert" style={[type.secondary, { color: c.leak }]}>
          {phase.message}
        </Text>
      )}
      {!linkAvailable && <Note>Connecting a real bank needs the installed app. In this preview, use a test bank below.</Note>}
      {sandbox && (
        <Section title="Test banks">
          <Row title="Leaky test account" subtitle="A year of fees, subscriptions and a double charge" onPress={busy ? undefined : () => quickLink("leaky")} />
          <Row title="Plaid sample data" subtitle="Plaid's standard test transactions" onPress={busy ? undefined : () => quickLink("dynamic")} />
          <Note>In Plaid Link, pick any bank and log in with user_good / pass_good, or user_transactions_dynamic for recurring data. MFA code: 1234.</Note>
        </Section>
      )}
    </Screen>
  );
}
