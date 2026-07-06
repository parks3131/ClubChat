import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useLayoutEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useClub } from "./_layout";

const SECTIONS: { key: "chat" | "calendar" | "routines" | "races"; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "calendar", label: "Calendar" },
  { key: "routines", label: "Routines" },
  { key: "races", label: "Races & Meets" },
];

// Admin-only row — regular members never see it exists at all, per the
// founder's wireframe for Eboard & Council (SPEC.md task #17).
const ADMIN_SECTIONS: { key: "eboard"; label: string }[] = [{ key: "eboard", label: "Eboard & Council" }];

export default function ClubHubScreen() {
  const club = useClub();
  const router = useRouter();
  const navigation = useNavigation();
  // Reached from Profile's "Your clubs" list, a different top-level tab —
  // that cross-tab push doesn't leave real back-history to /profile (see
  // SPEC.md section 6), so the origin is passed explicitly and this screen
  // overrides its own back button rather than relying on canGoBack().
  const { from } = useLocalSearchParams<{ from?: string }>();

  useLayoutEffect(() => {
    if (from !== "profile") return;
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            // Switching tabs alone leaves this hub (still tagged
            // ?from=profile) sitting at the top of the Clubs tab's own
            // Stack — React Navigation doesn't reset a tab's internal
            // history just because a different tab became active. Left
            // alone, later tapping the Clubs tab returns to this exact
            // screen instead of the Main list, and its back button keeps
            // firing this same override, bouncing back to Profile forever
            // (a real loop, caught live via Playwright). Resetting this
            // stack to its root first — before switching tabs — means
            // the Clubs tab is back to its own Main list underneath, so
            // there's nothing stale left for the tab bar to return to.
            router.replace("/clubs");
            router.replace("/profile");
          }}
          style={{ marginLeft: 12, padding: 4 }}
        >
          <Text style={{ fontSize: 24, color: "#2563eb" }}>‹</Text>
        </TouchableOpacity>
      ),
    });
  }, [from, navigation, router]);

  return (
    <View style={styles.container}>
      {SECTIONS.map((section) => (
        <TouchableOpacity
          key={section.key}
          style={styles.row}
          onPress={() => router.push(`/clubs/${club.clubId}/${section.key}`)}
        >
          <Text style={styles.rowLabel}>{section.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
      {club.role === "admin" &&
        ADMIN_SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.row}
            onPress={() => router.push(`/clubs/${club.clubId}/${section.key}`)}
          >
            <Text style={styles.rowLabel}>{section.label}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowLabel: { fontSize: 17, fontWeight: "600", color: "#0f172a" },
  chevron: { fontSize: 20, color: "#94a3b8" },
});
