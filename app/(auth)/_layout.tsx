import { Stack, useRouter } from "expo-router";
import { makeBackHeaderLeft } from "../../components/BackHeaderButton";

export default function AuthLayout() {
  const router = useRouter();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen
        name="privacy-policy"
        options={{ headerShown: true, title: "Privacy Policy", headerLeft: makeBackHeaderLeft(router, "/(auth)/sign-up") }}
      />
      <Stack.Screen
        name="terms"
        options={{ headerShown: true, title: "Terms of Service", headerLeft: makeBackHeaderLeft(router, "/(auth)/sign-up") }}
      />
    </Stack>
  );
}
