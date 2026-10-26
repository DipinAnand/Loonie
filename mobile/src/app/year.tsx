import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Snackbar, Text, useTheme } from "react-native-paper";
import { captureRef } from "react-native-view-shot";
import { LoonMark } from "../components/LoonMark";
import { Overline } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { YearReceipt } from "../lib/types";
import { font } from "../theme";

/** "The receipt people screenshot": what your banks charged you this year. No account numbers, no bank names. */
export default function YearReceiptScreen() {
  const theme = useTheme();
  const card = useRef<View>(null);
  const [receipt, setReceipt] = useState<YearReceipt | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api
      .yearReceipt()
      .then(setReceipt)
      .catch((e) => setToast((e as Error).message));
  }, []);

  async function share() {
    if (!receipt) return;
    const text = `My banks charged me ${money(receipt.charged, "CAD", 0)} in ${receipt.year}. Looni found it${receipt.fixedCount ? ` and I fixed ${receipt.fixedCount}` : ""}. loonifinancial.com`;
    try {
      if (Platform.OS !== "web" && (await Sharing.isAvailableAsync())) {
        const uri = await captureRef(card, { format: "png", quality: 1 });
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share your receipt" });
      } else {
        await Share.share({ message: text });
      }
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  if (!receipt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const allFixed = receipt.lines.length > 0 && receipt.fixedCount === receipt.lines.length;

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View ref={card} collapsable={false} style={styles.receipt}>
          <LoonMark size={64} />
          <Overline color="#6C6A76">WHAT YOUR BANKS CHARGED YOU IN {receipt.year}</Overline>
          <Text style={styles.total}>{money(receipt.charged, "CAD", 0)}</Text>
          <View style={styles.rule} />
          {receipt.lines.slice(0, 8).map((l) => (
            <View key={l.id} style={styles.line}>
              <Text style={styles.lineTitle} numberOfLines={1}>
                {l.title.replace(/\s\((weekly|biweekly|monthly|quarterly|annual)\)$/, "")}
                {l.fixed ? "  ✓" : ""}
              </Text>
              <Text style={styles.lineAmount}>{money(l.amount, "CAD", 0)}</Text>
            </View>
          ))}
          {receipt.lines.length === 0 && <Text style={{ color: "#6C6A76" }}>Nothing yet this year. Scan a statement or connect a bank.</Text>}
          <View style={styles.rule} />
          {receipt.fixedCount > 0 && (
            <Text style={{ color: "#12805A", fontFamily: font.heavy }}>
              ✓ Looni fixed {allFixed ? "all " : ""}
              {receipt.fixedCount} · {money(receipt.fixedAmount, "CAD", 0)} back
            </Text>
          )}
          <Text style={{ color: "#6C6A76", fontSize: 12 }}>loonifinancial.com · details masked</Text>
        </View>
        <Button mode="contained" icon="share-variant" onPress={share} buttonColor="#FFC82E" textColor="#14141A" contentStyle={{ paddingVertical: 8 }}>
          Share my receipt
        </Button>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}>
          The image shows kinds of charges and totals only. No bank, account or merchant names.
        </Text>
      </ScrollView>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 20, gap: 16, paddingBottom: 40 },
  receipt: { backgroundColor: "#FFFFFF", borderRadius: 22, padding: 22, gap: 10, alignItems: "center" },
  total: { fontSize: 52, fontFamily: font.display, color: "#C2410C", letterSpacing: -1, fontVariant: ["tabular-nums"] },
  rule: { alignSelf: "stretch", borderTopWidth: 2, borderStyle: "dashed", borderColor: "#ECEAF2" },
  line: { alignSelf: "stretch", flexDirection: "row", justifyContent: "space-between", gap: 12 },
  lineTitle: { flex: 1, color: "#14141A", fontFamily: font.semibold },
  lineAmount: { color: "#14141A", fontFamily: font.heavy, fontVariant: ["tabular-nums"] },
});
