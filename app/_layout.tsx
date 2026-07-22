import { Anton_400Regular, useFonts as useAnton } from "@expo-google-fonts/anton";
import {
  ArchivoNarrow_400Regular,
  ArchivoNarrow_700Bold,
  useFonts as useArchivoNarrow,
} from "@expo-google-fonts/archivo-narrow";
import { Inter_400Regular, Inter_600SemiBold, useFonts as useInter } from "@expo-google-fonts/inter";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "../constants/theme";
import { AuthProvider, useAuth } from "../contexts/AuthProvider";
import { CurrentClubProvider } from "../contexts/CurrentClubProvider";
import { NotificationsProvider } from "../contexts/NotificationsProvider";

function RootNavigator() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (session && !inTabsGroup) {
      router.replace("/(tabs)/clubs");
    }
  }, [session, initializing, segments, router]);

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [antonLoaded] = useAnton({ Anton_400Regular });
  const [archivoLoaded] = useArchivoNarrow({ ArchivoNarrow_400Regular, ArchivoNarrow_700Bold });
  const [interLoaded] = useInter({ Inter_400Regular, Inter_600SemiBold });
  const fontsLoaded = antonLoaded && archivoLoaded && interLoaded;

  // Gate the whole tree on fonts the same way auth's `initializing` gates
  // navigation — every restyled screen assumes these families are already
  // registered, so rendering before they're ready would flash system fonts.
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AuthProvider>
        <NotificationsProvider>
          <CurrentClubProvider>
            <RootNavigator />
          </CurrentClubProvider>
        </NotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
