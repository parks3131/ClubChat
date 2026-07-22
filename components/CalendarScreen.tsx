import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { fetchCalendarFeed, fetchGlobalCalendarFeed, type CalendarFeedItem } from "../lib/calendarFeed";
import { toDateKey } from "../lib/dates";
import { LoadError } from "./LoadError";

// Background/text pair per badge label — covers all 8 feed item types
// lib/calendarFeed.ts can surface (5 calendar_event types + "Race/Meet" +
// "Eboard Meeting" + "Poll"), not just the 3 the Stitch mockup happened
// to show.
const BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  Race: { bg: colors.primaryFixed, fg: colors.onPrimaryFixedVariant },
  Practice: { bg: colors.tertiaryFixed, fg: colors.onTertiaryFixedVariant },
  "Team bonding": { bg: colors.secondaryFixed, fg: colors.onSecondaryFixedVariant },
  Volunteer: { bg: colors.errorContainer, fg: colors.onErrorContainer },
  Other: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
  "Race/Meet": { bg: colors.primary, fg: colors.onPrimary },
  "Eboard Meeting": { bg: colors.inverseSurface, fg: colors.inverseOnSurface },
  Poll: { bg: colors.secondaryContainer, fg: colors.onSecondaryContainer },
};

const BIB_STYLE: Record<string, { bg: string; fg: string }> = {
  Race: { bg: colors.primary, fg: colors.onPrimary },
  Practice: { bg: colors.tertiary, fg: colors.onTertiary },
  "Team bonding": { bg: colors.secondary, fg: colors.onSecondary },
  Volunteer: { bg: colors.error, fg: colors.onError },
  Other: { bg: colors.onSurfaceVariant, fg: colors.surface },
  "Race/Meet": { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
  "Eboard Meeting": { bg: colors.inverseSurface, fg: colors.inverseOnSurface },
  Poll: { bg: colors.secondary, fg: colors.onSecondary },
};

function formatItemDate(item: CalendarFeedItem) {
  if (item.hasTime) {
    return new Date(item.atIso).toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  // Date-only (races) — build from y/m/d components rather than
  // `new Date(iso)`, which parses as UTC midnight and can display a day
  // early in timezones behind UTC (same bug formatDateOfBirth was fixed
  // for — see SPEC.md section 6).
  const [year, month, day] = item.atIso.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function bibDay(item: CalendarFeedItem) {
  const [, month, day] = item.atIso.slice(0, 10).split("-").map(Number);
  return { day, month: new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: "short" }).toUpperCase() };
}

type CalendarScreenProps =
  // A specific club's feed — identical to what this screen always showed
  // before the bottom-tab Calendar existed. isAdmin gates the create FAB.
  | { mode: "club"; clubId: string; isAdmin: boolean }
  // The bottom-tab Calendar's "no club currently active" state — every
  // club the caller belongs to, merged. Read-only (no FAB): creating an
  // event only makes sense inside one specific club.
  | { mode: "global" };

// Merges calendar_events, races you have access to, and Eboard meetings
// (if you're a member) into one date-ordered feed — see
// lib/calendarFeed.ts for the per-source visibility rules. "Upcoming" vs
// "Past" preserves each source's own existing cutoff convention rather
// than one blunt timestamp comparison: a race stays "Upcoming" all day
// today (date-string compare, matching races/index.tsx), while events/
// meetings use a real timestamp compare.
export default function CalendarScreen(props: CalendarScreenProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const scopeKey = props.mode === "club" ? props.clubId : "global";

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);
      const load =
        props.mode === "club"
          ? fetchCalendarFeed(props.clubId, session.user.id, props.isAdmin)
          : fetchGlobalCalendarFeed(session.user.id);
      load
        .then((data) => {
          if (!cancelled) {
            setItems(data);
            setLoadError(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoadError(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey, session, retryToken])
  );

  const now = Date.now();
  const todayKey = toDateKey(new Date());
  // A poll has no fixed "when it happens" the way an event/race/meeting
  // does — an open-ended poll (no closes_at) would otherwise flip to
  // "Past" the instant its own createdAt timestamp (used as atIso so it
  // still sorts/displays somewhere) ticks past "now". Use isOpen (mirrors
  // lib/polls.ts's isPollEffectivelyClosed) instead of a date compare for
  // this one kind.
  const isUpcoming = (item: CalendarFeedItem) =>
    item.kind === "poll"
      ? !!item.isOpen
      : item.hasTime
        ? new Date(item.atIso).getTime() >= now
        : item.atIso.slice(0, 10) >= todayKey;

  const upcoming = items.filter(isUpcoming);
  const past = items.filter((i) => !isUpcoming(i)).reverse();

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load the calendar." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  const sections = [
    { title: "Upcoming Events", data: upcoming, faded: false },
    { title: "Past Events", data: past, faded: true },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {props.mode === "global" ? "No events across your clubs yet." : "No events yet."}
          </Text>
        }
        renderItem={({ item: section }) => (
          <View>
            <Text style={[styles.sectionHeader, section.faded && styles.sectionHeaderFaded]}>{section.title}</Text>
            {section.data.map((item) => {
              const bib = bibDay(item);
              const bibStyle = BIB_STYLE[item.badgeLabel] ?? BIB_STYLE.Other;
              const badgeStyle = BADGE_STYLE[item.badgeLabel] ?? BADGE_STYLE.Other;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.row, section.faded && styles.rowFaded]}
                  onPress={() => router.push(item.path)}
                >
                  <View style={[styles.bibChip, { backgroundColor: bibStyle.bg }]}>
                    <Text style={[styles.bibDay, { color: bibStyle.fg }]}>{bib.day}</Text>
                    <Text style={[styles.bibMonth, { color: bibStyle.fg }]}>{bib.month}</Text>
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowHeader}>
                      <Text style={[styles.badge, { backgroundColor: badgeStyle.bg, color: badgeStyle.fg }]}>
                        {item.badgeLabel.toUpperCase()}
                      </Text>
                      {item.clubName && <Text style={styles.clubTag}>{item.clubName}</Text>}
                    </View>
                    <Text style={styles.rowTitle}>{item.title}</Text>
                    <Text style={styles.rowDate}>{formatItemDate(item)}</Text>
                    {item.subtitle && (
                      <View style={styles.rowLocationRow}>
                        <MaterialIcons name="location-on" size={14} color={colors.onSecondaryContainer} />
                        <Text style={styles.rowLocation}>{item.subtitle}</Text>
                      </View>
                    )}
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.outline} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      />

      {props.mode === "club" && props.isAdmin && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push(`/clubs/${props.clubId}/event/create`)}>
          <MaterialIcons name="add" size={22} color={colors.onPrimaryContainer} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: spacing.marginMobile, paddingBottom: 80 },
  empty: { textAlign: "center", marginTop: 40, color: colors.onSurfaceVariant },
  sectionHeader: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface, marginTop: spacing.stackSm, marginBottom: spacing.stackSm },
  sectionHeaderFaded: { opacity: 0.5 },
  row: {
    flexDirection: "row",
    gap: spacing.gutter,
    alignItems: "flex-start",
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    marginBottom: spacing.stackSm,
  },
  rowFaded: { opacity: 0.6 },
  bibChip: {
    width: 52,
    height: 60,
    borderRadius: radii.DEFAULT,
    alignItems: "center",
    justifyContent: "center",
  },
  bibDay: { ...typography.statValue, fontSize: 22, lineHeight: 22 },
  bibMonth: { ...typography.labelSm, fontSize: 10, marginTop: 2 },
  rowBody: { flex: 1 },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  badge: {
    ...typography.labelSm,
    fontSize: 10,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  clubTag: { ...typography.labelSm, fontSize: 10, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  rowTitle: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurface, marginTop: spacing.stackSm },
  rowDate: { ...typography.bodyMd, fontSize: 13, color: colors.secondary, marginTop: 2 },
  rowLocationRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  rowLocation: { ...typography.bodyMd, fontSize: 13, color: colors.onSecondaryContainer },
  fab: {
    position: "absolute",
    right: spacing.marginMobile,
    bottom: spacing.marginMobile,
    backgroundColor: colors.primaryContainer,
    borderRadius: radii.full,
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
});
