import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Checkbox, Snackbar, Text, useTheme } from "react-native-paper";
import { Bar, Overline, Panel, Pill } from "../../components/ui";
import { api } from "../../lib/api";
import type { Track } from "../../lib/types";

/** Newcomer or student track: twelve tasks, one a week, in the order that works. */
export default function TrackScreen() {
  const theme = useTheme();
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
    navigation.setOptions({ title: id === "students" ? "Student track" : "Newcomer track" });
  }, [navigation, id]);

  async function toggle(taskId: string, done: boolean) {
    try {
      const next = await api.setTrackTask(id, taskId, done);
      if (track && next.index > track.index) setToast(`Level up: ${next.level}`);
      setTrack(next);
    } catch (e) {
      setToast((e as Error).message);
    }
  }

  if (!track) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text variant="headlineSmall" style={{ fontWeight: "800" }}>
          {track.title}
        </Text>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>{track.subtitle}</Text>
        <Panel tone="lavender">
          <View style={styles.row}>
            <Overline>
              WEEK {Math.min(track.done + 1, track.total)} OF {track.total}
            </Overline>
            <Pill label={track.level} />
          </View>
          <Bar value={track.done / track.total} />
          <Text style={{ fontSize: 12, color: theme.colors.onSurfaceVariant }}>{track.levels.join(" → ")}</Text>
        </Panel>
        {track.tasks.map((task) => (
          <Panel key={task.id} tone={task.done ? "green" : task.id === track.next ? "yellow" : "plain"} onPress={task.auto ? undefined : () => toggle(task.id, !task.done)}>
            <View style={styles.task}>
              <Checkbox.Android status={task.done ? "checked" : "unchecked"} disabled={task.auto} onPress={() => toggle(task.id, !task.done)} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontWeight: "800" }}>
                  Week {task.week}. {task.title}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {task.why}
                </Text>
                {task.auto && !task.done && (
                  <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: "700" }} onPress={() => router.push(task.id === "first_scan" ? "/import" : "/receipt")}>
                    Looni ticks this when you do it →
                  </Text>
                )}
              </View>
            </View>
          </Panel>
        ))}
      </ScrollView>
      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 12, paddingBottom: 40 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  task: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
});
