import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../../contexts/AuthProvider";
import { supabase } from "../../lib/supabase";

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [fullName, setFullName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;

    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        setFullName(data?.full_name ?? null);
        setLoading(false);
      });
  }, [session]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{fullName || "ClubChat member"}</Text>
      <Text style={styles.email}>{session?.user.email}</Text>

      <TouchableOpacity style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  name: { fontSize: 22, fontWeight: "700" },
  email: { fontSize: 15, color: "#666", marginBottom: 24 },
  button: { backgroundColor: "#dc2626", borderRadius: 8, paddingVertical: 12, paddingHorizontal: 24 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
