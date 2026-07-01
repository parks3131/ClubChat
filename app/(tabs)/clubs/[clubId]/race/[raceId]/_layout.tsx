import { Tabs } from "expo-router";

export default function RaceTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="chat" options={{ title: "Chat" }} />
      <Tabs.Screen name="workout" options={{ title: "Workout" }} />
      <Tabs.Screen name="carpool" options={{ title: "Carpool" }} />
      <Tabs.Screen name="info" options={{ title: "Info" }} />
    </Tabs>
  );
}
