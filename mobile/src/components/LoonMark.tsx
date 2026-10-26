import { View } from "react-native";

const YELLOW = "#FFC82E";
const BELLY = "#FFE38A";
const WING = "#F0AE14";
const TAIL = "#9B8CF5";
const BEAK = "#FF8A1F";
const INK = "#14141A";

/**
 * The golden loon from the brand video, drawn with plain views (no image asset):
 * lavender tail, round yellow body and head, darker wing, orange beak, and a
 * ripple of water underneath. `water={false}` drops the ripple for small marks.
 */
export function LoonMark({ size = 72, water = true }: { size?: number; water?: boolean }) {
  const s = size / 120;
  const box = (x: number, y: number, w: number, h: number, color: string, extra: object = {}) => ({
    position: "absolute" as const,
    left: x * s,
    top: y * s,
    width: w * s,
    height: h * s,
    borderRadius: (Math.min(w, h) / 2) * s,
    backgroundColor: color,
    ...extra,
  });
  return (
    <View style={{ width: size, height: size * 0.78 }} accessible accessibilityRole="image" accessibilityLabel="Looni's loon">
      <View style={box(4, 26, 38, 16, TAIL, { transform: [{ rotate: "-28deg" }] })} />
      <View style={box(16, 34, 78, 42, YELLOW)} />
      <View style={box(34, 54, 52, 20, BELLY)} />
      <View style={box(30, 40, 40, 20, WING, { transform: [{ rotate: "-12deg" }] })} />
      <View style={box(64, 6, 38, 38, YELLOW)} />
      <View style={box(96, 24, 20, 10, BEAK, { transform: [{ rotate: "8deg" }] })} />
      <View style={box(82, 15, 11, 11, "#FFFFFF")} />
      <View style={box(86, 18, 6, 6, INK)} />
      {water && <View style={box(6, 84, 108, 4, "#B8A9E8")} />}
    </View>
  );
}
