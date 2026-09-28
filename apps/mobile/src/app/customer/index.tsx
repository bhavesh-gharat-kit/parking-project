import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placeholder customer dashboard (context.txt §9). */
export default function CustomerHomeScreen() {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Customer</ThemedText>
      <ThemedText themeColor="textSecondary">
        Placeholder. Phases 03-08 fill this stack in: profile and vehicles, location and
        package selection, booking summary, UPI/cash payment, booking history and the
        digital receipt.
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
