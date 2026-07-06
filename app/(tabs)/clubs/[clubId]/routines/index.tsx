import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LoadError } from "../../../../../components/LoadError";
import { addDays, getMonday, toDateKey } from "../../../../../lib/dates";
import {
  ACTIVITY_ICONS,
  ACTIVITY_LABELS,
  fetchWeekWorkouts,
  type DisplayRoutineWorkout,
} from "../../../../../lib/routines";
import { useClub } from "../_layout";

const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError) {
    return <LoadError message="Couldn't load this week's routines." onRetry={() => setRetryToken((t) => t + 1)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => setWeekStart((w) => addDays(w, -7))}
          style={styles.weekNavButton}
          disabled={isEarliestWeek}
        >
          <Text style={[styles.weekNavArrow, isEarliestWeek && styles.weekNavArrowDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{formatWeekRange(weekStart, weekEnd)}</Text>
        <TouchableOpacity onPress={() => setWeekStart((w) => addDays(w, 7))} style={styles.weekNavButton}>
          <Text style={styles.weekNavArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {Array.from({ length: 7 }).map((_, i) => {
          const date = addDays(weekStart, i);
          const dateKey = toDateKey(date);
          if (dateKey < todayKey) return null;

          const dayWorkouts = workouts.filter((w) => w.workoutDate === dateKey);
          const isToday = dateKey === todayKey;

          return (
            <View key={dateKey} style={[styles.daySection, isToday && styles.daySectionToday]}>
              <Text style={styles.dayHeader}>
                {DAY_LABELS[i]} · {formatDay(date)}
              </Text>

              {dayWorkouts.map((workout) => (
                <TouchableOpacity
                  key={workout.id}
                  style={styles.workoutCard}
                  onPress={() => router.push(`/clubs/${club.clubId}/routines/workout/${workout.id}`)}
                >
                  <Text style={styles.workoutIcon}>{ACTIVITY_ICONS[workout.activityType]}</Text>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutTitle}>{workout.title}</Text>
                    <Text style={styles.workoutType}>{ACTIVITY_LABELS[workout.activityType]}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}

              {dayWorkouts.length === 0 && club.role !== "admin" && <Text style={styles.restDay}>Rest day</Text>}

              {club.role === "admin" && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => router.push(`/clubs/${club.clubId}/routines/activity-type?date=${dateKey}`)}
                >
                  <Text style={styles.addButtonText}>+ Add workout</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  weekNavButton: { padding: 8 },
  weekNavArrow: { fontSize: 22, color: "#2563eb", fontWeight: "700" },
  weekNavArrowDisabled: { color: "#cbd5e1" },
  weekLabel: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  list: { padding: 12, paddingBottom: 40 },
  daySection: { backgroundColor: "#f8fafc", borderRadius: 10, padding: 12, marginBottom: 10 },
  daySectionToday: { backgroundColor: "#eff6ff" },
  dayHeader: { fontSize: 13, fontWeight: "700", color: "#64748b", textTransform: "uppercase", marginBottom: 8 },
  workoutCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  workoutIcon: { fontSize: 20, marginRight: 10 },
  workoutInfo: { flex: 1 },
  workoutTitle: { fontSize: 15, fontWeight: "600", color: "#0f172a" },
  workoutType: { fontSize: 12, color: "#64748b", marginTop: 1 },
  chevron: { fontSize: 18, color: "#94a3b8" },
  restDay: { fontSize: 13, color: "#94a3b8", fontStyle: "italic" },
  addButton: { marginTop: 2, alignSelf: "flex-start" },
  addButtonText: { color: "#2563eb", fontWeight: "600", fontSize: 13 },
});
