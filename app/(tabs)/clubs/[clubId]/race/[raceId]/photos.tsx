import { StyleSheet, Text, View } from "react-native";
import { useRace } from "./_layout";

// Placeholder — content to be scoped later (per an explicit founder note
// that each of the 4 non-chat race sections would be detailed separately).
export default function RacePhotosScreen() {
  const race = useRace();
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Photos for {race.name} — coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  placeholder: { color: "#888", textAlign: "center" },
});
