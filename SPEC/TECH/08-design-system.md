# Design System

The "Kinetic Performance System" tokens in `constants/theme.ts`, how they're applied, and the platform quirks that forced specific workarounds.

## Overview

One flat token module - colors, radii, spacing, typography - imported directly by every screen and component. There is no styled-components layer, no theme provider, and no dark mode: tokens are plain `as const` objects and styling is `StyleSheet.create` at the bottom of each file.

The palette is a Material-3-shaped export from a Stitch design (`kinetic_performance_system/DESIGN.md`), with **one deliberate override**: `primary` and `surfaceTint` are `#ff4d00` ("Energetic Orange") rather than DESIGN.md's `#aa3000`, per an explicit founder preference, applied app-wide. Every other token is verbatim.

## Key files

| Path | Responsibility |
| --- | --- |
| `constants/theme.ts` | All tokens; exports `colors`, `radii`, `spacing`, `typography`, a combined `theme`, and the `MaterialIconName` type |
| `app/_layout.tsx` | Loads the three font families and gates the whole tree until they're ready |
| `components/ThemedSwitch.tsx` | The one component that exists purely to defeat a platform default |
| `components/LoadError.tsx` | The canonical "small component styled entirely from tokens" example |

## Colors

`colors` is a 50-key Material-3 role palette. The ones actually load-bearing across the app:

### Brand

| Token | Value | Used for |
| --- | --- | --- |
| `primary` | `#ff4d00` | Every accent: header titles, FABs, active tab, links, back arrows, pins, primary buttons |
| `surfaceTint` | `#ff4d00` | Same value, kept as its own role |
| `onPrimary` | `#ffffff` | Text/icons on a primary fill |
| `primaryContainer` | `#d43f00` | Deeper brand fill |
| `primaryFixed` / `onPrimaryFixedVariant` | `#ffdbd0` / `#852400` | Race badge pairs in the calendar |
| `inversePrimary` | `#ffb59e` | - |

### Surfaces

| Token | Value | Used for |
| --- | --- | --- |
| `surface` / `background` | `#f7f9fb` | Every screen background |
| `surfaceContainerLowest` | `#ffffff` | Cards |
| `surfaceContainerLow` | `#f2f4f6` | **Every header background**, tab bar background |
| `surfaceContainer` / `High` / `Highest` | `#eceef0` / `#e6e8ea` / `#e0e3e5` | Avatar letter-fallbacks, inactive switch track, dividers |
| `onSurface` | `#191c1e` | Primary text |
| `onSurfaceVariant` | `#5c4037` | Secondary/muted text, inactive icons |
| `inverseSurface` / `inverseOnSurface` | `#2d3133` / `#eff1f3` | Dark badges (empty-state icon badges, Eboard Meeting calendar badge, countdown pill) |
| `outline` / `outlineVariant` | `#916f65` / `#e6beb2` | Borders |

### Semantic

| Token | Value | Used for |
| --- | --- | --- |
| `secondary` / `secondaryContainer` / `onSecondaryContainer` | `#565e74` / `#dae2fd` / `#5c647a` | Poll badges; `onSecondaryContainer` is the **inactive tab tint** |
| `tertiary` / `tertiaryFixed` | `#005daa` / `#d4e3ff` | Practice events |
| `error` / `onError` / `errorContainer` / `onErrorContainer` | `#ba1a1a` / `#ffffff` / `#ffdad6` / `#93000a` | Destructive actions, `LoadError` text, the **notification badge**, Volunteer events |

Usage rules:

1. **Never hardcode a hex.** The one violation is `components/LegalDocument.tsx`.
2. **Accent = `primary`, always.** No screen introduces its own accent color.
3. **Backgrounds come from the `surface*` ramp**; text from `onSurface` / `onSurfaceVariant`.
4. **Calendar/event type colors are `Record<string, {bg, fg}>` maps** built from theme roles, declared locally in `CalendarScreen.tsx` and `EventsListScreen.tsx` - extend those maps rather than adding new color tokens.

## Radii

| Token | px | Used for |
| --- | --- | --- |
| `sm` | 4 | - |
| `DEFAULT` | 8 | Inputs, small cards |
| `md` | 12 | Cards |
| `lg` | 16 | Larger cards, sheets |
| `xl` | 24 | Empty-state icon badges |
| `full` | 9999 | Pills, FABs, primary buttons, avatars |

Round avatars are the exception: they use an explicit `width/height/borderRadius: width/2` triple (40/20 in headers, larger in profile screens), not `radii.full`.

## Spacing

| Token | px | Used for |
| --- | --- | --- |
| `unit` | 4 | Micro gaps |
| `gutter` | 16 | Horizontal padding, section gaps |
| `marginMobile` | 16 | Screen padding |
| `stackSm` | 8 | Tight vertical rhythm |
| `stackMd` | 24 | Section separation |
| `stackLg` | 48 | Empty-state top margin |

Arithmetic on tokens (`spacing.gutter + 4`, `spacing.stackSm + 2`) is an accepted idiom for one-off nudges.

## Typography

Six roles, each a complete `fontFamily`/`fontSize`/`lineHeight` (and sometimes `letterSpacing`) object designed to be spread: `{...typography.bodyMd, fontSize: 14}`.

| Token | Family | Size / line-height | Used for |
| --- | --- | --- | --- |
| `displayXl` | Anton | 48 / 53, `letterSpacing: 1` | Hero display (rare) |
| `headlineLg` | Anton | 32 / 38 | Large screen titles |
| `headlineLgMobile` | Anton | 28 / 34 | **Every header title** - always spread with a `fontSize` override (17 for club-scoped headers, 20 for tab-root mastheads) |
| `statValue` | Archivo Narrow Bold | 24 / 24 | Numeric emphasis |
| `bodyMd` | Archivo Narrow | 16 / 26 | All body copy |
| `labelSm` | Inter SemiBold | 12 / 12, `letterSpacing: 0.6` | Tab labels, badges, buttons, section labels - usually with `textTransform: "uppercase"` |

### Font loading

Three families via `@expo-google-fonts/*` + `expo-font`, in `app/_layout.tsx`:

```ts
const [antonLoaded]   = useAnton({ Anton_400Regular });
const [archivoLoaded] = useArchivoNarrow({ ArchivoNarrow_400Regular, ArchivoNarrow_700Bold });
const [interLoaded]   = useInter({ Inter_400Regular, Inter_600SemiBold });
```

**The whole tree is gated on all three loading** - `RootLayout` returns a centered `ActivityIndicator` until then - because every restyled screen assumes those families are registered, and rendering earlier would flash system fonts. The `fontFamily` strings in `typography` are exactly the keys registered here; a typo silently falls back to the system font with no error.

## Glass-blur headers

`ChatScreen` and `HighlightsScreen` opt out of the native Stack header (`navigation.setOptions({headerShown: false})`) and render their own `expo-blur` `BlurView` instead:

| Surface | Config | Height |
| --- | --- | --- |
| Chat header | `intensity={80} tint="light"` | `92 + insets.top` |
| Highlights header | `intensity={80} tint="light"` | `76 + insets.top` |
| Pinned-message strip | `intensity={60} tint="light"` | `72`, floating overlay |

Consequences: the list needs manual `paddingTop` (`HEADER_HEIGHT + insets.top + pinnedStripHeight`), safe-area insets come from `useSafeAreaInsets()` rather than the navigator, and the back button has to be reimplemented inline - which is what the `backFallback` prop is for. See [Component inventory](04-component-inventory.md).

Two other visual treatments worth knowing: sent-message bubbles use an `expo-linear-gradient` fill (isolated in a `BubbleContainer` component so `renderItem` never branches between `View` and `LinearGradient` element types), and chat hides the bottom tab bar while open by walking `getParent()` up to the tab navigator.

## Platform-specific quirks

| Quirk | Impact | Workaround |
| --- | --- | --- |
| **react-native-web's `Switch` thumb defaults to teal** (`#009688`) regardless of `trackColor` | An announcement toggle rendered green | `components/ThemedSwitch.tsx` sets `activeThumbColor` + `ios_backgroundColor` explicitly; the props need a `ComponentType<any>` cast since RN's bundled types omit them |
| **`Alert.alert` is a total no-op on web** (`static alert() {}` in react-native-web) | Destructive confirms silently did nothing on web, with zero console errors | Every confirm flow branches: `Platform.OS === "web" ? window.confirm(...) : Alert.alert(...)`. 15 files do this |
| **`crypto.randomUUID()` doesn't exist in Hermes** | Native uploads crashed | `lib/uuid.ts` |
| **RN's Blob polyfill can't convert a `file://` fetch response** | Storage uploads crashed on native (Android in particular) | `lib/uploadBody.ts` - base64 + `base64-arraybuffer` |
| **Web pickers dispatch a synthetic click** | The native file dialog silently didn't open in some browser configs | `lib/pickImageOnWeb.ts` / `lib/pickDocumentOnWeb.ts` - a real `<input>` + real `.click()` |
| **`new Date("YYYY-MM-DD")` parses as UTC midnight** | Date-only values rendered a day early behind UTC | Build the `Date` from split `y/m/d` components - `formatDateOfBirth`, `EventsListScreen`, race date formatters |
| **A two-finger trackpad scroll doesn't scroll a list in the iOS Simulator** | Looks exactly like a broken `FlatList` | Click-and-drag instead; check this before assuming an app bug |

`app.json` pins `userInterfaceStyle: "light"`, so no screen ever renders against a system dark background.

## Invariants

1. **Import tokens from `constants/theme.ts`; never hardcode a color, radius, or font size that a token covers.**
2. **`primary` is `#ff4d00` app-wide.** Do not reintroduce DESIGN.md's `#aa3000`.
3. **Spread typography roles** (`{...typography.bodyMd, fontSize: 14}`) rather than copying their fields.
4. **`fontFamily` strings must match the keys registered in `app/_layout.tsx`** - a mismatch fails silently.
5. **Every header uses `surfaceContainerLow` + `headlineLgMobile` in `primary`.** A new nested Stack must re-declare this, since it inherits nothing from its parent.
6. **Any destructive action needs a `Platform.OS === "web"` `window.confirm` branch.**
7. **Any new toggle uses `ThemedSwitch`, not a bare `Switch`.**
8. **A component that replaces the native header must accept a `backFallback`** and reimplement `canGoBack() ? back() : replace(fallback)`.

## Extension points

- **New semantic color**: add a role to `colors` rather than a literal at the call site; prefer an existing Material role name.
- **New type scale entry**: add to `typography` with a complete family/size/line-height triple, and register any new font weight in `app/_layout.tsx`.
- **New event/badge type**: extend the `BADGE_STYLE` / `BIB_STYLE` maps in `CalendarScreen.tsx` and `EventsListScreen.tsx` with an existing theme pair.
- **Dark mode**: `colors` is a flat named export specifically so a dark variant can be swapped in without touching call sites - but it would need a provider (or a module-level switch) plus flipping `userInterfaceStyle` in `app.json` and the two `tint="light"` `BlurView`s.

## Known gaps

- **Light mode only.** No dark palette exists; `tint="light"` is hardcoded on both blur surfaces.
- **`components/LegalDocument.tsx` hardcodes hex colors** (`#94a3b8`, `#0f172a`, `#334155`) and raw font sizes - the only file bypassing the system.
- **No spacing/type enforcement.** Nothing prevents a literal `padding: 13`; there is no linter in this repo.
- **`displayXl` and `statValue` are near-unused**, so their real-world rendering is unverified.
- **The Highlights / Races / Eboard visual rollout was extrapolated** from the hub's pattern rather than checked against a source mockup - still worth a founder review.
- **No accessibility work**: no `accessibilityLabel`s, no contrast audit, no dynamic-type support (font sizes are fixed px). See [Non-functional requirements](../PRD/12-nonfunctional-requirements.md).
