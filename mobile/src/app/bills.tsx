import { useCallback, useEffect, useState } from "react";
import { Divider, Menu, Snackbar, Text } from "react-native-paper";
import { Button, Centered, Hero, Note, Row, Screen, Section, type Tone, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { cadenceLabel, inDaysLabel, money, weekdayDate } from "../lib/format";
import type { Bill, Bills } from "../lib/types";
import { type } from "../theme";

const REMIND_CHOICES = [1, 3, 7];

/** Bills: will today's balance cover what's due before payday? Every bill below, one row each. */
export default function BillsScreen() {
  const c = useCalm();
  const [data, setData] = useState<Bills | null>(null);
  const [empty, setEmpty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.bills();
      if (res.ready) setData(res);
      else setEmpty(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function update(bill: Bill, patch: { hidden?: boolean; remindDays?: number }) {
    setMenuFor(null);
    setData((d) => d && { ...d, bills: d.bills.map((b) => (b.id === bill.id ? { ...b, ...patch } : b)) });
    try {
      await api.updateBill(bill.id, patch);
      if (patch.hidden !== undefined) await load(); // the coverage total changes
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!data) {
    return (
      <Centered>
        {empty ? (
          <Text style={[type.body, { color: c.textSecondary, textAlign: "center" }]}>Your bills show up after the first full scan. Pull down on your Leak Receipt to scan.</Text>
        ) : error ? (
          <Text style={[type.body, { color: c.leak, textAlign: "center" }]}>{error}</Text>
        ) : undefined}
      </Centered>
    );
  }

  const cov = data.coverage;
  const visible = data.bills.filter((b) => !b.hidden);
  const late = visible.filter((b) => b.status === "late");
  const upcoming = visible.filter((b) => b.status !== "late");
  const hidden = data.bills.filter((b) => b.hidden);

  const statusLine: { text: string; tone: Tone } =
    cov.status === "short" && cov.cushion !== null
      ? { text: `That's ${money(-cov.cushion)} more than your balance. Move money in first, or ask to shift a due date.`, tone: "leak" }
      : cov.status === "tight" && cov.cushion !== null
        ? { text: `You're covered, with ${money(cov.cushion)} to spare. It'll be tight.`, tone: "caution" }
        : cov.status === "ok" && cov.cushion !== null
          ? { text: `You're covered, with ${money(cov.cushion)} to spare.`, tone: "saved" }
          : { text: "Connect a bank to check this against your balance.", tone: "secondary" };

  const billRow = (b: Bill) => (
    <Menu
      key={b.id}
      visible={menuFor === b.id}
      onDismiss={() => setMenuFor(null)}
      anchor={
        <Row
          title={b.name}
          subtitle={`${b.status === "late" ? `${b.lateDays} days late` : inDaysLabel(b.inDays)} · ${cadenceLabel(b.cadence)}${b.change ? ` · was ${money(b.change.from)}` : ""}`}
          subtitleTone={b.status === "late" ? "leak" : b.change && b.change.to > b.change.from ? "caution" : "secondary"}
          value={money(b.amount)}
          onPress={() => setMenuFor(b.id)}
          accessibilityLabel={`${b.name}, ${money(b.amount)}, ${weekdayDate(b.nextDate)}. Options`}
        />
      }
    >
      {REMIND_CHOICES.map((d) => (
        <Menu.Item key={d} leadingIcon={b.remindDays === d ? "bell-check" : "bell-outline"} title={`Remind me ${d} day${d === 1 ? "" : "s"} before`} onPress={() => update(b, { remindDays: d })} />
      ))}
      <Divider />
      <Menu.Item leadingIcon={b.hidden ? "eye-outline" : "eye-off-outline"} title={b.hidden ? "Track this again" : "Not a bill, hide it"} onPress={() => update(b, { hidden: !b.hidden })} />
    </Menu>
  );

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Hero
          label={cov.payday ? `Due before payday, ${weekdayDate(cov.payday.date)}` : "Due in the next two weeks"}
          value={money(cov.due)}
          caption={statusLine.text}
          captionTone={statusLine.tone}
        />

        {late.length > 0 && (
          <Section title="Hasn't come out yet">
            {late.map((b) => (
              <Row
                key={b.id}
                title={b.name}
                subtitle={`Usually ${money(b.amount)} around ${weekdayDate(b.nextDate)}. Check it was paid.`}
                subtitleTone="leak"
                right={<Button label="Stopped" variant="secondary" onPress={() => update(b, { hidden: true })} />}
              />
            ))}
          </Section>
        )}

        <Section title={`Coming up · about ${money(data.monthlyTotal, "CAD", 0)} a month`}>{upcoming.map(billRow)}</Section>

        {data.paydays.length > 0 && (
          <Section title="Paydays">
            {data.paydays.map((p) => (
              <Row key={p.name} title={p.name} subtitle={`${weekdayDate(p.nextDate)} · ${cadenceLabel(p.cadence)}`} value={`+${money(p.amount)}`} valueTone="saved" />
            ))}
          </Section>
        )}

        {hidden.length > 0 && (
          <>
            <Button label={showHidden ? "Hide hidden bills" : `Show ${hidden.length} hidden`} variant="secondary" onPress={() => setShowHidden((v) => !v)} />
            {showHidden && <Section>{hidden.map(billRow)}</Section>}
          </>
        )}

        <Note>{`Bills come from your last scan on ${weekdayDate(data.asOf)}. Tap one to set a reminder. Your balance is read live and never stored.`}</Note>
      </Screen>
      <Snackbar visible={!!error} onDismiss={() => setError(null)} duration={4000}>
        {error}
      </Snackbar>
    </>
  );
}
