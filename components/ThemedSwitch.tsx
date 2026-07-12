import type { ComponentType } from "react";
import { Switch, type SwitchProps } from "react-native";
import { colors } from "../constants/theme";

// react-native-web's Switch supports activeThumbColor/ios_backgroundColor
// at runtime (node_modules/react-native-web/src/exports/Switch) but RN's
// own bundled type declarations don't include them, hence the cast.
// Without activeThumbColor set explicitly, react-native-web's "on" thumb
// silently defaults to teal (#009688) regardless of trackColor — caught
// live when a founder flagged an announcement toggle turning green.
const AnySwitch = Switch as ComponentType<any>;

export function ThemedSwitch(props: SwitchProps) {
  return (
    <AnySwitch
      trackColor={{ false: colors.surfaceContainerHigh, true: colors.primary }}
      thumbColor={colors.onPrimary}
      activeThumbColor={colors.onPrimary}
      ios_backgroundColor={colors.surfaceContainerHigh}
      {...props}
    />
  );
}
