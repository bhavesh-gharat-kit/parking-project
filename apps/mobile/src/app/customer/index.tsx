/**
 * Customer dashboard (context.txt §9).
 *
 * Phase 03 adds the profile and vehicles entry points. Phases 04-08 fill in
 * the booking flow itself; "Booking history" below is a stub link until
 * Phase 05 gives it something to show.
 */
import { router } from 'expo-router';
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
      </View>

      <View style={styles.menu}>
        <AppButton label="Book parking" onPress={() => router.push('/customer/book')} />
        <AppButton label="My profile" onPress={() => router.push('/customer/profile')} />
        <AppButton
          label="My vehicles"
          variant="secondary"
          onPress={() => router.push('/customer/vehicles')}
        />
        <AppButton
          label="Booking history"
          variant="ghost"
          disabled
          onPress={() => {}}
        />
      </View>

      <ThemedText themeColor="textSecondary">
        Location and package selection are live. Submitting a booking, payment and
        receipt arrive in Phases 05-08.
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
  menu: { gap: Spacing.two },
  spacer: { flex: 1 },
});
