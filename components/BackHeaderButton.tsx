import type { useRouter } from "expo-router";
import { Text, TouchableOpacity } from "react-native";

type Router = ReturnType<typeof useRouter>;

// A plain Stack.Screen's native back button only renders when there's real
// navigation history to pop — direct navigation or a page refresh leaves no
// way back at all otherwise (see SPEC.md section 6). This falls back to a
// known-good route instead of relying purely on canGoBack().
export function makeBackHeaderLeft(router: Router, fallback: string) {
  return () => (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace(fallback);
      }}
      style={{ marginLeft: 12, padding: 4 }}
    >
      <Text style={{ fontSize: 24, color: "#2563eb" }}>‹</Text>
    </TouchableOpacity>
  );
}
