/**
 * Placeholder customer dashboard (context.txt §9).
 *
 * Phases 03-08 replace this with the real flow. What it carries now is the part
 * Phase 02 owes: the signed-in identity, and a way out.
 */
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/auth-store';

export default function CustomerHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Customer</ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{user?.name ?? 'Signed in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Role: {user?.role} — assigned by the backend (context.txt §4)
        </ThemedText>
      </View>

      <ThemedText themeColor="textSecondary">
        Placeholder. Phases 03-08 fill this stack in: profile and vehicles, location and
        package selection, booking summary, UPI/cash payment, booking history and the
        digital receipt.
      </ThemedText>

      <View style={styles.spacer} />

      <AppButton label="Sign out" variant="secondary" onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  card: {
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  spacer: { flex: 1 },
});
