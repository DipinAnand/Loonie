import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import { Snackbar } from "react-native-paper";
import { Hero, Progress, Row, Screen, Section } from "../../components/calm";
import { LoonMark } from "../../components/LoonMark";
import { api } from "../../lib/api";
import type { Badge, Home, Quest, Track } from "../../lib/types";
import { space } from "../../theme";

const LEVEL: Record<Home["level"], string> = { egg: "Egg", chick: "Chick", fledgling: "Fledgling", loon: "Loon" };

/** "Play it like a game": fix a leak, your loon grows. One minute a week. */
export default function Loon() {
  const [home, setHome] = useState<Home | null>(null);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    api.home().then(setHome).catch((e) => setToast((e as Error).message));
    api.quests().then((q) => setQuests(q.quests)).catch(() => {});
    api.tracks().then((r) => setTracks(r.tracks)).catch(() => {});
    api.badges().then((b) => setBadges(b.badges)).catch(() => {});
  }, []);
  useFocusEffect(load);

  async function complete(q: Quest) {
    try {
      await api.completeQuest(q.id);
      setToast(`+${q.reward} loonies`);
      load();
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  const unlocked = badges.filter((b) => b.unlockedAt);
  const open = quests.filter((q) => q.status === "available");
  const done = quests.filter((q) => q.status === "completed");

  return (
    <>
      <Screen safeTop title="Your loon">
        {home && (
          <View style={{ gap: space.l }}>
            <View style={{ alignItems: "center" }}>
              <LoonMark size={120} />
            </View>
            <Hero
              label={`Your loon is ${home.level === "egg" ? "an" : "a"} ${LEVEL[home.level]}`}
              value={String(home.loonies)}
              unit="loonies"
              caption={home.next ? `${home.next.at - home.loonies} more to become ${home.next.level === "egg" ? "an" : "a"} ${LEVEL[home.next.level]}. Fix a leak, your loon grows.` : "Fully grown. Keep the streak going."}
            />
            {home.next && <Progress value={home.loonies / home.next.at} />}
          </View>
        )}

        {home && (
          <Section title="This week">
            <Row
              title={home.hunt.remaining ? "Sort this week's leaks" : "This week's leaks are sorted"}
              subtitle={home.hunt.remaining ? `${home.hunt.remaining} of ${home.hunt.total} left · about a minute` : `${home.streaks.huntWeeks}-week streak`}
              onPress={home.hunt.remaining ? () => router.push("/receipt") : undefined}
            />
            {home.streaks.feeFreeDays !== null && (
              <Row title="Fee-free streak" value={`${home.streaks.feeFreeDays} ${home.streaks.feeFreeDays === 1 ? "day" : "days"}`} />
            )}
          </Section>
        )}

        {open.length > 0 && (
          <Section title="Quests">
            {open.map((q) => (
              <Row
                key={q.id}
                title={q.title}
                subtitle={q.progress ? `${q.description} · ${q.progress.current} of ${q.progress.target}` : q.description}
                value={`+${q.reward}`}
                valueTone="action"
                onPress={q.completion === "self" ? () => complete(q) : undefined}
                accessibilityLabel={`${q.title}. ${q.reward} loonies.${q.completion === "self" ? " Tap when you've done it." : ""}`}
              />
            ))}
            {done.length > 0 && <Row title={`${done.length} quest${done.length === 1 ? "" : "s"} done`} subtitle={done.map((q) => q.title).join(", ")} />}
          </Section>
        )}

        {tracks.length > 0 && (
          <Section title="Tracks">
            {tracks.map((t) => (
              <Row
                key={t.id}
                title={t.id === "newcomers" ? "New to Canada" : "Student"}
                subtitle={`${t.done} of ${t.total} done · ${t.level}`}
                onPress={() => router.push({ pathname: "/track/[id]", params: { id: t.id } })}
              />
            ))}
          </Section>
        )}

        {badges.length > 0 && (
          <Section title="Badges">
            {unlocked.map((b) => (
              <Row key={b.id} title={b.title} subtitle={b.description} />
            ))}
            <Row
              title={unlocked.length ? `${badges.length - unlocked.length} more to unlock` : `${badges.length} badges to unlock`}
              subtitle={badges.filter((b) => !b.unlockedAt).slice(0, 3).map((b) => b.title).join(", ")}
            />
          </Section>
        )}
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}
