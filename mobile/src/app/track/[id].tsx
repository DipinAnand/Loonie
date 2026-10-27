import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Snackbar, Text } from "react-native-paper";
import { Centered, Hero, Progress, Row, Screen, Section, useCalm } from "../../components/calm";
import { api } from "../../lib/api";
import type { Track, TrackTask } from "../../lib/types";
import { radius, space } from "../../theme";

/** Newcomer or student track: twelve tasks, one a week, in the order that works. */
export default function TrackScreen() {
  const c = useCalm();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: Track["id"] }>();
  const [track, setTrack] = useState<Track | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api
      .tracks()
      .then((r) => setTrack(r.tracks.find((t) => t.id === id) ?? null))
      .catch((e) => setToast((e as Error).message));
  }, [id]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: id === "students" ? "Student track" : "New to Canada" });
  }, [navigation, id]);

  async function toggle(task: TrackTask) {
    if (task.auto) {
      router.push(task.id === "first_scan" ? "/import" : "/receipt");
      return;
    }
    try {
      const next = await api.setTrackTask(id, task.id, !task.done);
      if (track && next.index > track.index) setToast(`Level up: ${next.level}`);
      setTrack(next);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  if (!track) return <Centered />;

  const todo = track.tasks.filter((t) => !t.done);
  const done = track.tasks.filter((t) => t.done);
  const check = (t: TrackTask) => (
    <Pressable
      onPress={() => toggle(t)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: t.done, disabled: t.auto }}
      accessibilityLabel={t.title}
      hitSlop={10}
      style={[styles.check, t.done ? { backgroundColor: c.saved, borderColor: c.saved } : { borderColor: c.textTertiary }]}
    >
      {t.done && <Text style={{ color: "#FFFFFF", fontSize: 14, lineHeight: 16 }}>✓</Text>}
    </Pressable>
  );

  return (
    <>
      <Screen>
        <View style={{ gap: space.m }}>
          <Hero label={track.title} value={`${track.done} of ${track.total}`} caption={`You're a ${track.level}. ${track.subtitle}`} />
          <Progress value={track.done / track.total} tone="saved" />
        </View>
        {todo.length > 0 && (
          <Section title="Next up">
            {todo.map((t) => (
              <Row key={t.id} title={`Week ${t.week}. ${t.title}`} subtitle={t.auto ? `${t.why} Looni ticks this when you do it.` : t.why} right={check(t)} />
            ))}
          </Section>
        )}
        {done.length > 0 && (
          <Section title="Done">
            {done.map((t) => (
              <Row key={t.id} title={`Week ${t.week}. ${t.title}`} subtitleTone="saved" subtitle="Done" right={check(t)} />
            ))}
          </Section>
        )}
      </Screen>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  check: { width: 26, height: 26, borderRadius: radius.s - 1, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
