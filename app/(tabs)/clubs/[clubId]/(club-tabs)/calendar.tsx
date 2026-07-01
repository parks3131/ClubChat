import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function ClubCalendarScreen() {
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Calendar for club {clubId} — coming in task #6</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholder: { color: "#888" },
});
