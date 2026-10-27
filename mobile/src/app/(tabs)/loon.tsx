import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Snackbar, Text, useTheme } from "react-native-paper";
import { LoonMark } from "../../components/LoonMark";
import { Bar, Figure, Overline, Panel, Pill, SectionTitle, tones } from "../../components/ui";
import { api } from "../../lib/api";
import type { Badge, Home, Quest, Track } from "../../lib/types";
import { font } from "../../theme";

const STAGES: { level: Home["level"]; label: string }[] = [
  { level: "egg", label: "Egg" },
  { level: "chick", label: "Chick" },
  { level: "fledgling", label: "Fledgling" },
  { level: "loon", label: "Loon" },
];

/** "Play it like a game": fix a leak, your loon grows. One minute a week. */
export default function Loon() {
  const theme = useTheme();
  const t = tones(theme.dark);
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

  const stageIndex = home ? STAGES.findIndex((s) => s.level === home.level) : 0;

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Panel tone="lavender" style={{ alignItems: "center" }}>
          <LoonMark size={120} />
          <Figure size={28} color={t.lavender.fg}>
            {home ? `${STAGES[stageIndex].label} · ${home.loonies} loonies` : " "}
          </Figure>
          <Text style={{ color: t.lavender.fg, fontFamily: font.bold }}>Fix a leak, your loon grows. One minute a week.</Text>
          <View style={styles.stages}>
            {STAGES.map((s, i) => (
              <View key={s.level} style={{ flex: 1, gap: 6, alignItems: "center" }}>
                <Bar value={i < stageIndex ? 1 : i === stageIndex ? (home?.next ? home.loonies / home.next.at : 1) : 0} track={theme.dark ? "#3B3375" : "#D8D0FA"} />
                <Text style={{ fontSize: 12, fontFamily: i === stageIndex ? font.heavy : font.semibold, color: i <= stageIndex ? t.lavender.fg : theme.colors.onSurfaceVariant }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </Panel>

        {home && (
          <Panel tone={home.hunt.remaining ? "yellow" : "green"}>
            <Overline color={home.hunt.remaining ? t.yellow.fg : t.green.fg}>THIS WEEK'S LEAK CHECK</Overline>
            <Text variant="titleMedium" style={{ fontFamily: font.heavy, color: home.hunt.remaining ? t.yellow.fg : t.green.fg }}>
              {home.hunt.remaining ? `${home.hunt.remaining} of ${home.hunt.total} leaks to sort` : "Done for the week"}
            </Text>
            <Text style={{ color: home.hunt.remaining ? t.yellow.fg : t.green.fg }}>
              {home.streaks.huntWeeks}-week streak{home.streaks.feeFreeDays !== null ? ` · ${home.streaks.feeFreeDays} day${home.streaks.feeFreeDays === 1 ? "" : "s"} fee-free` : ""}
            </Text>
            {home.hunt.remaining > 0 && (
              <Button mode="contained" onPress={() => router.push("/receipt")} buttonColor={t.ink.bg} textColor={t.ink.fg}>
                Sort them
              </Button>
            )}
          </Panel>
        )}

        <SectionTitle>Quests</SectionTitle>
        {quests.map((q) => (
          <Panel key={q.id} tone={q.status === "completed" ? "green" : "plain"}>
            <View style={styles.row}>
              <Text variant="titleMedium" style={{ fontFamily: font.bold, flex: 1, color: q.status === "completed" ? t.green.fg : theme.colors.onSurface }}>
                {q.title}
              </Text>
              <Pill label={q.status === "completed" ? "Done" : `+${q.reward}`} tone={q.status === "completed" ? "green" : "yellow"} />
            </View>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{q.description}</Text>
            {q.progress && <Bar value={q.progress.current / q.progress.target} />}
            {q.status === "available" && q.completion === "self" && (
              <Button mode="outlined" style={{ alignSelf: "flex-start" }} onPress={() => complete(q)}>
                I did it
              </Button>
            )}
          </Panel>
        ))}

        <SectionTitle>Tracks</SectionTitle>
        {tracks.map((tr) => (
          <Panel key={tr.id} onPress={() => router.push({ pathname: "/track/[id]", params: { id: tr.id } })}>
            <Overline>{tr.id === "newcomers" ? "NEWCOMER TRACK" : "STUDENT TRACK"}</Overline>
            <Text variant="titleMedium" style={{ fontFamily: font.heavy }}>
              {tr.title}
            </Text>
            <Bar value={tr.done / tr.total} />
            <Text style={{ color: theme.colors.primary, fontFamily: font.bold }}>
              {tr.done} of {tr.total} · {tr.level} · {tr.done === tr.total ? "complete" : "start the track →"}
            </Text>
          </Panel>
        ))}

        <SectionTitle>Badges</SectionTitle>
        <View style={styles.badges}>
          {badges.map((b) => (
            <View key={b.id} style={[styles.badge, { backgroundColor: b.unlockedAt ? t.yellow.bg : theme.colors.surfaceVariant, opacity: b.unlockedAt ? 1 : 0.6 }]} accessibilityLabel={`${b.title}${b.unlockedAt ? ", unlocked" : ", locked"}`}>
              <Text style={{ fontFamily: font.heavy, color: b.unlockedAt ? t.yellow.fg : theme.colors.onSurfaceVariant, textAlign: "center" }}>{b.title}</Text>
              <Text variant="bodySmall" style={{ color: b.unlockedAt ? t.yellow.fg : theme.colors.onSurfaceVariant, textAlign: "center" }}>
                {b.description}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 14, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  stages: { flexDirection: "row", gap: 6, alignSelf: "stretch", marginTop: 8 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  badge: { width: "47%", borderRadius: 20, padding: 14, gap: 4 },
});
