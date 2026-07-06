import { useRouter } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRace } from "./_layout";

const SECTIONS: { key: string; label: string }[] = [
  { key: "chat", label: "Chat" },
  { key: "location", label: "Meet Information" },
  { key: "carpool", label: "Car Assignments & Groups" },
];

function formatEventDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function RaceHubScreen() {
  const race = useRace();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.date}>{formatEventDate(race.eventDate)}</Text>
      {SECTIONS.map((section) => (
        <TouchableOpacity
          key={section.key}
          style={styles.row}
          onPress={() => router.push(`/clubs/${race.clubId}/race/${race.raceId}/${section.key}`)}
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
  date: { fontSize: 14, color: "#64748b", marginBottom: 4 },
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
