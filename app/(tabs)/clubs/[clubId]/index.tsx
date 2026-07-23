import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useLayoutEffect, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../../../../constants/theme";
import { useAuth } from "../../../../contexts/AuthProvider";
import { toDateKey } from "../../../../lib/dates";
import { fetchRaces, setRacePinned, type RaceListItem } from "../../../../lib/races";
import { useClub } from "./_layout";

const RACES_PREVIEW_LIMIT = 5;

// Shared by the hub's own preview rows and the "See all" search popup below
// — same avatar-or-initial treatment the race/Eboard/club headers already
// use elsewhere in the app (round photo if set, a round letter fallback
// otherwise), replacing the old generic flag-icon badge every race row used
// to share regardless of whether the race had its own photo. The trailing
// chevron was replaced with a ⋮ menu — every member gets one (pinning is
// personal curation of your own preview, not an admin setting, so there's
// no permission to gate on); the row itself still navigates on press, the
// ⋮ stops that and opens the Pin/Unpin popup instead. A pin icon sits
// right before the ⋮ once pinned.
function RaceRow({ race, onPress, onOpenMenu }: { race: RaceListItem; onPress: () => void; onOpenMenu: () => void }) {
  return (
    <TouchableOpacity style={styles.raceRow} onPress={onPress}>
      {race.avatarUrl ? (
        <Image source={{ uri: race.avatarUrl }} style={styles.raceAvatarImage} />
      ) : (
        <View style={styles.raceAvatarFallback}>
          <Text style={styles.raceAvatarInitial}>{race.name.charAt(0).toUpperCase() || "?"}</Text>
        </View>
      )}
      <Text style={styles.raceName} numberOfLines={1}>
        {race.name}
      </Text>
      {race.pinned && <MaterialIcons name="push-pin" size={16} color={colors.primary} />}
      <TouchableOpacity
        hitSlop={8}
        onPress={(e) => {
          e.stopPropagation?.();
          onOpenMenu();
        }}
      >
        <MaterialIcons name="more-vert" size={20} color={colors.onSurfaceVariant} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// Restructured club home (founder wireframe, task after #47): Chat and
// Races & Meets surface directly here instead of a flat row-per-feature
// list. Routines/Polls are deliberately not linked from here anymore —
// still fully intact at their existing routes/RLS, just pending a decision
// on where they land next, per explicit founder call to leave them
// unreachable via nav rather than add a stopgap "More" menu. Eboard &
// Council was added back to the hub in a later founder follow-up (every
// club now gets one automatically at creation, see 0072) — admin-only,
// same gate eboard/_layout.tsx already enforces, positioned below Club
// Main Chat and above Races & Meets per that same request.
export default function ClubHubScreen() {
  const club = useClub();
  const router = useRouter();
  const navigation = useNavigation();
  const { session } = useAuth();
  // Reached from Profile's "Your clubs" list, a different top-level tab —
  // that cross-tab push doesn't leave real back-history to /profile (see
  // SPEC.md section 6), so the origin is passed explicitly and this screen
  // overrides its own back button rather than relying on canGoBack().
  const { from } = useLocalSearchParams<{ from?: string }>();
  // Every race the club has, not just upcoming — the hub's own preview
  // still filters/slices this down to the next few, but the "See all"
  // search popup below searches across all of them (matching races/
  // index.tsx's own Upcoming/Finished scope).
  const [races, setRaces] = useState<RaceListItem[]>([]);
  const [seeAllOpen, setSeeAllOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pinMenuRace, setPinMenuRace] = useState<RaceListItem | null>(null);
  const [togglingPin, setTogglingPin] = useState(false);

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
            // `dismissTo`, not `replace`: replace only swaps the current
            // top-of-stack entry in place, so a stack like [index, hub]
            // becomes [index, index] (still depth 2) instead of truly
            // resetting to depth 1 — leaving a spurious back button on
            // the Main list itself.
            router.dismissTo("/clubs");
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
        <TouchableOpacity onPress={() => router.dismissTo("/clubs")} style={{ marginLeft: 12, padding: 4 }}>
          <MaterialIcons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [from, navigation, router]);

  // Refetched on focus (not just mount) so returning from creating/joining
  // a race updates this preview, mirroring races/index.tsx's own useFocusEffect.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      fetchRaces(club.clubId, session.user.id, club.isAdmin)
        .then((fetched) => {
          if (!cancelled) setRaces(fetched);
        })
        .catch(() => {
          if (!cancelled) setRaces([]);
        });
      return () => {
        cancelled = true;
      };
    }, [club.clubId, club.isAdmin, session])
  );

  const todayKey = toDateKey(new Date());
  const upcomingRaces = races.filter((r) => r.eventDate >= todayKey).slice(0, RACES_PREVIEW_LIMIT);
  const searchQuery = search.trim().toLowerCase();
  const filteredRaces = searchQuery ? races.filter((r) => r.name.toLowerCase().includes(searchQuery)) : races;

  const closeSeeAll = () => {
    setSeeAllOpen(false);
    setSearch("");
  };

  const goToRace = (race: RaceListItem) => {
    closeSeeAll();
    router.push(race.access !== "none" ? `/clubs/${club.clubId}/race/${race.id}` : `/clubs/${club.clubId}/races/${race.id}`);
  };

  const handleTogglePin = async () => {
    if (!pinMenuRace || !session) return;
    setTogglingPin(true);
    try {
      const nextPinned = !pinMenuRace.pinned;
      await setRacePinned(pinMenuRace.id, session.user.id, nextPinned);
      setRaces((prev) => prev.map((r) => (r.id === pinMenuRace.id ? { ...r, pinned: nextPinned } : r)));
      setPinMenuRace(null);
    } finally {
      setTogglingPin(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.identity}>
        <Text style={styles.clubName}>{club.name.toUpperCase()}</Text>
      </View>

      {/* One continuous panel — every row is flat (a divider, not its own
          bordered box) and every icon is a circular avatar, matching a
          chat app's own group-list feel (founder reference) rather than
          this app's usual stack of separately-bordered cards. */}
      <View style={styles.panel}>
        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${club.clubId}/news`)}>
          <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
            <MaterialIcons name="auto-awesome" size={20} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>NEWS & HIGHLIGHTS</Text>
            <Text style={styles.rowSubtitle}>Club updates & photos</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${club.clubId}/chat`)}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <MaterialIcons name="forum" size={20} color={colors.onPrimary} />
          </View>
          <View style={styles.rowTextWrap}>
            <Text style={styles.rowLabel}>CLUB MAIN CHAT</Text>
            <Text style={styles.rowSubtitle}>Jump into the conversation</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </TouchableOpacity>

        {club.isAdmin && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/clubs/${club.clubId}/eboard`)}>
              <View style={[styles.avatar, { backgroundColor: colors.tertiary }]}>
                <MaterialIcons name="shield" size={20} color={colors.onPrimary} />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowLabel}>EBOARD & COUNCIL</Text>
                <Text style={styles.rowSubtitle}>Private space for admins</Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider} />

        <View style={styles.racesSectionHeaderRow}>
          <Text style={styles.sectionHeader}>RACES AND MEETS</Text>
          <TouchableOpacity onPress={() => setSeeAllOpen(true)}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {upcomingRaces.length === 0 ? (
          <Text style={styles.emptyRaces}>No upcoming races yet.</Text>
        ) : (
          upcomingRaces.map((race, i) => (
            <View key={race.id}>
              {i > 0 && <View style={styles.divider} />}
              <RaceRow race={race} onPress={() => goToRace(race)} onOpenMenu={() => setPinMenuRace(race)} />
            </View>
          ))
        )}
      </View>

      {club.isAdmin && (
        <TouchableOpacity style={styles.addGroupButton} onPress={() => router.push(`/clubs/${club.clubId}/races/create`)}>
          <MaterialIcons name="add" size={20} color={colors.onPrimary} />
          <Text style={styles.addGroupButtonLabel}>Add Group</Text>
        </TouchableOpacity>
      )}
      </ScrollView>

      {/* "See all" popup — a search box over every race the club has,
          rather than navigating to a whole new screen for what's usually
          just "find the one race I'm looking for." */}
      <Modal visible={seeAllOpen} transparent animationType="fade" onRequestClose={closeSeeAll}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeSeeAll}>
          <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Races & Meets</Text>
              <TouchableOpacity onPress={closeSeeAll} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={18} color={colors.onSurfaceVariant} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search races"
                placeholderTextColor={colors.onSurfaceVariant}
                value={search}
                onChangeText={setSearch}
                autoFocus
              />
            </View>
            <ScrollView style={styles.modalList}>
              {filteredRaces.length === 0 ? (
                <Text style={styles.emptyRaces}>No races found.</Text>
              ) : (
                filteredRaces.map((race, i) => (
                  <View key={race.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <RaceRow race={race} onPress={() => goToRace(race)} onOpenMenu={() => setPinMenuRace(race)} />
                  </View>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* The ⋮ popup — currently just Pin/Unpin, mirroring ChatScreen's
          own small centered "actions" card. */}
      <Modal visible={pinMenuRace !== null} transparent animationType="fade" onRequestClose={() => setPinMenuRace(null)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPinMenuRace(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.pinMenuCard} onPress={(e) => e.stopPropagation?.()}>
            <TouchableOpacity style={styles.pinMenuItem} onPress={handleTogglePin} disabled={togglingPin}>
              <MaterialIcons name="push-pin" size={18} color={colors.onSurface} />
              <Text style={styles.pinMenuItemText}>{pinMenuRace?.pinned ? "Unpin race" : "Pin race"}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  scrollContent: { padding: spacing.marginMobile },
  identity: { alignItems: "center", marginBottom: spacing.gutter },
  clubName: { ...typography.headlineLg, fontSize: 24, color: colors.onSurface, letterSpacing: 0.5 },
  panel: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.stackSm,
  },
  divider: { height: 1, backgroundColor: colors.outlineVariant },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    paddingVertical: spacing.gutter,
  },
  avatar: { width: 44, height: 44, borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  rowTextWrap: { flex: 1 },
  rowLabel: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  rowSubtitle: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 2 },
  racesSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.gutter,
  },
  sectionHeader: { ...typography.headlineLgMobile, fontSize: 15, color: colors.onSurface },
  seeAll: { ...typography.labelSm, fontSize: 12, color: colors.primary, textTransform: "uppercase" },
  emptyRaces: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, paddingBottom: spacing.gutter },
  raceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    paddingVertical: spacing.gutter,
  },
  raceAvatarImage: { width: 44, height: 44, borderRadius: radii.full },
  raceAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  raceAvatarInitial: { ...typography.labelSm, fontSize: 17, color: colors.primary },
  raceName: { ...typography.bodyMd, fontSize: 16, color: colors.onSurface, flex: 1 },
  addGroupButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 6,
    marginTop: spacing.gutter,
  },
  addGroupButtonLabel: { ...typography.headlineLgMobile, fontSize: 15, color: colors.onPrimary },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.marginMobile,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.gutter,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.stackSm,
  },
  modalTitle: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.md,
    paddingHorizontal: spacing.stackSm + 4,
    paddingVertical: spacing.stackSm,
    marginBottom: spacing.stackSm,
  },
  searchInput: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface, flex: 1, padding: 0 },
  modalList: { flexGrow: 0 },
  pinMenuCard: {
    width: "100%",
    maxWidth: 280,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.stackSm,
  },
  pinMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.stackSm,
    paddingVertical: spacing.gutter,
    paddingHorizontal: spacing.stackSm,
  },
  pinMenuItemText: { ...typography.bodyMd, fontSize: 15, color: colors.onSurface, fontWeight: "600" },
});
