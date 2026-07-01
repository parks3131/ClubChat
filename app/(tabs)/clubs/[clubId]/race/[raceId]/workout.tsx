import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function RaceWorkoutScreen() {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Workout plan for race {raceId} — future phase</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { color: "#888" },
});
