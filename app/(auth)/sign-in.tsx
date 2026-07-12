import { MaterialIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { colors, radii, spacing, typography } from "../../constants/theme";
import { useAuth } from "../../contexts/AuthProvider";

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    setError(null);
    setLoading(true);
    const { error } = await signIn(email.trim(), password);
    setLoading(false);
    if (error) setError(error);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.brandRow}>
        <View style={styles.brandBadge}>
          <MaterialIcons name="sports-kabaddi" size={32} color={colors.onPrimaryContainer} />
        </View>
        <Text style={styles.title}>ClubChat</Text>
        <Text style={styles.tagline}>Welcome back, athlete. Access your team's coordination hub.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name="mail" size={20} color={colors.onSurfaceVariant} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@clubchat.com"
              placeholderTextColor={colors.onSurfaceVariant}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.inputWrap}>
            <MaterialIcons name="lock" size={20} color={colors.onSurfaceVariant} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceVariant}
              secureTextEntry={!showPassword}
              autoComplete="password"
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity style={styles.visibilityToggle} onPress={() => setShowPassword((v) => !v)}>
              <MaterialIcons
                name={showPassword ? "visibility-off" : "visibility"}
                size={20}
                color={colors.onSurfaceVariant}
              />
            </TouchableOpacity>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading || !email || !password}
        >
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Text style={styles.buttonText}>SIGN IN</Text>
              <MaterialIcons name="bolt" size={20} color={colors.onPrimary} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.footerText}>
        New to the league?{" "}
        <Link href="/(auth)/sign-up" style={styles.link}>
          Create an account
        </Link>
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.marginMobile,
    gap: spacing.stackMd,
    backgroundColor: colors.surface,
  },
  brandRow: { alignItems: "center", gap: spacing.unit },
  brandBadge: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.stackSm,
    transform: [{ rotate: "3deg" }],
  },
  title: { ...typography.displayXl, fontSize: 36, lineHeight: 40, color: colors.primary },
  tagline: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: "center",
    maxWidth: 280,
    marginTop: spacing.unit,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackMd,
    gap: spacing.stackMd,
  },
  field: { gap: spacing.unit },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: "transparent",
  },
  inputIcon: { marginLeft: spacing.gutter },
  input: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.onSurface,
    paddingVertical: spacing.stackSm + 4,
    paddingHorizontal: spacing.stackSm,
  },
  visibilityToggle: { padding: spacing.stackSm, marginRight: spacing.unit },
  error: { color: colors.error, textAlign: "center", ...typography.bodyMd },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.unit,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onPrimary, letterSpacing: 0.5 },
  footerText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center" },
  link: { color: colors.primary, fontWeight: "700" },
});
