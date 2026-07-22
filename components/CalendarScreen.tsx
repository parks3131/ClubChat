import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "../constants/theme";
import { useAuth } from "../contexts/AuthProvider";
import { fetchCalendarFeed, fetchGlobalCalendarFeed, type CalendarFeedItem } from "../lib/calendarFeed";
import { addMonths, toDateKey } from "../lib/dates";
import { LoadError } from "./LoadError";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const CELLS_IN_GRID = 42; // 6 weeks x 7 days — fixed so paging months never changes grid height

// Background/text pair per badge label, for the day-popup's item rows.
// Covers every kind CalendarFeedItem can still be once polls are filtered
// out before reaching this screen (see itemsByDay below) — 5 calendar_event
// types + "Race/Meet" + "Eboard Meeting". The full Upcoming/Past list
// (which does include polls) lives on its own separate screen now — see
// components/EventsListScreen.tsx.
const BADGE_STYLE: Record<string, { bg: string; fg: string }> = {
  Race: { bg: colors.primaryFixed, fg: colors.onPrimaryFixedVariant },
  Practice: { bg: colors.tertiaryFixed, fg: colors.onTertiaryFixedVariant },
  "Team bonding": { bg: colors.secondaryFixed, fg: colors.onSecondaryFixedVariant },
  Volunteer: { bg: colors.errorContainer, fg: colors.onErrorContainer },
  Other: { bg: colors.surfaceContainerHigh, fg: colors.onSurfaceVariant },
  "Race/Meet": { bg: colors.primary, fg: colors.onPrimary },
  "Eboard Meeting": { bg: colors.inverseSurface, fg: colors.inverseOnSurface },
};

function formatItemTime(item: CalendarFeedItem) {
  if (!item.hasTime) return null;
  return new Date(item.atIso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatMonthTitle(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatDayTitle(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export type CalendarScreenProps =
  // A specific club's feed — identical to what this screen always showed
  // before the bottom-tab Calendar existed. isAdmin gates the create FAB.
  | { mode: "club"; clubId: string; isAdmin: boolean }
  // The bottom-tab Calendar's "no club currently active" state — every
  // club the caller belongs to, merged. Read-only (no FAB): creating an
  // event only makes sense inside one specific club.
  | { mode: "global" };

// Month-grid calendar only (founder request: Calendar should show just
// the grid — the full Upcoming/Past list lives on its own separate
// screen, components/EventsListScreen.tsx, reached from chat's header
// menu rather than a toggle on this same screen). Each day with a
// calendar_event, race, or Eboard meeting gets a dark-circled marker;
// tapping a marked day opens a small popup listing that day's items,
// each tappable through to its real screen. Merges calendar_events,
// races you have access to, and Eboard meetings (if you're a member) —
// see lib/calendarFeed.ts for the per-source visibility rules. Polls are
// excluded from this grid (a poll has a closing deadline, not a "when it
// happens" the way the other 3 kinds do) but stay fully visible from
// each Polls tab, and from the Events list.
export default function CalendarScreen(props: CalendarScreenProps) {
  const { session } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

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

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of items) {
      if (item.kind === "poll") continue;
      const dateKey = item.atIso.slice(0, 10);
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(item);
    }
    return map;
  }, [items]);

  const todayKey = toDateKey(today);

  // Classic month-grid layout: find this month's first day's weekday to
  // know how many leading filler cells (from the previous month) it
  // needs, then fill 42 cells total so every month renders the same grid
  // height — paging Dec -> Jan never jumps the FAB/page around.
  const gridCells = useMemo(() => {
    const firstOfMonth = new Date(visibleMonth.year, visibleMonth.month, 1);
    const leadingBlanks = firstOfMonth.getDay();
    const gridStart = new Date(visibleMonth.year, visibleMonth.month, 1 - leadingBlanks);
    return Array.from({ length: CELLS_IN_GRID }, (_, i) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
      return { date, dateKey: toDateKey(date), inMonth: date.getMonth() === visibleMonth.month };
    });
  }, [visibleMonth]);

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

  const selectedDayItems = selectedDayKey ? itemsByDay.get(selectedDayKey) ?? [] : [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.monthHeader}>
        <TouchableOpacity
          hitSlop={8}
          onPress={() =>
            setVisibleMonth((m) => {
              const next = addMonths(new Date(m.year, m.month, 1), -1);
              return { year: next.getFullYear(), month: next.getMonth() };
            })
          }
        >
          <MaterialIcons name="chevron-left" size={26} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{formatMonthTitle(visibleMonth.year, visibleMonth.month)}</Text>
        <TouchableOpacity
          hitSlop={8}
          onPress={() =>
            setVisibleMonth((m) => {
              const next = addMonths(new Date(m.year, m.month, 1), 1);
              return { year: next.getFullYear(), month: next.getMonth() };
            })
          }
        >
          <MaterialIcons name="chevron-right" size={26} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label, i) => (
          <Text key={i} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {gridCells.map((cell) => {
          const dayItems = itemsByDay.get(cell.dateKey);
          const hasItems = !!dayItems && dayItems.length > 0;
          const isToday = cell.dateKey === todayKey;
          // Leading/trailing filler days from adjacent months are always
          // non-interactive (disabled below) regardless of hasItems, but
          // the marker fill used to ignore inMonth entirely — a filler
          // day that happened to have items rendered the exact same
          // solid dark circle a real, tappable marked day gets, which
          // reads as a prominent, clickable marker sitting in the wrong
          // month even though tapping it does nothing. Gating both the
          // marker and its text on `cell.inMonth` means a filler day is
          // always just a plain dimmed number, like every other filler
          // day, regardless of whether it happens to have items.
          const showMarker = hasItems && cell.inMonth;
          return (
            <TouchableOpacity
              key={cell.dateKey}
              style={styles.cell}
              disabled={!cell.inMonth || !hasItems}
              onPress={() => setSelectedDayKey((prev) => (prev === cell.dateKey ? null : cell.dateKey))}
            >
              <View style={[styles.dayMarker, isToday && styles.dayMarkerToday, showMarker && styles.dayMarkerFilled]}>
                <Text
                  style={[styles.dayNumber, !cell.inMonth && styles.dayNumberOutOfMonth, showMarker && styles.dayNumberFilled]}
                >
                  {cell.date.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {items.length === 0 && (
        <Text style={styles.empty}>{props.mode === "global" ? "No events across your clubs yet." : "No events yet."}</Text>
      )}

      {/* Inline, in-place list for whichever day is selected — replaces a
          popup so tapping a different marked day just swaps this section's
          content instead of needing to close one popup before opening the
          next. */}
      {selectedDayKey && (
        <View style={styles.dayListSection}>
          <Text style={styles.dayListTitle}>{formatDayTitle(selectedDayKey)}</Text>
          {selectedDayItems.map((item) => {
            const badgeStyle = BADGE_STYLE[item.badgeLabel] ?? BADGE_STYLE.Other;
            const time = formatItemTime(item);
            return (
              <TouchableOpacity key={item.id} style={styles.dayListRow} onPress={() => router.push(item.path)}>
                <View style={styles.dayListRowHeader}>
                  <Text style={[styles.badge, { backgroundColor: badgeStyle.bg, color: badgeStyle.fg }]}>
                    {item.badgeLabel.toUpperCase()}
                  </Text>
                  {item.clubName && <Text style={styles.clubTag}>{item.clubName}</Text>}
                </View>
                <Text style={styles.dayListRowTitle}>{item.title}</Text>
                {(time || item.subtitle) && (
                  <View style={styles.dayListRowMetaRow}>
                    {time && <Text style={styles.dayListRowMeta}>{time}</Text>}
                    {item.subtitle && (
                      <View style={styles.dayListRowLocationRow}>
                        <MaterialIcons name="location-on" size={13} color={colors.onSecondaryContainer} />
                        <Text style={styles.dayListRowMeta}>{item.subtitle}</Text>
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      </ScrollView>

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
  scrollContent: { padding: spacing.marginMobile, paddingBottom: 96 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { textAlign: "center", marginTop: spacing.stackLg, color: colors.onSurfaceVariant },
  monthHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.stackMd },
  monthTitle: { ...typography.headlineLgMobile, fontSize: 20, color: colors.onSurface },
  weekdayRow: { flexDirection: "row" },
  weekdayLabel: {
    width: `${100 / 7}%`,
    textAlign: "center",
    ...typography.labelSm,
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: spacing.stackSm,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  // Fixed height rather than `aspectRatio: 1` — on a wide viewport (this
  // app is mobile-first but also runs via react-native-web) a percentage
  // width cell with aspectRatio 1 would grow just as tall as it is wide,
  // blowing the whole grid's height out well past the screen.
  cell: { width: `${100 / 7}%`, height: 56, alignItems: "center", justifyContent: "center" },
  dayMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  dayMarkerToday: { borderWidth: 2, borderColor: colors.primary },
  dayMarkerFilled: { backgroundColor: colors.onSurface },
  dayNumber: { ...typography.bodyMd, fontSize: 14, color: colors.onSurface },
  dayNumberOutOfMonth: { color: colors.onSurfaceVariant, opacity: 0.4 },
  dayNumberFilled: { color: colors.surface, fontWeight: "700" },
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
  dayListSection: {
    marginTop: spacing.stackLg,
    paddingTop: spacing.stackMd,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  dayListTitle: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onSurface, marginBottom: spacing.stackMd },
  dayListRow: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
    marginBottom: spacing.stackSm,
  },
  dayListRowHeader: { flexDirection: "row", alignItems: "center", gap: spacing.stackSm },
  badge: {
    ...typography.labelSm,
    fontSize: 10,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm,
    paddingVertical: 2,
    overflow: "hidden",
  },
  clubTag: { ...typography.labelSm, fontSize: 10, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  dayListRowTitle: { ...typography.headlineLgMobile, fontSize: 16, color: colors.onSurface, marginTop: spacing.stackSm },
  dayListRowMetaRow: { flexDirection: "row", alignItems: "center", gap: spacing.gutter, marginTop: 4 },
  dayListRowMeta: { ...typography.bodyMd, fontSize: 13, color: colors.secondary },
  dayListRowLocationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
});
