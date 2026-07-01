import { ActivityIndicator, View } from "react-native";

// Renders briefly at "/" while the auth-guard effect in _layout.tsx
// redirects to (auth) or (tabs) based on session state.
export default function RootIndex() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
