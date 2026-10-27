import { router } from "expo-router";
import { useState } from "react";
import { Switch, Text } from "react-native-paper";
import { Button, Row, Screen, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { type } from "../theme";

/** Plain-language data notice + the opt-in for anonymous training data. Shown before any bank is connected. */
export default function Consent() {
  const c = useCalm();
  const [training, setTraining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function proceed() {
    setSaving(true);
    try {
      await api.consent(training);
      router.push("/connect");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="How Looni handles your bank data" footer={<Button label="Continue" onPress={proceed} loading={saving} />}>
      <Section>
        <Row title="We read, then let go" subtitle="Each scan reads your transactions, finds the leaks, and discards the transactions. No copy of your bank history." />
        <Row title="We keep only the findings" subtitle={"Like “Netflix, $16.49 monthly, since May”, encrypted with a key unique to you."} />
        <Row title="Read-only, always" subtitle="Looni can't move money or see your bank password." />
        <Row title="Gone when you say so" subtitle="Disconnect and your key is destroyed, so your findings can't be read again, even from backups." />
      </Section>
      <Section title="Optional">
        <Row
          title="Help improve leak detection"
          subtitle="Share anonymous examples (merchant, how often, a price range) when you confirm a leak. Never your name, account or exact amounts."
          right={<Switch value={training} onValueChange={setTraining} accessibilityLabel="Share anonymous examples" color={c.action} />}
        />
      </Section>
      {error && <Text style={[type.secondary, { color: c.leak }]}>{error}</Text>}
    </Screen>
  );
}
