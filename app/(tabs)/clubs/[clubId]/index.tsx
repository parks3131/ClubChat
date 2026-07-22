import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../../../constants/theme";
import { toDateKey } from "../../../../lib/dates";
import { fetchRaces, type RaceListItem } from "../../../../lib/races";
import { useClub } from "./_layout";

// event_date is a plain "YYYY-MM-DD" string — format from its own y/m/d
// components rather than `new Date(iso)`, which parses as UTC midnight and
// can display a day early in timezones behind UTC (see races/index.tsx and
// SPEC.md section 6's formatDateOfBirth note for the same bug elsewhere).
function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Restructured club home (founder wireframe, task after #47): Chat and
// Races & Meets surface directly here instead of a flat row-per-feature
// list. Routines/Polls/Eboard & Council are deliberately not linked from
// here anymore — still fully intact at their existing routes/RLS, just
// pending a decision on where they land next, per explicit founder call
// to leave them unreachable via nav rather than add a stopgap "More" menu.
export default function ClubHubScreen() {
  const club = useClub();
  const router = useRouter();
  const navigation = useNavigation();
  // Reached from Profile's "Your clubs" list, a different top-level tab —
  // that cross-tab push doesn't leave real back-history to /profile (see
  // SPEC.md section 6), so the origin is passed explicitly and this screen
  // overrides its own back button rather than relying on canGoBack().
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [upcomingRaces, setUpcomingRaces] = useState<RaceListItem[]>([]);

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

  // Reached via the Clubs tab's own shortcut ((tabs)/_layout.tsx): tapping
  // Clubs while already inside a club jumps straight here instead of
  // resetting to the Main list. That's a `router.replace`, not a normal
  // push, so `router.canGoBack()` can still read true (whatever was on
  // the Clubs tab's stack before the replace) even though there's no real
  // "came from here" screen this session — same class of gotcha as the
  // ?from=profile override above, so this unconditionally overrides
  // rather than trusting canGoBack() the way the Stack.Screen's own
  // default headerLeft (makeBackHeaderLeft) does.
  useLayoutEffect(() => {
    if (from !== "clubsTab") return;
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={() => router.replace("/clubs")} style={{ marginLeft: 12, padding: 4 }}>
          <MaterialIcons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [from, navigation, router]);

  // Refetched on focus (not just mount) so returning from creating/joining
  // a race updates this preview, mirroring races/index.tsx's own useFocusEffect.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      fetchRaces(club.clubId, club.isAdmin)
        .then((races) => {
          if (cancelled) return;
          const todayKey = toDateKey(new Date());
          setUpcomingRaces(races.filter((r) => r.eventDate >= todayKey).slice(0, 2));
        })
        .catch(() => {
          if (!cancelled) setUpcomingRaces([]);
        });
      return () => {
        cancelled = true;
      };
    }, [club.clubId, club.isAdmin])
  );

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Text style={styles.clubName}>{club.name.toUpperCase()}</Text>
      </View>

      <View style={styles.grid}>
        <TouchableOpacity style={styles.card} onPress={() => router.push(`/clubs/${club.clubId}/news`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="auto-awesome" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardLabel}>NEWS & HIGHLIGHTS</Text>
            <Text style={styles.cardSubtitle}>Club updates & photos</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.card} onPress={() => router.push(`/clubs/${club.clubId}/chat`)}>
          <View style={[styles.iconBadge, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="forum" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardLabel}>CLUB MAIN CHAT</Text>
            <Text style={styles.cardSubtitle}>Jump into the conversation</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        <View style={styles.racesSection}>
          <View style={styles.racesSectionHeaderRow}>
            <Text style={styles.sectionHeader}>RACES AND MEETS</Text>
            <TouchableOpacity onPress={() => router.push(`/clubs/${club.clubId}/races`)}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {upcomingRaces.length === 0 ? (
            <Text style={styles.emptyRaces}>No upcoming races yet.</Text>
          ) : (
            upcomingRaces.map((race) => (
              <TouchableOpacity
                key={race.id}
                style={styles.raceRow}
                onPress={() =>
                  router.push(
                    race.access !== "none"
                      ? `/clubs/${club.clubId}/race/${race.id}`
                      : `/clubs/${club.clubId}/races/${race.id}`
                  )
                }
              >
                <Text style={styles.raceName} numberOfLines={1}>
                  {race.name}
                </Text>
                <Text style={styles.raceDate}>{formatEventDate(race.eventDate)}</Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface, padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  clubName: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  grid: { gap: spacing.stackSm },
  racesSection: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  racesSectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionHeader: { ...typography.headlineLgMobile, fontSize: 15, color: colors.onSurface },
  seeAll: { ...typography.labelSm, fontSize: 12, color: colors.primary, textTransform: "uppercase" },
  emptyRaces: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: spacing.stackSm },
  raceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    marginTop: spacing.stackSm,
    paddingTop: spacing.stackSm,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  raceName: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface, flex: 1 },
  raceDate: { ...typography.labelSm, fontSize: 12, color: colors.secondary },
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
  iconBadge: { width: 44, height: 44, borderRadius: radii.md, alignItems: "center", justifyContent: "center" },
  cardTextWrap: { flex: 1 },
  cardLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  cardSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
});
