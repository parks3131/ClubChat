import { Stack } from "expo-router";
import { colors, typography } from "../../../constants/theme";

export default function ClubsStackLayout() {
  return (
    <Stack>
      {/* The only screen in the app with the top-level "ClubChat" brand
          header — every other screen (other tab roots, chat, club hub,
          etc.) is headerShown: false at this level, per explicit founder
          scoping: this bar should read as a one-time app masthead on the
          Clubs landing screen, not a per-tab fixture. */}
      <Stack.Screen
        name="index"
        options={{
          title: "ClubChat",
          headerStyle: { backgroundColor: colors.surfaceContainerLow },
          headerTitleStyle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
          headerTitleAlign: "left",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="create" options={{ title: "Create club", presentation: "modal" }} />
      <Stack.Screen name="join" options={{ title: "Join club", presentation: "modal" }} />
      <Stack.Screen name="[clubId]" options={{ headerShown: false }} />
    </Stack>
  );
}
