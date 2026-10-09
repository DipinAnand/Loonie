import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from "react-native-paper";

// Looni palette from the blueprint: indigo (engine), gold (the IP), green (done / money saved).
export const brand = {
  indigo: "#5B4FD6",
  gold: "#B08A1E",
  green: "#1F9D6A",
  ink: "#1E1B2E",
  leak: "#D64545",
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  roundness: 4,
  colors: {
    ...MD3LightTheme.colors,
    primary: brand.indigo,
    onPrimary: "#FFFFFF",
    primaryContainer: "#E6E2FF",
    onPrimaryContainer: "#1C1260",
    secondary: brand.gold,
    secondaryContainer: "#FBF0CF",
    onSecondaryContainer: "#3D2E00",
    tertiary: brand.green,
    tertiaryContainer: "#D3F5E6",
    onTertiaryContainer: "#00391F",
    error: brand.leak,
    background: "#FBFAFF",
    surface: "#FFFFFF",
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  roundness: 4,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#C3BCFF",
    onPrimary: "#2A1F86",
    primaryContainer: "#41369F",
    onPrimaryContainer: "#E6E2FF",
    secondary: "#E9C45B",
    secondaryContainer: "#5A4500",
    onSecondaryContainer: "#FBF0CF",
    tertiary: "#7EDCB2",
    tertiaryContainer: "#00522F",
    onTertiaryContainer: "#D3F5E6",
    error: "#FF8A80",
    background: "#13111C",
    surface: "#1C1A27",
  },
};
