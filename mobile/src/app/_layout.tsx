import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { darkTheme, lightTheme } from "../theme";

export default function RootLayout() {
  const theme = useColorScheme() === "dark" ? darkTheme : lightTheme;
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
          <Stack.Screen name="receipt" options={{ title: "Your Leak Receipt", headerBackVisible: false }} />
          <Stack.Screen name="transactions" options={{ title: "Accounts & transactions" }} />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
