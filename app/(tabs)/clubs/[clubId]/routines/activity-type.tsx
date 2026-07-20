import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ACTIVITY_TYPES } from "../../../../../lib/routines";
import { useClub } from "../_layout";

export default function SelectActivityTypeScreen() {
  const { clubId, date } = useLocalSearchParams<{ clubId: string; date: string }>();
  const club = useClub();
  const router = useRouter();

  useEffect(() => {
    if (!club.isAdmin) {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(`/clubs/${clubId}/routines`);
      }
    }
  }, [club.role, router, clubId]);

  return (
    <View style={styles.container}>
      {ACTIVITY_TYPES.map((type) => (
        <TouchableOpacity
          key={type.value}
          style={styles.row}
          onPress={() =>
            router.push(`/clubs/${clubId}/routines/workout/create?date=${date}&activityType=${type.value}`)
          }
        >
          <Text style={styles.icon}>{type.icon}</Text>
          <Text style={styles.label}>{type.label}</Text>
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
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  icon: { fontSize: 20, marginRight: 12 },
  label: { flex: 1, fontSize: 17, fontWeight: "600", color: "#0f172a" },
  chevron: { fontSize: 20, color: "#94a3b8" },
});
