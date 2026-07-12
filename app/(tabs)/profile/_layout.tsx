import { Stack, useRouter } from "expo-router";
import { makeBackHeaderLeft } from "../../../components/BackHeaderButton";

export default function ProfileStackLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Profile", headerLeft: makeBackHeaderLeft(router, "/clubs") }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile", presentation: "modal" }} />
      <Stack.Screen
        name="privacy-policy"
        options={{ title: "Privacy Policy", headerLeft: makeBackHeaderLeft(router, "/profile") }}
      />
      <Stack.Screen name="terms" options={{ title: "Terms of Service", headerLeft: makeBackHeaderLeft(router, "/profile") }} />
    </Stack>
  );
}
