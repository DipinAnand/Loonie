import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Button, Callout, Centered, Hero, Note, Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import { money } from "../../lib/format";
import { openPlaidLink } from "../../lib/plaidLink";
import { enablePush } from "../../lib/push";
import type { Connection, Leak, LeakReceipt } from "../../lib/types";
import { resetUserId } from "../../lib/user";
import { type } from "../../theme";

const cadence = /\s\((weekly|biweekly|monthly|quarterly|annual)\)$/;
const KIND: Record<Leak["kind"], string> = {
  fee: "Bank fee",
  subscription: "Subscription",
  price_hike: "Price rise",
  duplicate: "Double charge",
  suspicious: "Suspicious charge",
};

/** One line per leak: what it is, how sure Looni is, what it costs. The proof is one tap away. */
function leakSubtitle(l: Leak): { text: string; dot?: "leak" | "caution" | "secondary" } {
  if (l.verdict === "dismissed") return { text: "You said this is expected" };
  if (l.verdict === "confirmed") return { text: `${KIND[l.kind]} · you confirmed it`, dot: "leak" };
  const sure = l.meta.confidence === "high";
  return { text: `${sure ? "Certain" : "Check it"} · ${KIND[l.kind].toLowerCase()}${l.isNew ? " · new" : ""}`, dot: sure ? "leak" : "caution" };
}

export default function Receipt() {
  const c = useCalm();
  const [receipt, setReceipt] = useState<LeakReceipt | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReceipt(await api.receipt());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Reload when the tab comes back into view (a verdict on the evidence screen changes the total).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Ask for notifications only after the user has seen their leaks (never at first launch).
  const leakCount = receipt?.leaks.length ?? 0;
  useEffect(() => {
    if (leakCount > 0) enablePush().catch(() => {});
  }, [leakCount]);

  // Pull to refresh = a fresh scan: the server re-reads Plaid, updates the ledger, keeps no transactions.
  async function rescan() {
    setRefreshing(true);
    try {
      setReceipt((await api.scan()).receipt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function reconnect(conn: Connection) {
    try {
      const { linkToken } = await api.createUpdateLinkToken(conn.itemId);
      const outcome = await openPlaidLink(linkToken);
      if (outcome.type === "success") await rescan();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function deleteEverything() {
    try {
      await api.deleteMe();
      await resetUserId();
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function disconnect() {
    const message = "This removes your bank connections and destroys your encryption key, so your findings can't be read again. This can't be undone.";
    if (Platform.OS === "web") {
      if (globalThis.confirm?.(message)) deleteEverything();
      return;
    }
    Alert.alert("Delete all your Looni data?", message, [
      { text: "Keep my data", style: "cancel" },
      { text: "Delete my data", style: "destructive", onPress: deleteEverything },
    ]);
  }

  if (!receipt) return <Centered>{error ? <Text style={[type.body, { color: c.leak, textAlign: "center" }]}>{error}</Text> : undefined}</Centered>;

  const openLeak = (id: string) => router.push({ pathname: "/leak/[id]", params: { id } });
  const broken = receipt.connections.filter((conn) => conn.status !== "healthy");
  const suspicious = receipt.suspicious.filter((l) => l.verdict === null);
  const stopped = receipt.resolved.filter((l) => l.verdict === "confirmed");
  const counted = receipt.leaks.filter((l) => l.verdict !== "dismissed").length;

  return (
    <>
      <Screen safeTop title="Leak Receipt" refreshing={refreshing} onRefresh={receipt.connections.length ? rescan : undefined}>
        {broken.map((conn) => (
          <Callout
            key={conn.itemId}
            title={`${conn.institution ?? "A bank"} needs you`}
            action={
              conn.status === "login_required"
                ? { label: "Log in again", onPress: () => reconnect(conn) }
                : { label: "Connect again", onPress: () => router.push("/connect") }
            }
          >
            {conn.status === "login_required" ? "Looni can't read new transactions until you log in again. Your findings are safe." : "Access was removed. Your findings are safe."}
          </Callout>
        ))}

        {suspicious.map((l) => (
          <Callout key={l.id} title={`Was this you? ${l.title}`} action={{ label: "Review it", onPress: () => openLeak(l.id) }}>
            {l.detail}
          </Callout>
        ))}

        {receipt.lastScanAt ? (
          <Hero
            label="Leaking this year"
            value={money(receipt.totalAnnualImpact, "CAD", 0)}
            tone={receipt.totalAnnualImpact > 0 ? "leak" : "default"}
            caption={[`${counted} ${counted === 1 ? "leak" : "leaks"}`, receipt.grade && `your bank scores ${receipt.grade}`].filter(Boolean).join(" · ")}
          />
        ) : (
          <Text style={[type.body, { color: c.textSecondary }]}>No scan yet. Plaid can take a minute to fetch transactions. Pull down to scan.</Text>
        )}

        {receipt.leaks.length > 0 ? (
          <Section title="Your leaks">
            {receipt.leaks.map((l) => {
              const sub = leakSubtitle(l);
              return (
                <Row
                  key={l.id}
                  title={l.title.replace(cadence, "")}
                  subtitle={sub.text}
                  dot={sub.dot}
                  value={money(l.annualImpact)}
                  valueTone={l.verdict === "dismissed" ? "secondary" : "default"}
                  onPress={() => openLeak(l.id)}
                />
              );
            })}
          </Section>
        ) : (
          receipt.lastScanAt && <Text style={[type.body, { color: c.textSecondary }]}>No leaks found. Looni keeps watching.</Text>
        )}

        {stopped.length > 0 && (
          <Section title={`Stopped · ${money(receipt.savedPerYear, "CAD", 0)} a year saved`}>
            {stopped.map((l) => (
              <Row key={l.id} title={l.title.replace(cadence, "")} subtitle={`Not seen since ${l.lastSeen}`} value={`${money(l.annualImpact, "CAD", 0)}/yr`} valueTone="saved" />
            ))}
          </Section>
        )}

        <Section title="More">
          <Row title="Bills" subtitle="Due dates, paydays, reminders" onPress={() => router.push("/bills")} />
          <Row title="Accounts and transactions" subtitle="Live from your bank, not stored" onPress={() => router.push("/transactions")} />
          <Row title="Scan a statement" subtitle="CSV exports from any bank" onPress={() => router.push("/import")} />
          <Row title="Add another bank" onPress={() => router.push("/connect")} />
        </Section>

        <Note>
          {receipt.lastScanAt
            ? receipt.connections.length
              ? `Last scanned ${receipt.lastScanAt.slice(0, 16).replace(" ", " at ")} UTC${receipt.lastScanComplete ? "" : ", some accounts unavailable"}. Pull down to scan again.`
              : `From your statement scan on ${receipt.lastScanAt.slice(0, 10)}. Connect a bank to keep it up to date.`
            : "Nothing changes until you say so."}
        </Note>

        <Button label="Disconnect and delete my data" variant="danger" onPress={disconnect} />
      </Screen>
      <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
        {error}
      </Snackbar>
    </>
  );
}
