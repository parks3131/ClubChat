import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function RaceInfoScreen() {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>
        Location, start/end time, and results link for race {raceId} — future phase
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  placeholder: { color: "#888", textAlign: "center" },
});
