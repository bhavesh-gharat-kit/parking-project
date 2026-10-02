/**
 * The app's one card surface.
 *
 * `receipt.tsx`, `upi.tsx` and `customer/index.tsx` each had a local
 * `styles.card` that was the same three properties — `backgroundElement`,
 * `CardShadow`, `borderRadius: 12` — written out again, which is three places
 * to miss when the radius or the elevation changes. This is that shape, once.
 *
 * `padded={false}` is for the one real variation: a card whose children are
 * full-bleed rows with their own padding (the receipt's label/value list), where
 * padding on the card itself would inset the row dividers.
 */
import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { CardShadow, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  /** Defaults to `true`. Set `false` for full-bleed children. */
  padded?: boolean;
}>;

export function Card({ children, style, padded = true }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement },
        padded && styles.padded,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...CardShadow,
    borderRadius: Radius.surface,
  },
  padded: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
});
