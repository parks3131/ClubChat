import { supabase } from "./supabase";
import type { RoutineActivityType } from "../types/database";

export const ACTIVITY_TYPES: { value: RoutineActivityType; label: string; icon: string }[] = [
  { value: "run", label: "Run", icon: "🏃" },
  { value: "trail_run", label: "Trail Run", icon: "🥾" },
  { value: "bike", label: "Bike", icon: "🚴" },
  { value: "swim", label: "Swim", icon: "🏊" },
  { value: "strength", label: "Strength", icon: "🏋️" },
  { value: "hybrid_fitness", label: "Hybrid Fitness", icon: "⚡" },
  { value: "indoor_climb", label: "Indoor Climb", icon: "🧗" },
  { value: "bouldering", label: "Bouldering", icon: "🪨" },
  { value: "xc_ski", label: "XC Ski", icon: "⛷️" },
  { value: "other", label: "Other", icon: "🏷️" },
];

export const ACTIVITY_LABELS = Object.fromEntries(
  ACTIVITY_TYPES.map((t) => [t.value, t.label])
) as Record<RoutineActivityType, string>;

export const ACTIVITY_ICONS = Object.fromEntries(
  ACTIVITY_TYPES.map((t) => [t.value, t.icon])
) as Record<RoutineActivityType, string>;

export interface DisplayRoutineWorkout {
  id: string;
  clubId: string;
  workoutDate: string;
  activityType: RoutineActivityType;
  title: string;
  description: string | null;
  createdBy: string;
}

function toDisplayWorkout(row: {
  id: string;
  club_id: string;
  workout_date: string;
  activity_type: RoutineActivityType;
  title: string;
  description: string | null;
  created_by: string;
}): DisplayRoutineWorkout {
  return {
    id: row.id,
    clubId: row.club_id,
    workoutDate: row.workout_date,
    activityType: row.activity_type,
    title: row.title,
    description: row.description,
    createdBy: row.created_by,
  };
}

export async function fetchWeekWorkouts(
  clubId: string,
  startDate: string,
  endDate: string
): Promise<DisplayRoutineWorkout[]> {
  const { data, error } = await supabase
    .from("routine_workouts")
    .select("id, club_id, workout_date, activity_type, title, description, created_by")
    .eq("club_id", clubId)
    .gte("workout_date", startDate)
    .lte("workout_date", endDate)
    .order("workout_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(toDisplayWorkout);
}

export async function fetchWorkout(workoutId: string): Promise<DisplayRoutineWorkout | null> {
  const { data, error } = await supabase
    .from("routine_workouts")
    .select("id, club_id, workout_date, activity_type, title, description, created_by")
    .eq("id", workoutId)
    .single();

  if (error) throw error;
  if (!data) return null;
  return toDisplayWorkout(data);
}

export async function createWorkout(params: {
  clubId: string;
  workoutDate: string;
  activityType: RoutineActivityType;
  title: string;
  description: string;
  createdBy: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("routine_workouts")
    .insert({
      club_id: params.clubId,
      workout_date: params.workoutDate,
      activity_type: params.activityType,
      title: params.title,
      description: params.description || null,
      created_by: params.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateWorkout(workoutId: string, params: { title: string; description: string }) {
  const { error } = await supabase
    .from("routine_workouts")
    .update({
      title: params.title,
      description: params.description || null,
    })
    .eq("id", workoutId);

  if (error) throw error;
}

export async function deleteWorkout(workoutId: string) {
  const { error } = await supabase.from("routine_workouts").delete().eq("id", workoutId);
  if (error) throw error;
}
