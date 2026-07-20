import { MaterialIcons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { colors, radii, spacing, typography } from "../../../../../constants/theme";
import { addDays, getMonday, toDateKey } from "../../../../../lib/dates";
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  fetchWeekWorkouts,
  type DisplayRoutineWorkout,
} from "../../../../../lib/routines";
import { useClub } from "../_layout";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABELS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatWeekRange(monday: Date, sunday: Date): string {
  const start = monday.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const end = sunday.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

export default function RoutinesWeekScreen() {
  const club = useClub();
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [workouts, setWorkouts] = useState<DisplayRoutineWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  const weekStartKey = toDateKey(weekStart);
  const weekEnd = addDays(weekStart, 6);
  const weekEndKey = toDateKey(weekEnd);
  const todayKey = toDateKey(new Date());
  const currentWeekStart = getMonday(new Date());
  const isEarliestWeek = weekStart.getTime() <= currentWeekStart.getTime();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      fetchWeekWorkouts(club.clubId, weekStartKey, weekEndKey)
        .then((data) => {
          if (!cancelled) {
            setWorkouts(data);
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
    }, [club.clubId, weekStartKey, weekEndKey, retryToken])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load this week's routines." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.dateStrip}>
        <TouchableOpacity
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          style={styles.weekNavButton}
          disabled={isEarliestWeek}
        >
          <MaterialIcons name="chevron-left" size={26} color={isEarliestWeek ? colors.surfaceVariant : colors.primary} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{formatWeekRange(weekStart, weekEnd)}</Text>
        <TouchableOpacity onPress={() => setWeekStart((w) => addDays(w, 7))} style={styles.weekNavButton}>
          <MaterialIcons name="chevron-right" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayChipRow}>
        {DAY_LABELS.map((label, i) => {
          const date = addDays(weekStart, i);
          const dateKey = toDateKey(date);
          const isToday = dateKey === todayKey;
          const isPast = dateKey < todayKey;
          return (
            <View key={label} style={[styles.dayChip, isToday && styles.dayChipActive, isPast && styles.dayChipPast]}>
              <Text style={[styles.dayChipLabel, isToday && styles.dayChipLabelActive]}>{label}</Text>
              <Text style={[styles.dayChipNum, isToday && styles.dayChipNumActive]}>{date.getDate()}</Text>
            </View>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {Array.from({ length: 7 }).map((_, i) => {
          const date = addDays(weekStart, i);
          const dateKey = toDateKey(date);
          if (dateKey < todayKey) return null;

          const dayWorkouts = workouts.filter((w) => w.workoutDate === dateKey);
          const isToday = dateKey === todayKey;

          return (
            <View key={dateKey} style={styles.daySection}>
              <View style={styles.dayHeaderRow}>
                <Text style={styles.dayHeader}>
                  {DAY_LABELS_FULL[i]}, {formatDay(date)}
                </Text>
                {club.isAdmin && (
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => router.push(`/clubs/${club.clubId}/routines/activity-type?date=${dateKey}`)}
                  >
                    <MaterialIcons name="add" size={14} color={colors.onPrimaryFixedVariant} />
                    <Text style={styles.addButtonText}>Add Workout</Text>
                  </TouchableOpacity>
                )}
              </View>

              {dayWorkouts.map((workout) => (
                <TouchableOpacity
                  key={workout.id}
                  style={styles.workoutCard}
                  onPress={() => router.push(`/clubs/${club.clubId}/routines/workout/${workout.id}`)}
                >
                  <View style={styles.workoutIconWrap}>
                    <Text style={styles.workoutIcon}>{ACTIVITY_ICONS[workout.activityType]}</Text>
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutTitle}>{workout.title}</Text>
                    <Text style={styles.workoutType}>{ACTIVITY_LABELS[workout.activityType]}</Text>
                    {workout.description ? (
                      <Text style={styles.workoutDescription} numberOfLines={2}>
                        {workout.description}
                      </Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              ))}

              {dayWorkouts.length === 0 && (
                <View style={[styles.restDay, isToday && styles.restDayToday]}>
                  <MaterialIcons name="hotel" size={28} color={colors.onSurfaceVariant} />
                  <Text style={styles.restDayTitle}>Rest Day</Text>
                  <Text style={styles.restDayBody}>Nothing scheduled today.</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  dateStrip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm,
  },
  weekNavButton: { padding: spacing.stackSm },
  weekLabel: { ...typography.statValue, fontSize: 15, color: colors.onSurface },
  dayChipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.stackSm,
    gap: spacing.unit,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.stackSm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceContainer,
    gap: 2,
  },
  dayChipActive: { backgroundColor: colors.primary },
  dayChipPast: { opacity: 0.4 },
  dayChipLabel: { ...typography.labelSm, fontSize: 10, color: colors.onSurfaceVariant },
  dayChipLabelActive: { color: colors.onPrimary, opacity: 0.8 },
  dayChipNum: { ...typography.statValue, fontSize: 16, color: colors.onSurface },
  dayChipNumActive: { color: colors.onPrimary },
  list: { padding: spacing.marginMobile, paddingTop: 0, paddingBottom: 40, gap: spacing.stackMd },
  daySection: { gap: spacing.stackSm },
  dayHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dayHeader: { ...typography.headlineLgMobile, fontSize: 17, color: colors.onSurfaceVariant },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primaryFixed,
    borderRadius: radii.full,
    paddingHorizontal: spacing.stackSm + 2,
    paddingVertical: spacing.unit + 2,
  },
  addButtonText: { ...typography.labelSm, color: colors.onPrimaryFixedVariant },
  workoutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.gutter,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.gutter,
  },
  workoutIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
  },
  workoutIcon: { fontSize: 22 },
  workoutInfo: { flex: 1 },
  workoutTitle: { ...typography.statValue, fontSize: 16, color: colors.primary },
  workoutType: { ...typography.bodyMd, fontSize: 12, color: colors.onSecondaryContainer, marginTop: 2 },
  workoutDescription: { ...typography.bodyMd, fontSize: 13, color: colors.onSurfaceVariant, marginTop: 4 },
  restDay: {
    backgroundColor: colors.surfaceContainer,
    borderWidth: 2,
    borderColor: colors.outlineVariant,
    borderStyle: "dashed",
    borderRadius: radii.lg,
    padding: spacing.gutter + 4,
    alignItems: "center",
    gap: spacing.unit,
  },
  restDayToday: { borderColor: colors.primary },
  restDayTitle: { ...typography.statValue, fontSize: 15, color: colors.onSurface },
  restDayBody: { ...typography.bodyMd, fontSize: 13, color: colors.onSecondaryContainer },
});
