import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placeholder admin dashboard (context.txt §19-20). */
export default function AdminHomeScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Admin</ThemedText>
      <ThemedText themeColor="textSecondary">
        Placeholder. Phases 04, 07 and 10 fill this stack in: booking approval queue, UPI
        verification, cash approval, rates and locations, revenue and reports.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
