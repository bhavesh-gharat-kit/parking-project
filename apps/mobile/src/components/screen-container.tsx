/**
 * Shared wrapper for the "list/content plus one action button pinned to the
 * bottom of a `flex: 1` screen" shape used across the app (Phase 12).
 *
 * Without this, the bottom button sits flush against the screen edge, which on
 * Android is the system navigation bar — the button paints as full height but
 * its real tappable area is squeezed to a few pixels above the nav bar
 * (`_/docs/01-ui-ux-findings.md`, "P0 — Bottom buttons and form fields get
 * hidden"). `useSafeAreaInsets()` reports that reserved height so it can be
 * added to the screen's own bottom padding instead of the padding being
 * replaced by it.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScreenContainerProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

export function ScreenContainer({ children, style }: ScreenContainerProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingBottom: Spacing.four + insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
