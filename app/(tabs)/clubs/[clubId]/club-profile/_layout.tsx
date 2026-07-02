import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { makeBackHeaderLeft } from "../../../../../components/BackHeaderButton";

export default function ClubProfileStackLayout() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const router = useRouter();

  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{ title: "Club Profile", headerLeft: makeBackHeaderLeft(router, `/clubs/${clubId}`) }}
      />
      <Stack.Screen name="edit" options={{ title: "Edit club", presentation: "modal" }} />
    </Stack>
  );
}
