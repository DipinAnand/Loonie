import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Button, Callout, Field, Hero, Note, Progress, Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import { money, shortDate } from "../../lib/format";
import type { RateBlock, Renewal, SwitchKit } from "../../lib/types";
import { space, type } from "../../theme";

/** Renew and switch: the countdown is the one number; the switch kit and Rate Block are a tap away. */
export default function Move() {
  const c = useCalm();
  const [renewal, setRenewal] = useState<Renewal | null | undefined>(undefined);
  const [kit, setKit] = useState<SwitchKit | null>(null);
  const [pool, setPool] = useState<RateBlock | null>(null);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .renewal()
      .then((r) => setRenewal(r.renewal))
      .catch((e) => {
        setRenewal(null);
        setToast((e as Error).message);
      });
    api.switchKit().then(setKit).catch(() => {});
    api.rateBlock().then(setPool).catch(() => {});
  }, []);
  useFocusEffect(load);

  const next = renewal?.milestones.find((m) => m.status === "upcoming" && m.days < renewal.daysLeft);

  return (
    <>
      <Screen safeTop title="Renew and switch">
        {renewal === undefined ? null : renewal && !editing ? (
          <>
            <View style={{ gap: space.m }}>
              <Hero
                label={`Mortgage renews ${shortDate(renewal.maturityDate)}`}
                value={String(Math.max(0, renewal.daysLeft))}
                unit={renewal.daysLeft === 1 ? "day" : "days"}
                tone={renewal.band === "red" ? "leak" : "default"}
              />
              <Progress value={renewal.progress} tone={renewal.band === "red" ? "leak" : "action"} />
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                {renewal.milestones.map((m) => (
                  <Text key={m.id} style={[type.caption, { color: m.status === "passed" ? c.text : c.textTertiary }]}>
                    {m.days}
                  </Text>
                ))}
              </View>
            </View>

            <Callout title="Do this now" action={{ label: "Edit dates and rates", onPress: () => setEditing(true) }}>
              <Text style={[type.bodyStrong, { color: c.text }]}>{renewal.action}</Text>
              {renewal.costs && (
                <Text style={[type.secondary, { color: c.textSecondary }]}>
                  Signing your bank's letter would cost about <Text style={{ color: c.leak }}>{money(renewal.costs.termCost, "CAD", 0)}</Text> more over five years.
                </Text>
              )}
              {next && <Text style={[type.secondary, { color: c.textSecondary }]}>{`Next reminder at ${next.days} days: ${next.label.toLowerCase()}, ${shortDate(next.date)}.`}</Text>}
            </Callout>
          </>
        ) : (
          <RenewalForm
            initial={renewal ?? null}
            onSaved={(r) => {
              setRenewal(r);
              setEditing(false);
            }}
            onCancel={renewal ? () => setEditing(false) : undefined}
          />
        )}

        <Section>
          <Row
            title="Switch kit"
            subtitle={kit && kit.total > 0 ? `${kit.moved} of ${kit.total} payments moved` : "Every payment and deposit, so nothing bounces"}
            onPress={() => router.push("/switch")}
          />
          <Row
            title="Rate Block"
            subtitle={pool?.pledged && pool.pool ? `You're in · ${pool.pool.joined} of ${pool.goal} joined` : "Pool renewals with neighbours · 2027"}
            onPress={() => router.push("/rate-block")}
          />
          <Row title="Mortgage calculators" subtitle="Break penalty, biweekly, renewal letter" onPress={() => router.push("/tools")} />
        </Section>

        {renewal?.biweekly && (
          <Note>{`Paying accelerated biweekly would save about ${money(renewal.biweekly.interestSaved, "CAD", 0)} in interest and finish ${renewal.biweekly.yearsSooner} years sooner.`}</Note>
        )}
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}

function RenewalForm({ initial, onSaved, onCancel }: { initial: Renewal | null; onSaved: (r: Renewal) => void; onCancel?: () => void }) {
  const c = useCalm();
  const [date, setDate] = useState(initial?.maturityDate ?? "");
  const [balance, setBalance] = useState(initial?.balance ? String(initial.balance) : "");
  const [letter, setLetter] = useState(initial?.letterRate ? String(initial.letterRate) : "");
  const [quote, setQuote] = useState(initial?.quoteRate ? String(initial.quoteRate) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const num = (s: string) => (s.trim() ? Number(s.replace(/[$,\s%]/g, "")) : undefined);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const { renewal } = await api.setRenewal({ maturityDate: date.trim(), balance: num(balance), letterRate: num(letter), quoteRate: num(quote) });
      onSaved(renewal);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: space.xl }}>
      <View style={{ gap: space.s }}>
        <Text style={[type.heading, { color: c.text }]}>When does your mortgage term end?</Text>
        <Text style={[type.secondary, { color: c.textSecondary }]}>
          Your bank writes 21 days before. Looni starts the clock at 180. Rates are optional: they show what signing the letter costs.
        </Text>
      </View>
      <Field label="Maturity date" value={date} onChangeText={setDate} autoCapitalize="none" placeholder="2027-02-09" />
      <Field label="Balance (optional)" prefix="$" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="450,000" />
      <View style={{ flexDirection: "row", gap: space.m }}>
        <Field label="Letter rate" suffix="%" value={letter} onChangeText={setLetter} keyboardType="decimal-pad" placeholder="4.89" />
        <Field label="Best quote" suffix="%" value={quote} onChangeText={setQuote} keyboardType="decimal-pad" placeholder="4.29" />
      </View>
      {error && <Text style={[type.secondary, { color: c.leak }]}>{error}</Text>}
      <View>
        <Button label="Start my countdown" onPress={save} loading={saving} />
        {onCancel && <Button label="Cancel" variant="secondary" onPress={onCancel} />}
      </View>
    </View>
  );
}
