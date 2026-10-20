import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import { useTheme } from "react-native-paper";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const TABS: { name: string; title: string; icon: IconName; header?: string }[] = [
  { name: "home", title: "Home", icon: "home-variant-outline" },
  { name: "receipt", title: "Receipt", icon: "receipt-text-outline", header: "Your Leak Receipt" },
  { name: "move", title: "Move", icon: "swap-horizontal", header: "Renew and switch" },
  { name: "loon", title: "Loon", icon: "egg-outline", header: "Your loon" },
  { name: "alerts", title: "Alerts", icon: "bell-outline", header: "Looni noticed" },
];

/** The app proper: Home, the Leak Receipt, renew-and-switch, the game, and alerts. */
export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outlineVariant },
        tabBarLabelStyle: { fontWeight: "700" },
        headerStyle: { backgroundColor: theme.colors.background },
        headerTintColor: theme.colors.onBackground,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            headerTitle: t.header ?? "Looni",
            headerShown: t.name !== "home",
            tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name={t.icon} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
