import { Stack } from "expo-router";

export default function ClubProfileStackLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Club Profile" }} />
      <Stack.Screen name="edit" options={{ title: "Edit club", presentation: "modal" }} />
    </Stack>
  );
}
