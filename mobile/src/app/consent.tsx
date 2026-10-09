import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Divider, HelperText, List, Switch, Text, useTheme } from "react-native-paper";
import { api } from "../lib/api";

/** Plain-language data notice + the opt-in for anonymous training data. Shown before any bank is connected. */
export default function Consent() {
  const theme = useTheme();
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="headlineSmall" style={{ fontWeight: "700" }}>
        How Looni handles your bank data
      </Text>

      <Card mode="contained">
        <List.Item
          title="We read, then let go"
          description="Each scan reads your transactions from Plaid, finds the leaks, and discards the transactions. We don't keep a copy of your bank history."
          descriptionNumberOfLines={4}
          left={(p) => <List.Icon {...p} icon="eye-off-outline" />}
        />
        <Divider />
        <List.Item
          title="We keep only the findings"
          description="Like “Netflix, $16.49 monthly, since May”. They're encrypted with a key unique to you."
          descriptionNumberOfLines={4}
          left={(p) => <List.Icon {...p} icon="shield-key-outline" />}
        />
        <Divider />
        <List.Item
          title="Read-only, always"
          description="Looni can't move money or see your bank password."
          descriptionNumberOfLines={3}
          left={(p) => <List.Icon {...p} icon="lock-outline" />}
        />
        <Divider />
        <List.Item
          title="Gone when you say so"
          description="Disconnect and your key is destroyed, so your findings can't be read again, even from backups."
          descriptionNumberOfLines={4}
          left={(p) => <List.Icon {...p} icon="delete-outline" />}
        />
      </Card>

      <Card mode="outlined">
        <Card.Content style={styles.toggle}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="titleMedium">Help improve leak detection</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              When you confirm or dismiss a leak, share an anonymous example (merchant, how often it charges, a price
              range) to train Looni's models. Never your name, account or exact amounts. Anonymous examples can't be
              traced back to you, so they aren't deleted with your account. Optional.
            </Text>
          </View>
          <Switch value={training} onValueChange={setTraining} accessibilityLabel="Share anonymous examples" />
        </Card.Content>
      </Card>

      {error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}
      <Button mode="contained" loading={saving} disabled={saving} onPress={proceed} contentStyle={{ paddingVertical: 8 }}>
        Continue
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  toggle: { flexDirection: "row", gap: 16, alignItems: "center" },
});
