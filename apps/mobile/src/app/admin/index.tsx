/**
 * Placeholder admin dashboard (context.txt §19-20).
 *
 * Phase 10 fills in the real dashboard — today's bookings, revenue, and so on.
 * For now this carries the identity, a way out, and links into Phase 04's
 * location management and Phase 07's booking queue and user management.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuthStore } from '@/stores/auth-store';

export default function AdminHomeScreen() {
  const theme = useTheme();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText type="subtitle">Admin</ThemedText>

      <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">{user?.name ?? 'Signed in'}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {user?.email}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Role: {user?.role}
        </ThemedText>
      </View>

      <AppButton label="Booking approvals" onPress={() => router.push('/admin/bookings')} />
      <AppButton label="Users" onPress={() => router.push('/admin/users')} />
      <AppButton
        label="Locations & rates"
        variant="secondary"
        onPress={() => router.push('/admin/locations')}
      />

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
