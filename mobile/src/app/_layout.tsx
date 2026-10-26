import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { darkTheme, lightTheme } from "../theme";

export default function RootLayout() {
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Hold the first frame until the fonts are in (a failed load falls back to the system font).
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.onBackground,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="consent" options={{ title: "Your data, your call" }} />
          <Stack.Screen name="connect" options={{ title: "Connect your bank" }} />
          <Stack.Screen name="import" options={{ title: "Scan a statement" }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="leak/[id]" options={{ title: "Evidence" }} />
          <Stack.Screen name="forecast" options={{ title: "Next 30 days" }} />
          <Stack.Screen name="year" options={{ title: "Your year receipt" }} />
          <Stack.Screen name="tools" options={{ title: "Calculators" }} />
          <Stack.Screen name="track/[id]" options={{ title: "Your track" }} />
          <Stack.Screen name="transactions" options={{ title: "Accounts & transactions" }} />
          <Stack.Screen name="bills" options={{ title: "Bills" }} />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
