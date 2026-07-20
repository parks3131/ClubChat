import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useLayoutEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography, type MaterialIconName } from "../../../../constants/theme";
import { useClub } from "./_layout";

const SECTIONS: {
  key: "chat" | "calendar" | "routines" | "polls" | "races";
  label: string;
  subtitle: string;
  icon: MaterialIconName;
  tint: string;
}[] = [
  { key: "chat", label: "Chat", subtitle: "Jump into the conversation", icon: "forum", tint: colors.primary },
  { key: "calendar", label: "Calendar", subtitle: "Races, practices & events", icon: "calendar-month", tint: colors.secondary },
  { key: "routines", label: "Routines", subtitle: "This week's training plan", icon: "fitness-center", tint: colors.tertiary },
  { key: "polls", label: "Polls", subtitle: "Vote on what's next", icon: "how-to-vote", tint: colors.secondary },
  { key: "races", label: "Races & Meets", subtitle: "Upcoming races & meets", icon: "emoji-events", tint: colors.primaryContainer },
];

// Admin-only row — regular members never see it exists at all, per the
// founder's wireframe for Eboard & Council (SPEC.md task #17).
const ADMIN_SECTIONS: { key: "eboard"; label: string; subtitle: string; icon: MaterialIconName }[] = [
  { key: "eboard", label: "Eboard & Council", subtitle: "Admin-only space", icon: "shield" },
];

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
          <MaterialIcons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [from, navigation, router]);

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.clubName}>{club.name.toUpperCase()}</Text>
      </View>

      <View style={styles.grid}>
        {SECTIONS.map((section) => (
          <TouchableOpacity
            key={section.key}
            style={styles.card}
            onPress={() => router.push(`/clubs/${club.clubId}/${section.key}`)}
          >
            <View style={[styles.iconBadge, { backgroundColor: section.tint }]}>
              <MaterialIcons name={section.icon} size={22} color={colors.onPrimary} />
            </View>
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardLabel}>{section.label.toUpperCase()}</Text>
              <Text style={styles.cardSubtitle}>{section.subtitle}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
        {club.isAdmin &&
          ADMIN_SECTIONS.map((section) => (
            <TouchableOpacity
              key={section.key}
              style={[styles.card, styles.adminCard]}
              onPress={() => router.push(`/clubs/${club.clubId}/${section.key}`)}
            >
              <View style={[styles.iconBadge, { backgroundColor: colors.inverseSurface }]}>
                <MaterialIcons name={section.icon} size={22} color={colors.onPrimary} />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={[styles.cardLabel, styles.adminCardLabel]}>{section.label.toUpperCase()}</Text>
                <Text style={[styles.cardSubtitle, styles.adminCardSubtitle]}>{section.subtitle}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.surfaceVariant} />
            </TouchableOpacity>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  clubName: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  grid: { gap: spacing.stackSm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  adminCard: { backgroundColor: colors.inverseSurface, borderColor: colors.inverseSurface },
  iconBadge: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  cardTextWrap: { flex: 1 },
  cardLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  cardSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  adminCardLabel: { color: colors.inverseOnSurface },
  adminCardSubtitle: { color: colors.surfaceVariant },
});
