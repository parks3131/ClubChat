import { Stack, useRouter } from "expo-router";
import { makeBackHeaderLeft } from "../../../components/BackHeaderButton";
import { colors, typography } from "../../../constants/theme";

export default function ProfileStackLayout() {
  const router = useRouter();

  return (
    <Stack>
      {/* Same branded header as the other tab roots (Clubs/Calendar/
          Notifications) — shown only here, not on edit/privacy-policy/terms. */}
      <Stack.Screen
        name="index"
        options={{
          title: "Profile",
          headerStyle: { backgroundColor: colors.surfaceContainerLow },
          headerTitleStyle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.primary },
          headerTitleAlign: "left",
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="edit" options={{ title: "Edit profile", presentation: "modal" }} />
      <Stack.Screen
        name="privacy-policy"
        options={{ title: "Privacy Policy", headerLeft: makeBackHeaderLeft(router, "/profile") }}
      />
      <Stack.Screen name="terms" options={{ title: "Terms of Service", headerLeft: makeBackHeaderLeft(router, "/profile") }} />
    </Stack>
  );
}
