import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import { Button, Chip, HelperText, Snackbar, Text, TextInput, useTheme } from "react-native-paper";
import { Bar, Figure, Overline, Panel, Pill, SectionTitle, tones } from "../../components/ui";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { RateBlock, Renewal, SwitchKit } from "../../lib/types";
import { font } from "../../theme";

const PROVINCE_NAME: Record<string, string> = { ON: "Ontario", QC: "Quebec", BC: "British Columbia", AB: "Alberta", MB: "Manitoba", SK: "Saskatchewan", NS: "Nova Scotia", NB: "New Brunswick", NL: "Newfoundland and Labrador", PE: "PEI" };

/** "ON-2027-Q1" → "ONTARIO · Q1 2027 RENEWALS". */
function poolLabel(id: string): string {
  const [prov, year, q] = id.split("-");
  return `${(PROVINCE_NAME[prov] ?? prov).toUpperCase()} · ${q} ${year} RENEWALS`;
}

const PROVINCES = ["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE"];

/** Renew and switch: the mortgage countdown, the switch kit, and the Rate Block pool. */
export default function Move() {
  const theme = useTheme();
  const t = tones(theme.dark);
  const [renewal, setRenewal] = useState<Renewal | null>(null);
  const [kit, setKit] = useState<SwitchKit | null>(null);
  const [pool, setPool] = useState<RateBlock | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api.renewal().then((r) => setRenewal(r.renewal)).catch((e) => setToast((e as Error).message));
    api.switchKit().then(setKit).catch(() => {});
    api.rateBlock().then(setPool).catch(() => {});
  }, []);
  useFocusEffect(load);

  async function toggle(key: string, moved: boolean) {
    try {
      setKit(await api.setMoved(key, moved));
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  async function join(province: string) {
    try {
      setPool(await api.joinRateBlock(province));
      setToast("You're in the pool. We'll write when it opens.");
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  async function invite() {
    await Share.share({
      message: "I'm in Looni's Rate Block: renewals pooled so lenders bid for the block, and the commission is split half and half with us. Join the pool: https://loonifinancial.com/rate-block",
    }).catch(() => {});
  }

  const bandColor = renewal?.band === "red" ? theme.colors.error : renewal?.band === "amber" ? t.yellow.fg : theme.colors.primary;

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" style={{ fontFamily: font.display }}>
          Your bank writes at 21 days. Looni starts at 180.
        </Text>

        {renewal && !editing ? (
          <>
            <Panel tone="ink">
              <View style={styles.row}>
                <View>
                  <Figure size={52} color={renewal.band === "calm" ? "#FFFFFF" : bandColor}>
                    {Math.max(0, renewal.daysLeft)}
                  </Figure>
                  <Text style={{ color: "#D8D0FA" }}>days to renewal · {shortDate(renewal.maturityDate)}</Text>
                </View>
                <Button textColor="#D8D0FA" onPress={() => setEditing(true)}>
                  Edit
                </Button>
              </View>
              <Bar value={renewal.progress} color={renewal.band === "red" ? "#FF9E73" : "#FFC82E"} track="#2A2833" />
              <Overline color="#FFC82E">DO THIS NOW</Overline>
              <Text style={{ color: "#FFFFFF", fontFamily: font.bold }}>{renewal.action}</Text>
            </Panel>

            <Panel>
              {renewal.milestones.map((m) => (
                <View key={m.id} style={styles.milestone}>
                  <View style={[styles.dot, { backgroundColor: m.status === "passed" ? theme.colors.tertiary : "transparent", borderColor: m.status === "passed" ? theme.colors.tertiary : m.days === 21 ? theme.colors.error : theme.colors.primary }]} />
                  <Text style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.heavy }}>{m.days} days</Text> · {m.label}
                  </Text>
                  <Text style={{ color: theme.colors.onSurfaceVariant }}>{shortDate(m.date)}</Text>
                </View>
              ))}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Looni reminds you at every milestone.
              </Text>
            </Panel>

            {(renewal.costs || renewal.biweekly) && (
              <View style={styles.tiles}>
                {renewal.costs && (
                  <Panel tone="leak" style={styles.tile}>
                    <Figure size={26} color={t.leak.fg}>
                      {money(renewal.costs.termCost, "CAD", 0)}
                    </Figure>
                    <Text variant="bodySmall" style={{ color: t.leak.fg }}>
                      cost of signing the letter over the term ({renewal.letterRate}% vs {renewal.quoteRate}%)
                    </Text>
                  </Panel>
                )}
                {renewal.biweekly && (
                  <Panel tone="green" style={styles.tile}>
                    <Figure size={26} color={t.green.fg}>
                      {money(renewal.biweekly.interestSaved, "CAD", 0)}
                    </Figure>
                    <Text variant="bodySmall" style={{ color: t.green.fg }}>
                      saved with accelerated biweekly, {renewal.biweekly.yearsSooner} years sooner
                    </Text>
                  </Panel>
                )}
              </View>
            )}
          </>
        ) : (
          <RenewalForm
            initial={renewal}
            onSaved={(r) => {
              setRenewal(r);
              setEditing(false);
            }}
            onCancel={renewal ? () => setEditing(false) : undefined}
          />
        )}

        <SectionTitle>Switch kit</SectionTitle>
        <Panel>
          <Text variant="titleMedium" style={{ fontFamily: font.heavy }}>
            Move everything. Nothing bounces.
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Canada has no one-click account switch. Point deposits at the new account first, then move payments, earliest first.
          </Text>
          {kit && kit.total > 0 ? (
            <>
              <View style={styles.row}>
                <Text style={{ fontFamily: font.heavy }}>Moved</Text>
                <Text style={{ fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>
                  {kit.moved} of {kit.total}
                </Text>
              </View>
              <Bar value={kit.moved / kit.total} color={theme.colors.tertiary} />
              {kit.items.map((i) => (
                <View key={i.key} style={[styles.kitRow, { borderColor: theme.colors.outlineVariant }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: font.bold }}>{i.name}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {i.direction === "deposit" ? "Deposit" : "Payment"} · {i.cadence} · {money(i.amount)} · next {shortDate(i.nextDate)}
                    </Text>
                  </View>
                  <Chip selected={i.moved} showSelectedCheck onPress={() => toggle(i.key, !i.moved)} accessibilityLabel={`${i.name}: ${i.moved ? "moved" : "to move"}`}>
                    {i.moved ? "Moved" : "To move"}
                  </Chip>
                </View>
              ))}
            </>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>Connect a bank or scan a statement and Looni lists every pre-authorized payment and deposit here.</Text>
          )}
        </Panel>

        <SectionTitle>Rate Block</SectionTitle>
        <Panel tone="yellow">
          <Pill label="Coming 2027" tone="yellow" />
          <Text variant="titleMedium" style={{ fontFamily: font.heavy, color: t.yellow.fg }}>
            We get the rate for you. Not six banks.
          </Text>
          <Text style={{ color: t.yellow.fg }}>
            Renewals pooled by province and quarter, negotiated as one block once a pool reaches {pool?.goal ?? 500}. Whatever commission the lender pays Looni, we split half and half with you.
          </Text>
          {pool?.pledged && pool.pool ? (
            <View style={styles.poolCard}>
              <Overline color="#5E4B00">{poolLabel(pool.pool.id)}</Overline>
              <View style={styles.row}>
                <Figure size={34} color="#14141A">
                  {pool.pool.joined}
                </Figure>
                <Text style={{ fontFamily: font.bold, color: "#5E4B00", flex: 1 }}>{pool.pool.joined === 1 ? "neighbour" : "neighbours"} in your pool</Text>
              </View>
              <Bar value={pool.pool.joined / pool.goal} color="#14141A" track="rgba(20,20,26,0.15)" />
              <View style={styles.row}>
                <Text style={{ fontFamily: font.bold, color: "#5E4B00" }}>{pool.pool.joined} joined</Text>
                <Text style={{ fontFamily: font.bold, color: "#5E4B00" }}>Goal {pool.goal} → lenders bid</Text>
              </View>
              <Text style={{ color: "#5E4B00" }}>Every neighbour who joins makes the block bigger. No rate is shown until lenders bid on a full pool.</Text>
              <Button mode="contained" icon="share-variant" buttonColor="#4F3FD0" textColor="#FFFFFF" onPress={invite}>
                Invite a neighbour
              </Button>
              <Button compact textColor="#5E4B00" onPress={async () => setPool(await api.leaveRateBlock())}>
                Leave the pool
              </Button>
            </View>
          ) : renewal ? (
            <>
              <Text style={{ color: t.yellow.fg, fontFamily: font.bold }}>Your province:</Text>
              <View style={styles.chips}>
                {PROVINCES.map((p) => (
                  <Chip key={p} onPress={() => join(p)} compact>
                    {p}
                  </Chip>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: t.yellow.fg, fontFamily: font.bold }}>Set your renewal date above to hold a spot.</Text>
          )}
          <Text variant="bodySmall" style={{ color: t.yellow.fg }}>
            Example only. Subject to mortgage brokerage licensing and provincial rules. Not an offer, not advice.
          </Text>
        </Panel>

        <Button icon="calculator-variant-outline" mode="outlined" onPress={() => router.push("/tools")}>
          Renewal and mortgage calculators
        </Button>
      </ScrollView>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

function RenewalForm({ initial, onSaved, onCancel }: { initial: Renewal | null; onSaved: (r: Renewal) => void; onCancel?: () => void }) {
  const theme = useTheme();
  const [date, setDate] = useState(initial?.maturityDate ?? "");
  const [balance, setBalance] = useState(initial?.balance ? String(initial.balance) : "");
  const [letter, setLetter] = useState(initial?.letterRate ? String(initial.letterRate) : "");
  const [quote, setQuote] = useState(initial?.quoteRate ? String(initial.quoteRate) : "");
  const [error, setError] = useState<string | null>(null);
  const num = (s: string) => (s.trim() ? Number(s.replace(/[$,\s%]/g, "")) : undefined);

  async function save() {
    setError(null);
    try {
      const { renewal } = await api.setRenewal({ maturityDate: date.trim(), balance: num(balance), letterRate: num(letter), quoteRate: num(quote) });
      onSaved(renewal);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Panel>
      <Text variant="titleMedium" style={{ fontFamily: font.heavy }}>
        When does your mortgage term end?
      </Text>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>It's on your last renewal agreement or annual statement. Rates are optional: they show what signing the letter costs.</Text>
      <TextInput mode="outlined" label="Maturity date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" placeholder="2027-02-09" />
      <TextInput mode="outlined" label="Balance (optional)" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" left={<TextInput.Affix text="$" />} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInput style={{ flex: 1 }} mode="outlined" label="Letter rate %" value={letter} onChangeText={setLetter} keyboardType="decimal-pad" />
        <TextInput style={{ flex: 1 }} mode="outlined" label="Best quote %" value={quote} onChangeText={setQuote} keyboardType="decimal-pad" />
      </View>
      {error && <HelperText type="error">{error}</HelperText>}
      <Button mode="contained" onPress={save} contentStyle={{ paddingVertical: 6 }}>
        Start my countdown
      </Button>
      {onCancel && <Button onPress={onCancel}>Cancel</Button>}
    </Panel>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  milestone: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 3 },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, padding: 14, gap: 4 },
  kitRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  poolCard: { backgroundColor: "#FFC82E", borderRadius: 20, padding: 16, gap: 10 },
});
