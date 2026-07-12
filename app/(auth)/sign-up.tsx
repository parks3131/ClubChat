import { MaterialIcons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
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

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    setError(null);
    setLoading(true);
    const { error, needsEmailConfirmation } = await signUp(email.trim(), password, fullName.trim());
    setLoading(false);
    if (error) {
      setError(error);
    } else if (needsEmailConfirmation) {
      setConfirmationSent(true);
    } else {
      // Don't rely solely on the passive onAuthStateChange -> _layout.tsx
      // redirect chain, which has been observed to occasionally stick on
      // web (see SPEC.md section 6).
      router.replace("/(tabs)/clubs");
    }
  };

  if (confirmationSent) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.successBadge}>
            <MaterialIcons name="mark-email-read" size={40} color={colors.primary} />
          </View>
          <Text style={styles.cardTitle}>CHECK YOUR EMAIL</Text>
          <Text style={styles.successBody}>
            We sent a confirmation link to {email}. Confirm your address, then sign in.
          </Text>
          <Link href="/(auth)/sign-in" style={styles.outlineButton}>
            <Text style={styles.outlineButtonText}>BACK TO SIGN IN</Text>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Text style={styles.brand}>ClubChat</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>JOIN THE CLUB</Text>
        <Text style={styles.cardSubtitle}>Coordinate your squad and dominate the season.</Text>

        <View style={styles.field}>
          <Text style={styles.label}>ATHLETE NAME</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={colors.onSurfaceVariant}
            autoCapitalize="words"
            value={fullName}
            onChangeText={setFullName}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>EMAIL ADDRESS</Text>
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
        <View style={styles.field}>
          <Text style={styles.label}>PASSWORD</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
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

        <Text style={styles.legalNotice}>
          By signing up, you agree to our{" "}
          <Link href="/(auth)/privacy-policy" style={styles.link}>
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/(auth)/terms" style={styles.link}>
            Terms of Service
          </Link>
          .
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, (loading || !fullName || !email || !password) && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading || !fullName || !email || !password}
        >
          {loading ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>CREATE ACCOUNT</Text>}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Already have an account?{" "}
          <Link href="/(auth)/sign-in" style={styles.link}>
            Sign in
          </Link>
        </Text>
      </View>
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
  brand: { ...typography.displayXl, fontSize: 32, lineHeight: 36, color: colors.primary, textAlign: "center" },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.stackMd,
    gap: spacing.gutter,
  },
  cardTitle: { ...typography.headlineLgMobile, color: colors.onSurface },
  cardSubtitle: { ...typography.bodyMd, color: colors.onSurfaceVariant, marginTop: -spacing.stackSm },
  field: { gap: spacing.unit },
  label: { ...typography.labelSm, color: colors.onSurfaceVariant, textTransform: "uppercase" },
  input: {
    ...typography.bodyMd,
    color: colors.onSurface,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radii.DEFAULT,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.stackSm + 4,
  },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1 },
  visibilityToggle: { position: "absolute", right: spacing.stackSm, padding: spacing.unit },
  legalNotice: { ...typography.labelSm, color: colors.onSurfaceVariant, textAlign: "center", textTransform: "none", lineHeight: 18 },
  link: { color: colors.primary, fontWeight: "700" },
  error: { color: colors.error, textAlign: "center", ...typography.bodyMd },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 8,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { ...typography.headlineLgMobile, fontSize: 18, color: colors.onPrimary, letterSpacing: 1 },
  footerText: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center" },
  successBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryFixed,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: spacing.stackSm,
  },
  successBody: { ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: "center" },
  outlineButton: {
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.stackSm + 4,
    alignItems: "center",
    marginTop: spacing.stackSm,
  },
  outlineButtonText: { ...typography.labelSm, color: colors.primary, textTransform: "uppercase" },
});
