import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Button, Centered, Hero, Note, Progress, Row, Screen, Section, useCalm } from "../components/calm";
import { api } from "../lib/api";
import type { RateBlock, Renewal } from "../lib/types";
import { space, type } from "../theme";

const PROVINCES: [string, string][] = [
  ["ON", "Ontario"],
  ["QC", "Quebec"],
  ["BC", "British Columbia"],
  ["AB", "Alberta"],
  ["MB", "Manitoba"],
  ["SK", "Saskatchewan"],
  ["NS", "Nova Scotia"],
  ["NB", "New Brunswick"],
  ["NL", "Newfoundland and Labrador"],
  ["PE", "Prince Edward Island"],
];
const provinceName = (code: string) => PROVINCES.find(([p]) => p === code)?.[1] ?? code;

/** Rate Block (coming 2027): renewals pooled by province and quarter; lenders bid for the block. */
export default function RateBlockScreen() {
  const c = useCalm();
  const [pool, setPool] = useState<RateBlock | null>(null);
  const [renewal, setRenewal] = useState<Renewal | null | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.rateBlock().then(setPool).catch((e) => setToast((e as Error).message));
    api
      .renewal()
      .then((r) => setRenewal(r.renewal))
      .catch(() => setRenewal(null));
  }, []);

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

  if (!pool || renewal === undefined) return <Centered />;

  const [prov, year, quarter] = pool.pool?.id.split("-") ?? [];

  return (
    <>
      <Screen
        footer={
          pool.pledged ? (
            <>
              <Button label="Invite a neighbour" icon="share-variant" onPress={invite} />
              <Button label="Leave the pool" variant="secondary" onPress={async () => setPool(await api.leaveRateBlock())} />
            </>
          ) : undefined
        }
      >
        {pool.pledged && pool.pool ? (
          <View style={{ gap: space.m }}>
            <Hero
              label={`${provinceName(prov)} · ${quarter} ${year} renewals`}
              value={String(pool.pool.joined)}
              unit={`of ${pool.goal} joined`}
              caption="Every neighbour who joins makes the block bigger. No rate is shown until lenders bid on a full pool."
            />
            <Progress value={pool.pool.joined / pool.goal} />
          </View>
        ) : (
          <View style={{ gap: space.s }}>
            <Text accessibilityRole="header" style={[type.title, { color: c.text }]}>
              We get the rate for you. Not six banks.
            </Text>
            <Text style={[type.body, { color: c.textSecondary }]}>
              Renewals pooled by province and quarter, negotiated as one block once a pool reaches {pool.goal}. Whatever commission the lender pays Looni, we split half and half with you.
            </Text>
          </View>
        )}

        {!pool.pledged &&
          (renewal ? (
            <Section title="Your province">
              {PROVINCES.map(([code, name]) => (
                <Row key={code} title={name} onPress={() => join(code)} accessibilityLabel={`Join the ${name} pool`} />
              ))}
            </Section>
          ) : (
            <Section>
              <Row title="Set your renewal date first" subtitle="Pools are grouped by the quarter you renew in" onPress={() => router.back()} />
            </Section>
          ))}

        <Note>Coming 2027. Example only. Subject to mortgage brokerage licensing and provincial rules. Not an offer, not advice.</Note>
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </>
  );
}
