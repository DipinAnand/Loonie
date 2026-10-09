import { StyleSheet, View } from "react-native";
import { Button, Card, Chip, Text, useTheme } from "react-native-paper";
import { money } from "../lib/format";
import type { Leak, LeakKind, Verdict } from "../lib/types";

const KIND: Record<LeakKind, { icon: string; label: string; confirm: string; dismiss: string }> = {
  fee: { icon: "bank-minus", label: "Bank fees", confirm: "Yes, a leak", dismiss: "Expected" },
  subscription: { icon: "repeat", label: "Recurring", confirm: "Don't need it", dismiss: "Keep it" },
  price_hike: { icon: "trending-up", label: "Price hike", confirm: "Didn't know", dismiss: "I knew" },
  duplicate: { icon: "content-duplicate", label: "Double charge", confirm: "Yes, duplicate", dismiss: "Not a duplicate" },
};

export function LeakCard({ leak, onVerdict }: { leak: Leak; onVerdict: (v: Verdict) => void }) {
  const theme = useTheme();
  const k = KIND[leak.kind];
  const dismissed = leak.verdict === "dismissed";

  return (
    <Card mode="elevated" style={[styles.card, dismissed && { opacity: 0.55 }]}>
      <Card.Content style={{ gap: 6 }}>
        <View style={styles.row}>
          <View style={styles.chips}>
            <Chip icon={k.icon} compact>
              {k.label}
            </Chip>
            {leak.isNew && (
              <Chip compact style={{ backgroundColor: theme.colors.primaryContainer }} textStyle={{ color: theme.colors.onPrimaryContainer }}>
                New
              </Chip>
            )}
          </View>
          <Text variant="titleMedium" style={{ color: dismissed ? theme.colors.onSurfaceVariant : theme.colors.error, fontWeight: "700" }}>
            {money(leak.annualImpact)}
            <Text variant="bodySmall">{leak.kind === "duplicate" ? "" : "/yr"}</Text>
          </Text>
        </View>
        <Text variant="titleMedium">{leak.title}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {leak.detail}
        </Text>
      </Card.Content>
      <Card.Actions>
        <Button compact mode={leak.verdict === "dismissed" ? "contained-tonal" : "text"} onPress={() => onVerdict("dismissed")}>
          {k.dismiss}
        </Button>
        <Button compact mode={leak.verdict === "confirmed" ? "contained" : "outlined"} onPress={() => onVerdict("confirmed")}>
          {k.confirm}
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chips: { flexDirection: "row", gap: 6 },
});
