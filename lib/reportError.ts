import { Alert, Platform } from "react-native";

export function reportError(err: unknown) {
  const message = err instanceof Error ? err.message : "Something went wrong";
  if (Platform.OS === "web") window.alert(message);
  else Alert.alert("Error", message);
}
