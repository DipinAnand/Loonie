import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Centered, Note, Row, Section, useCalm } from "../components/calm";
import { LoonMark } from "../components/LoonMark";
import { api } from "../lib/api";
import { layout, space, type } from "../theme";

export default function Welcome() {
  const c = useCalm();
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

  if (checking) return <Centered />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.brand}>
          <LoonMark size={44} water={false} />
          <Text style={[type.title, { color: c.text }]}>
            Looni<Text style={{ color: c.loonie }}>.</Text>
          </Text>
        </View>
        <View style={{ gap: space.m }}>
          <Text accessibilityRole="header" style={[type.hero, { fontSize: 40, lineHeight: 46, color: c.text }]}>
            Find the fees you never noticed.
          </Text>
          <Text style={[type.body, { color: c.textSecondary }]}>Not another budget app. Looni reads your accounts and finds you money, every month. Built in Canada.</Text>
        </View>
        <Section>
          <Row title="Every fee, with the receipts" subtitle="Plan fees, NSF charges, price rises and double charges, each with the charges behind it" />
          <Row title="Every account in one place" subtitle="Read-only through Plaid. Looni never sees your password" />
          <Row title="Your next best move" subtitle="The words to get a fee back, a renewal countdown, a switch kit" />
        </Section>
      </ScrollView>
      <View style={[styles.footer, { borderColor: c.line }]}>
        <Button label="Scan my accounts" onPress={() => router.push("/consent")} />
        <Button label="Scan a statement instead" variant="secondary" onPress={() => router.push("/import")} />
        <Note>Read-only · no passwords stored · nothing moves without you</Note>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.margin, paddingTop: space.xl, paddingBottom: space.xl, gap: layout.section },
  brand: { flexDirection: "row", alignItems: "center", gap: space.s },
  footer: { paddingHorizontal: layout.margin, paddingVertical: space.m, gap: space.xs, alignItems: "stretch" },
});
