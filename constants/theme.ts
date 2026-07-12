// "Kinetic Performance System" design tokens, extracted verbatim from the
// Stitch export's kinetic_performance_system/DESIGN.md frontmatter. Light
// mode only for now — colors are a flat named export (not inlined into
// components) so a dark variant can be swapped in later without touching
// every screen that imports them.
//
// `primary`/`surfaceTint` are overridden to #ff4d00 ("Energetic Orange")
// per an explicit founder preference — DESIGN.md's own frontmatter lists
// primary as #aa3000, but the chat screen's Stitch export hardcodes
// #ff4d00 for this exact brand color, and the founder chose that brighter
// shade over the frontmatter's value, app-wide. Every other token
// (primaryContainer, primaryFixed, etc.) is untouched.
import type { MaterialIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];
export const colors = {
  surface: "#f7f9fb",
  surfaceDim: "#d8dadc",
  surfaceBright: "#f7f9fb",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f2f4f6",
  surfaceContainer: "#eceef0",
  surfaceContainerHigh: "#e6e8ea",
  surfaceContainerHighest: "#e0e3e5",
  onSurface: "#191c1e",
  onSurfaceVariant: "#5c4037",
  inverseSurface: "#2d3133",
  inverseOnSurface: "#eff1f3",
  outline: "#916f65",
  outlineVariant: "#e6beb2",
  surfaceTint: "#ff4d00",
  primary: "#ff4d00",
  onPrimary: "#ffffff",
  primaryContainer: "#d43f00",
  onPrimaryContainer: "#fffbff",
  inversePrimary: "#ffb59e",
  secondary: "#565e74",
  onSecondary: "#ffffff",
  secondaryContainer: "#dae2fd",
  onSecondaryContainer: "#5c647a",
  tertiary: "#005daa",
  onTertiary: "#ffffff",
  tertiaryContainer: "#0075d5",
  onTertiaryContainer: "#fefcff",
  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",
  primaryFixed: "#ffdbd0",
  primaryFixedDim: "#ffb59e",
  onPrimaryFixed: "#3a0b00",
  onPrimaryFixedVariant: "#852400",
  secondaryFixed: "#dae2fd",
  secondaryFixedDim: "#bec6e0",
  onSecondaryFixed: "#131b2e",
  onSecondaryFixedVariant: "#3f465c",
  tertiaryFixed: "#d4e3ff",
  tertiaryFixedDim: "#a5c8ff",
  onTertiaryFixed: "#001c3a",
  onTertiaryFixedVariant: "#004785",
  background: "#f7f9fb",
  onBackground: "#191c1e",
  surfaceVariant: "#e0e3e5",
} as const;

// rem values from DESIGN.md converted to px at a 16px base.
export const radii = {
  sm: 4,
  DEFAULT: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const spacing = {
  unit: 4,
  gutter: 16,
  marginMobile: 16,
  stackSm: 8,
  stackMd: 24,
  stackLg: 48,
} as const;

// fontFamily names match the keys registered via useFonts in app/_layout.tsx.
// Sizes/line-heights/letter-spacing are the exact DESIGN.md values (rem/em
// converted to px at a 16px base), not rescaled for mobile — headline-lg-
// mobile is already the design system's own mobile-scaled variant.
export const typography = {
  displayXl: { fontFamily: "Anton_400Regular", fontSize: 48, lineHeight: 53, letterSpacing: 1 },
  headlineLg: { fontFamily: "Anton_400Regular", fontSize: 32, lineHeight: 38 },
  headlineLgMobile: { fontFamily: "Anton_400Regular", fontSize: 28, lineHeight: 34 },
  statValue: { fontFamily: "ArchivoNarrow_700Bold", fontSize: 24, lineHeight: 24 },
  bodyMd: { fontFamily: "ArchivoNarrow_400Regular", fontSize: 16, lineHeight: 26 },
  labelSm: { fontFamily: "Inter_600SemiBold", fontSize: 12, lineHeight: 12, letterSpacing: 0.6 },
} as const;

export const theme = { colors, radii, spacing, typography };
