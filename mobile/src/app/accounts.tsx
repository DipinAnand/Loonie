import { useEffect, useState } from "react";
import { Text } from "react-native-paper";
import { Centered, Hero, Note, Row, Screen, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import { money } from "../lib/format";
import type { Overview, OverviewAccount } from "../lib/types";
import { type } from "../theme";

const KIND: Record<string, string> = { depository: "Bank account", credit: "Credit card", loan: "Loan", investment: "Investments" };

const owed = (a: OverviewAccount) => a.type === "credit" || a.type === "loan";

/** Everything you have, across banks. Live from Plaid for this screen only; never stored. */
export default function Accounts() {
  const c = useCalm();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .overview()
      .then(setOverview)
      .catch((e) => setError((e as Error).message));
  }, []);

  if (!overview) return <Centered>{error ? <Text style={[type.body, { color: c.leak }]}>{error}</Text> : undefined}</Centered>;

  const have = overview.accounts.filter((a) => !owed(a));
  const owe = overview.accounts.filter(owed);

  return (
    <Screen>
      <Hero
        label="Net worth"
        value={money(overview.netWorth.net, "CAD", 0)}
        caption={`${money(overview.netWorth.assets, "CAD", 0)} you have, ${money(overview.netWorth.debts, "CAD", 0)} you owe`}
      />
      {have.length > 0 && (
        <Section title="What you have">
          {have.map((a) => (
            <Row key={a.id} title={a.name} subtitle={KIND[a.type] ?? a.type} value={money(a.balance ?? 0)} />
          ))}
        </Section>
      )}
      {owe.length > 0 && (
        <Section title="What you owe">
          {owe.map((a) => (
            <Row key={a.id} title={a.name} subtitle={a.subtype === "mortgage" ? "Mortgage" : (KIND[a.type] ?? a.type)} value={money(a.balance ?? 0)} />
          ))}
        </Section>
      )}
      <Note>Balances are read live from your banks through Plaid and are never stored by Looni.</Note>
    </Screen>
  );
}
