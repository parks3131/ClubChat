import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function RaceCarpoolScreen() {
  const { raceId } = useLocalSearchParams<{ raceId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Carpool groups for race {raceId} — future phase</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { color: "#888" },
});
