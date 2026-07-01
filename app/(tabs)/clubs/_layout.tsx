import { Stack } from "expo-router";

export default function ClubsStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Clubs" }} />
      <Stack.Screen name="create" options={{ title: "Create club", presentation: "modal" }} />
      <Stack.Screen name="join" options={{ title: "Join club", presentation: "modal" }} />
      <Stack.Screen name="[clubId]" options={{ headerShown: false }} />
    </Stack>
  );
}
