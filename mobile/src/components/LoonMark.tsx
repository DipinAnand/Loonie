import { View } from "react-native";

/** The loon, drawn with plain views (no image asset needed): body, head, beak, red eye, white necklace. */
export function LoonMark({ size = 72 }: { size?: number }) {
  const s = size / 120;
  const ink = "#14141A";
  return (
    <View style={{ width: size, height: size * 0.75 }} accessible accessibilityLabel="Your loon">
      <View style={{ position: "absolute", left: 16 * s, top: 46 * s, width: 76 * s, height: 28 * s, borderRadius: 14 * s, backgroundColor: ink }} />
      <View style={{ position: "absolute", left: 76 * s, top: 30 * s, width: 14 * s, height: 26 * s, backgroundColor: ink, transform: [{ rotate: "12deg" }] }} />
      <View style={{ position: "absolute", left: 76 * s, top: 22 * s, width: 24 * s, height: 24 * s, borderRadius: 12 * s, backgroundColor: ink }} />
      <View style={{ position: "absolute", left: 98 * s, top: 31 * s, width: 18 * s, height: 6 * s, borderRadius: 3 * s, backgroundColor: ink }} />
      <View style={{ position: "absolute", left: 89 * s, top: 29 * s, width: 5 * s, height: 5 * s, borderRadius: 3 * s, backgroundColor: "#C2410C" }} />
      <View style={{ position: "absolute", left: 79 * s, top: 46 * s, width: 13 * s, height: 2 * s, backgroundColor: "#FFFFFF" }} />
      {[34, 44, 54, 39, 49, 59].map((x, i) => (
        <View key={i} style={{ position: "absolute", left: x * s, top: (i < 3 ? 52 : 60) * s, width: 4 * s, height: 4 * s, borderRadius: 2 * s, backgroundColor: "#FFFFFF" }} />
      ))}
      <View style={{ position: "absolute", left: 4 * s, top: 80 * s, width: 112 * s, height: 3 * s, borderRadius: 2 * s, backgroundColor: "#B8A9E8" }} />
    </View>
  );
}
