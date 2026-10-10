/**
 * A titled break between groups of fields inside a longer screen.
 *
 * The complaint behind this one is "forms/sections not properly styled": the
 * profile and vehicle forms are a flat run of ten labelled inputs with nothing
 * saying where "your details" ends and "your vehicle" begins, so they read as a
 * questionnaire rather than as a form. A rule plus a 20pt title is enough
 * structure to fix that without nesting every group in its own card.
 *
 * Phase UI-02 is the one that puts these into the profile/vehicle forms; it
 * exists here so that session has it to reach for.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionHeaderProps = {
  title: string;
  /** One line under the title — what this group is for, or how to fill it in. */
  description?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /**
   * A rule above the title. Defaults to `true`; pass `false` for the first
   * section on a screen, where there is nothing above it to separate from.
   */
  divided?: boolean;
};

export function SectionHeader({ title, description, icon, divided = true }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {divided ? <Divider /> : null}

      <View style={styles.titleRow}>
        {icon ? <Ionicons name={icon} size={18} color={theme.primary} /> : null}
        {/* `accessibilityRole="header"` is what lets TalkBack jump between
            sections instead of reading every field to get to the next one. */}
        <ThemedText type="heading" accessibilityRole="header">
          {title}
        </ThemedText>
      </View>

      {description ? (
        <ThemedText type="small" themeColor="textSecondary">
          {description}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
