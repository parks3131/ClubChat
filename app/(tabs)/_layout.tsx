import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors, typography } from "../../constants/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surfaceContainerLow },
        headerTitleStyle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.onSecondaryContainer,
        tabBarStyle: { backgroundColor: colors.surfaceContainerLow },
        tabBarLabelStyle: { ...typography.labelSm, textTransform: "uppercase" },
      }}
    >
      <Tabs.Screen
        name="clubs"
        options={{ title: "Clubs", tabBarIcon: ({ color, size }) => <MaterialIcons name="groups" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarIcon: ({ color, size }) => <MaterialIcons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
