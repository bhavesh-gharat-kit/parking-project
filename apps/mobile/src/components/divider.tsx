/**
 * A hairline rule, optionally with a word sitting in it.
 *
 * The labelled form ("or" between the password and Google buttons) was three
 * nested views and two style objects written inline in `sign-in.tsx`; sign-up
 * has the same thing copied. The plain form is for separating groups of fields
 * inside a long form, which is what `01-ui-ux-findings.md` means by "no dividers
 * beyond hairlines".
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DividerProps = {
  /** Centres this word in a gap in the rule — "or", "then". */
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function Divider({ label, style }: DividerProps) {
  const theme = useTheme();
  const rule = <View style={[styles.rule, { backgroundColor: theme.border }]} />;

  if (!label) {
    // Decorative: a screen reader announcing "horizontal rule" between two
    // groups of fields adds nothing.
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.standalone, { backgroundColor: theme.border }, style]}
      />
    );
  }

  return (
    <View style={[styles.row, style]}>
      {rule}
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {rule}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Inside the labelled row the rule shares the width with the label, so it
  // grows; on its own it spans whatever it is laid into.
  rule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  standalone: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
  },
});
