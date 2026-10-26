import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Chip, HelperText, SegmentedButtons, Text, TextInput, useTheme } from "react-native-paper";
import { Figure, Overline, Panel, tones } from "../components/ui";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { font } from "../theme";

/** Inputs and outputs for each calculator in /tools. The math runs on the server (server/src/tools/calc.ts). */
type Field = { key: string; label: string; value: number; suffix?: "$" | "%" | "mo" | "yr" };
type Choice = { key: string; options: { value: string; label: string }[]; value: string };
type Out = { key: string; label: string; format: "money" | "years" | "months" | "text" | "pct"; big?: boolean };

const CALCS: { id: string; label: string; blurb: string; fields: Field[]; choice?: Choice; out: Out[] }[] = [
  {
    id: "renewal",
    label: "Renewal letter",
    blurb: "What signing your bank's renewal letter costs versus your best written quote.",
    fields: [
      { key: "balance", label: "Balance", value: 450000, suffix: "$" },
      { key: "letterRate", label: "Letter rate", value: 4.89, suffix: "%" },
      { key: "quoteRate", label: "Best quote", value: 4.29, suffix: "%" },
      { key: "amortizationYears", label: "Years left", value: 20, suffix: "yr" },
    ],
    out: [
      { key: "termCost", label: "Cost of signing the letter over 5 years", format: "money", big: true },
      { key: "letterPayment", label: "Letter payment", format: "money" },
      { key: "quotePayment", label: "Quote payment", format: "money" },
    ],
  },
  {
    id: "biweekly",
    label: "Accelerated biweekly",
    blurb: "Same income, different checkbox: half your monthly payment every two weeks.",
    fields: [
      { key: "balance", label: "Balance", value: 450000, suffix: "$" },
      { key: "rate", label: "Rate", value: 4.5, suffix: "%" },
      { key: "amortizationYears", label: "Amortization", value: 25, suffix: "yr" },
    ],
    out: [
      { key: "interestSaved", label: "Interest saved", format: "money", big: true },
      { key: "yearsSooner", label: "Paid off sooner", format: "years" },
      { key: "biweeklyPayment", label: "Every two weeks", format: "money" },
    ],
  },
  {
    id: "break",
    label: "Break mortgage?",
    blurb: "Big-5 banks charge the larger of 3 months' interest and the IRD.",
    fields: [
      { key: "balance", label: "Balance", value: 420000, suffix: "$" },
      { key: "currentRate", label: "Current rate", value: 5.49, suffix: "%" },
      { key: "newRate", label: "New rate", value: 4.19, suffix: "%" },
      { key: "monthsLeft", label: "Months left", value: 32, suffix: "mo" },
    ],
    choice: { key: "lender", value: "big5", options: [{ value: "big5", label: "Big-5 bank" }, { value: "fair", label: "Credit union" }] },
    out: [
      { key: "net", label: "Net if you break", format: "money", big: true },
      { key: "interestSaved", label: "Interest you'd save", format: "money" },
      { key: "penalty", label: "Break penalty", format: "money" },
      { key: "verdict", label: "Verdict", format: "text" },
    ],
  },
  {
    id: "credit",
    label: "Credit trap",
    blurb: "How long minimum payments take, and what cheaper debt saves at the same payment.",
    fields: [
      { key: "balance", label: "Balance owed", value: 6000, suffix: "$" },
      { key: "apr", label: "Interest rate", value: 19.99, suffix: "%" },
      { key: "payment", label: "Fixed payment", value: 250, suffix: "$" },
    ],
    choice: { key: "mode", value: "minimum", options: [{ value: "minimum", label: "Minimum only" }, { value: "fixed", label: "Fixed payment" }] },
    out: [
      { key: "months", label: "Debt-free in", format: "months", big: true },
      { key: "interest", label: "Interest paid", format: "money" },
    ],
  },
  {
    id: "budget",
    label: "50/30/20",
    blurb: "On Canadian take-home, with savings split TFSA / RRSP / emergency fund.",
    fields: [{ key: "monthlyGross", label: "Monthly gross income", value: 5000, suffix: "$" }],
    choice: { key: "province", value: "ON", options: ["ON", "QC", "BC", "AB"].map((p) => ({ value: p, label: p })) },
    out: [
      { key: "takeHome", label: "Take-home per month", format: "money", big: true },
      { key: "needs", label: "Needs (50%)", format: "money" },
      { key: "wants", label: "Wants (30%)", format: "money" },
      { key: "savings", label: "Savings (20%)", format: "money" },
      { key: "tfsa", label: "…into a TFSA", format: "money" },
      { key: "rrsp", label: "…into an RRSP", format: "money" },
      { key: "emergency", label: "…emergency fund", format: "money" },
    ],
  },
  {
    id: "tfsa",
    label: "TFSA growth",
    blurb: "Tax-free compounding. The 2026 limit is $7,000; cumulative room since 2009 is $109,000.",
    fields: [
      { key: "monthly", label: "Monthly", value: 541, suffix: "$" },
      { key: "existing", label: "Existing balance", value: 15000, suffix: "$" },
      { key: "rate", label: "Annual return", value: 6, suffix: "%" },
      { key: "years", label: "Years", value: 25, suffix: "yr" },
    ],
    out: [
      { key: "futureValue", label: "Tax-free at the end", format: "money", big: true },
      { key: "contributed", label: "You put in", format: "money" },
      { key: "gain", label: "Tax-free gain", format: "money" },
      { key: "taxableWouldLose", label: "A taxable account would lose about", format: "money" },
    ],
  },
  {
    id: "rentvbuy",
    label: "Rent vs buy",
    blurb: "25-year amortization, CMHC premium under 20% down, 2% a year upkeep, 6% on the down payment.",
    fields: [
      { key: "price", label: "Home price", value: 650000, suffix: "$" },
      { key: "downPct", label: "Down payment", value: 10, suffix: "%" },
      { key: "rate", label: "Rate", value: 5.5, suffix: "%" },
      { key: "rent", label: "Rent", value: 2200, suffix: "$" },
      { key: "years", label: "Horizon", value: 5, suffix: "yr" },
    ],
    out: [
      { key: "ownMonthly", label: "Owning per month", format: "money", big: true },
      { key: "rentTotal", label: "Total rent", format: "money" },
      { key: "ownTotal", label: "Total owning", format: "money" },
      { key: "cmhcPremium", label: "CMHC premium", format: "money" },
    ],
  },
  {
    id: "car",
    label: "Car cost",
    blurb: "13% HST and real running costs. Rule of thumb: the car costs at most 15% of gross income.",
    fields: [
      { key: "price", label: "Vehicle price", value: 35000, suffix: "$" },
      { key: "down", label: "Down payment", value: 5000, suffix: "$" },
      { key: "rate", label: "Loan rate", value: 7.9, suffix: "%" },
      { key: "termMonths", label: "Term", value: 60, suffix: "mo" },
      { key: "annualIncome", label: "Gross income", value: 70000, suffix: "$" },
    ],
    out: [
      { key: "trueMonthly", label: "True monthly cost", format: "money", big: true },
      { key: "payment", label: "Loan payment", format: "money" },
      { key: "ceiling", label: "15% of income", format: "money" },
      { key: "totalInterest", label: "Total interest", format: "money" },
    ],
  },
];

function show(v: unknown, format: Out["format"]): string {
  if (v === null || v === undefined) return format === "months" ? "Never" : "—";
  if (format === "money") return money(Number(v), "CAD", 0);
  if (format === "years") return `${v} years`;
  if (format === "months") return `${Math.floor(Number(v) / 12)}y ${Number(v) % 12}mo`;
  if (format === "pct") return `${v}%`;
  return String(v);
}

export default function Tools() {
  const theme = useTheme();
  const t = tones(theme.dark);
  const [active, setActive] = useState(CALCS[0].id);
  const calc = CALCS.find((c) => c.id === active)!;
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const values = inputs[calc.id] ?? Object.fromEntries(calc.fields.map((f) => [f.key, String(f.value)]));
  const choice = calc.choice ? (choices[calc.id] ?? calc.choice.value) : null;

  // Recompute a moment after the last keystroke.
  useEffect(() => {
    const body: Record<string, number | string> = {};
    for (const f of calc.fields) {
      const n = Number(values[f.key]?.replace(/[$,\s%]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        setError(`Check "${f.label}"`);
        return;
      }
      body[f.key] = n;
    }
    if (calc.choice && choice) body[calc.choice.key] = choice;
    setError(null);
    const timer = setTimeout(() => {
      api
        .tool<Record<string, unknown>>(calc.id, body)
        .then((r) => setResult(r.result))
        .catch((e) => setError((e as Error).message));
    }, 300);
    return () => clearTimeout(timer);
  }, [calc, JSON.stringify(values), choice]); // eslint-disable-line react-hooks/exhaustive-deps

  const big = calc.out.find((o) => o.big)!;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {CALCS.map((c) => (
          <Chip
            key={c.id}
            selected={c.id === active}
            onPress={() => {
              setActive(c.id);
              setResult(null);
            }}
          >
            {c.label}
          </Chip>
        ))}
      </ScrollView>
      <Text style={{ color: theme.colors.onSurfaceVariant }}>{calc.blurb}</Text>

      <Panel>
        {calc.choice && (
          <SegmentedButtons value={choice!} onValueChange={(v) => setChoices((s) => ({ ...s, [calc.id]: v }))} buttons={calc.choice.options} />
        )}
        <View style={styles.fields}>
          {calc.fields.map((f) => (
            <TextInput
              key={f.key}
              style={styles.field}
              mode="outlined"
              label={f.label}
              value={values[f.key]}
              keyboardType="decimal-pad"
              onChangeText={(v) => setInputs((s) => ({ ...s, [calc.id]: { ...values, [f.key]: v } }))}
              left={f.suffix === "$" ? <TextInput.Affix text="$" /> : undefined}
              right={f.suffix && f.suffix !== "$" ? <TextInput.Affix text={f.suffix} /> : undefined}
            />
          ))}
        </View>
        {error && <HelperText type="error">{error}</HelperText>}
      </Panel>

      {result && (
        <Panel tone="ink">
          <Overline color="#D8D0FA">{big.label.toUpperCase()}</Overline>
          <Figure size={40} color="#FFFFFF">
            {show(result[big.key], big.format)}
          </Figure>
          {calc.out
            .filter((o) => !o.big)
            .map((o) => (
              <View key={o.key} style={styles.row}>
                <Text style={{ color: "#D8D0FA" }}>{o.label}</Text>
                <Text style={{ color: "#FFFFFF", fontFamily: font.heavy, fontVariant: ["tabular-nums"] }}>{show(result[o.key], o.format)}</Text>
              </View>
            ))}
        </Panel>
      )}

      {calc.id === "credit" && result && Array.isArray(result.options) && (
        <Panel tone="green">
          <Overline color={t.green.fg}>CHEAPER WAYS TO PAY IT OFF (SAME PAYMENT)</Overline>
          {(result.options as { id: string; label: string; apr: number; saves: number | null }[]).map((o) => (
            <View key={o.id} style={styles.row}>
              <Text style={{ color: t.green.fg, flex: 1 }}>
                {o.label} · {o.apr.toFixed(2)}%
              </Text>
              <Text style={{ color: t.green.fg, fontFamily: font.heavy }}>{o.saves && o.saves > 0 ? `−${money(o.saves, "CAD", 0)}` : "same"}</Text>
            </View>
          ))}
        </Panel>
      )}
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        Estimates from fixed rules, not financial advice.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  chips: { gap: 8 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { flexGrow: 1, flexBasis: "45%" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
