import * as Sharing from "expo-sharing";
import { useEffect, useRef, useState } from "react";
import { Platform, Share, StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { captureRef } from "react-native-view-shot";
import { Button, Centered, Note, Screen } from "../components/calm";
import { LoonMark } from "../components/LoonMark";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { YearReceipt } from "../lib/types";
import { brand, calmColors, layout, radius, space, type } from "../theme";

/** The card is made to be shared, so merchant-specific lines show only the kind of charge. Fee titles are already generic. */
const KIND_LABEL: Partial<Record<YearReceipt["lines"][number]["kind"], string>> = {
  subscription: "Subscription",
  duplicate: "Double charge",
  price_hike: "Price rise",
};
const shareLabel = (l: YearReceipt["lines"][number]) => KIND_LABEL[l.kind] ?? l.title;

// The shared image is always light, like paper, whatever the phone's theme.
const paper = calmColors.light;

/** "The receipt people screenshot": what your banks charged you this year. No account numbers, no bank names. */
export default function YearReceiptScreen() {
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

  if (!receipt) return <Centered />;

  const lines = receipt.lines.slice(0, 8);

  return (
    <>
      <Screen footer={<Button label="Share my receipt" icon="share-variant" onPress={share} />}>
        <View ref={card} collapsable={false} style={styles.card}>
          <LoonMark size={48} water={false} />
          <View style={{ gap: space.xs }}>
            <Text style={[type.secondary, { color: paper.textSecondary }]}>What my banks charged me in {receipt.year}</Text>
            <Text style={[type.hero, { color: paper.leak, fontVariant: ["tabular-nums"] }]}>{money(receipt.charged, "CAD", 0)}</Text>
          </View>
          <View>
            {lines.map((l) => (
              <View key={l.id} style={[styles.line, { borderColor: paper.line }]}>
                <Text style={[type.body, { color: paper.text, flex: 1 }]} numberOfLines={1}>
                  {shareLabel(l)}
                </Text>
                <Text style={[type.body, { color: l.fixed ? paper.saved : paper.text, fontVariant: ["tabular-nums"] }]}>
                  {l.fixed ? "Fixed · " : ""}
                  {money(l.amount, "CAD", 0)}
                </Text>
              </View>
            ))}
            {lines.length === 0 && <Text style={[type.body, { color: paper.textSecondary }]}>Nothing yet this year.</Text>}
          </View>
          {receipt.fixedCount > 0 && (
            <Text style={[type.bodyStrong, { color: paper.saved }]}>{`Looni fixed ${receipt.fixedCount} · ${money(receipt.fixedAmount, "CAD", 0)} back`}</Text>
          )}
          <Text style={[type.caption, { color: paper.textTertiary }]}>loonifinancial.com</Text>
        </View>
        <Note>The image shows kinds of charges and totals only. No bank, account or merchant names.</Note>
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#FFFFFF", borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, borderColor: brand.line, padding: layout.margin, gap: space.xl },
  line: { flexDirection: "row", gap: space.m, paddingVertical: space.m, borderTopWidth: StyleSheet.hairlineWidth },
});
