import { Stack, useRouter } from "expo-router";
import { makeBackHeaderLeft } from "../../../components/BackHeaderButton";

export default function ProfileStackLayout() {
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Profile", headerLeft: makeBackHeaderLeft(router, "/clubs") }} />
      <Stack.Screen name="edit" options={{ title: "Edit profile", presentation: "modal" }} />
    </Stack>
  );
}
