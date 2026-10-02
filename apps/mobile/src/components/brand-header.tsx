/**
 * The company's name and mark, per D-UI1: "Kumar Enterprises" with "Pay and
 * Park" as the tagline below it.
 *
 * This is branding *content*, not the product's identity — the installed app is
 * still called "Pay & Park" (`app.config.ts`'s `VARIANTS`), and nothing here
 * renames it.
 *
 * ── Why a PNG and not an SVG ───────────────────────────────────────────────
 * `brand-mark.png` is generated from `_/brand/logo-mark.svg` by
 * `scripts/generate-app-icons.mjs`, so the header shows the same drawing as the
 * launcher icon by construction rather than by someone remembering to update
 * two files. Rendering the SVG directly would mean adding `react-native-svg`,
 * which is a native module — a dev-client rebuild for a 256px image, on a
 * project whose whole reason for `@expo/vector-icons` over anything else was
 * that it needs no rebuild.
 *
 * The wordmark is deliberately *not* baked into that image: drawn as
 * `ThemedText` it takes the right colour in dark mode and stays crisp at any
 * size. The mark itself is the one thing that is colour-fixed, which is correct
 * — it is the same blue tile on a launcher, a splash and a white card.
 */
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

const MARK = require('@/assets/images/brand-mark.png');

const COMPANY_NAME = 'Kumar Enterprises';
const TAGLINE = 'Pay and Park';

type BrandHeaderProps = {
  /**
   * `large` — centred, for the auth screens, which have no other branding at
   * all and are where a first-time user decides whether this app is real.
   * `compact` — a row, for the top of a dashboard, where the brand sits above
   * content rather than instead of it.
   */
  variant?: 'large' | 'compact';
  style?: StyleProp<ViewStyle>;
};

export function BrandHeader({ variant = 'compact', style }: BrandHeaderProps) {
  const large = variant === 'large';

  return (
    <View
      style={[large ? styles.large : styles.compact, style]}
      // Announced as one unit: "Kumar Enterprises, Pay and Park" rather than as
      // an unlabelled image followed by two stray lines of text.
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${COMPANY_NAME}, ${TAGLINE}`}
    >
      <Image
        source={MARK}
        style={large ? styles.markLarge : styles.markCompact}
        contentFit="contain"
        // The label above already says the company name; the mark repeating it
        // would make TalkBack say it twice.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <View style={large ? styles.textLarge : styles.textCompact}>
        {/* The same `heading` in both variants: what changes between them is
            the layout and the mark's size, not how loudly the company is
            named. At `smallBold` the name sat below the 44pt mark's optical
            weight and the row read as an icon with a caption. */}
        <ThemedText type="heading">{COMPANY_NAME}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {TAGLINE.toUpperCase()}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  large: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  markLarge: {
    width: 72,
    height: 72,
    borderRadius: Radius.large,
  },
  markCompact: {
    width: 44,
    height: 44,
    borderRadius: Radius.control,
  },
  textLarge: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  textCompact: {
    gap: Spacing.half,
  },
});
